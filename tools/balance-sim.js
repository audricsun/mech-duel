#!/usr/bin/env node
'use strict';
/* =========================================================================
 * 机甲对决 · 平衡性批量模拟器  (tools/balance-sim.js)
 * -------------------------------------------------------------------------
 * 用法:
 *   node tools/balance-sim.js [--runs N] [--cap SEC] [--diff 0|1|2] [--seed N] [--jobs N]
 *                             [--save PATH] [--compare PATH] [--matrix] [--quiet] [--json]
 *
 * 并行:
 *   默认按 CPU 核数 fork 子进程,把有序配对按泳道切分后并行计算,主进程只做归并。
 *   每个配对自带独立播种,故并行结果与单进程逐位一致(--jobs 1 可强制单进程)。
 *   带 patch/chars 的调参调用会自动退回单进程(函数无法跨进程传递)。
 *
 * 原理:
 *   读取同目录上层的 index.html,按文档顺序收集其中的游戏 <script> 源码
 *   (内联块直接取用,<script src> 则读取 js/ 下的模块文件;SEO 用的
 *   application/ld+json 数据块会被跳过),拼成单一源码后,在 Node 中用一个
 *   极简的 DOM/Canvas 桩环境执行它,再从沙箱里取回 { game, updateGame }。
 *   随后把 game.mode 置为 3(观赏模式:双方 CPU、无地图机关、无回合倒计时),
 *   以固定步长 updateGame(1/60) 驱动直到分出胜负 —— 即真实游戏引擎的结算,
 *   不使用任何解析近似模型。
 *
 *   为了让「同一脚本、不同版本」之间的对比可复现,内置 mulberry32 伪随机数
 *   生成器,并把它注入沙箱内的 Math(每场按 seed+配对+序号重新播种),
 *   因此同样的 seed 会得到逐帧一致的模拟结果。
 *
 * 验收指标(与用户目标一致):
 *   · 全角色胜率是否压进 40%~60%   → summary.within4060
 *   · 硬克制对(单边胜率≥90%)占比 → summary.hardPct(目标 <20%)
 *   · 隐蔽角色(天罚/湮灭)略强      → 见验③,期望胜率 52%~58%
 *   · 高频短时获胜(疑似超模技能)   → summary.fastWinRate / 逐角色 fastWinPct
 *
 * 快速获胜口径:
 *   单场总帧数 < FAST_WIN_SEC*60 即判为「速胜」,分别统计胜方平均用时与速胜占比。
 *   某角色速胜占比显著高于平均,通常意味着它拥有一个超平均强度的技能(或兵装)。
 * ========================================================================= */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME_HTML = path.join(ROOT, 'index.html');

// 默认并行度:CPU 核数(可用 --jobs 覆盖)
const DEFAULT_JOBS = Math.max(1, os.cpus().length);

// 速胜阈值(秒):一局在此时长内结束即计入「快速获胜」
// 本游戏自然节奏约 8~15s/局,故「极短时间」取显著低于该区间的 8s;可用 --fast 覆盖
let FAST_WIN_SEC = 8;
// 疑似超模告警线:某角色速胜占比超过此值即需人工核查其技能强度
const FAST_WIN_WARN = 0.25;
// 隐蔽角色名单(目标是略强于其他角色)
const HIDDEN_NAMES = ['天罚', '湮灭'];
const HIDDEN_TARGET = [0.52, 0.58];

/* ------------------------- 伪随机数(可复现) ------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------- 桩环境 ------------------------- */
function makeCtx(canvasEl) {
  const grad = { addColorStop() {} };
  const target = {};
  return new Proxy(target, {
    get(t, k) {
      if (k === 'canvas') return canvasEl;
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => grad;
      if (k === 'createPattern') return () => ({});
      if (k === 'getImageData' || k === 'createImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'isPointInPath') return () => false;
      if (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf') return () => '';
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeCanvasEl() {
  const el = {
    width: 960, height: 540, style: {},
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { width: 960, height: 540, left: 0, top: 0, right: 960, bottom: 540 }; },
  };
  el.getContext = () => makeCtx(el);
  return el;
}

/**
 * 按文档顺序收集 index.html 中的游戏脚本源码并拼接为单一源码串。
 * - 内联 <script>…</script>:直接取其正文
 * - 外链 <script src="…">:读取相对 index.html 的模块文件
 * - <script type="application/ld+json"> 等数据块:跳过
 * 拼接后的源码与原单文件脚本处于同一（全局）作用域,行为等价。
 */
function collectGameSource(html) {
  const parts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
    const src = attrs.match(/src\s*=\s*["']([^"']+)["']/);
    if (src) {
      const file = path.resolve(ROOT, src[1]);
      if (!fs.existsSync(file)) throw new Error('index.html 引用的脚本不存在: ' + src[1]);
      parts.push(fs.readFileSync(file, 'utf8'));
    } else {
      parts.push(m[2]);
    }
  }
  if (!parts.length) throw new Error('未能在 index.html 中找到游戏 <script> 源码');
  return parts.join('\n;\n');
}

/**
 * 载入游戏源码并返回沙箱 API。
 * @param {object} [opts]
 * @param {number} [opts.seed] 初次播种的随机种子(影响地图等一次性随机)
 */
function loadGame(opts) {
  opts = opts || {};
  const html = fs.readFileSync(GAME_HTML, 'utf8');
  const SRC = collectGameSource(html);

  // 注入沙箱的 Math:原型沿用真实 Math,仅 random 可被替换,保证确定性
  const MathStub = Object.create(Math);
  MathStub.random = mulberry32(opts.seed === undefined ? 12345 : opts.seed);

  const canvasEl = makeCanvasEl();
  const documentStub = {
    getElementById: (id) => (id === 'cv' ? canvasEl : null),
    createElement: () => makeCanvasEl(),
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {} },
  };
  const storage = (() => {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
      clear: () => mem.clear(),
    };
  })();
  const windowStub = {
    devicePixelRatio: 1, innerWidth: 960, innerHeight: 540,
    addEventListener() {}, removeEventListener() {},
    // 不提供 AudioContext → AC 恒为 null → 全部音效函数提前 return
  };

  const EXPORTS = '{CHARS,DIFFS,MAPS,WEAPONS,MELEE_WEP,SKILLS,SKILL_RATING,game,updateGame,charUnlocked,storyProg,balanceReport,balanceOf,bossChar,STORY}';
  const factory = new Function(
    'window', 'document', 'localStorage', 'requestAnimationFrame', 'performance',
    'addEventListener', 'removeEventListener', 'Math',
    SRC + '\n;return ' + EXPORTS + ';'
  );
  const api = factory(
    windowStub, documentStub, storage,
    () => 0, { now: () => 0 },
    () => {}, () => {}, MathStub
  );
  api.__MathStub = MathStub;
  api.__reseed = (s) => { MathStub.random = mulberry32(s >>> 0); };
  return api;
}

/* ------------------------- 单场模拟 ------------------------- */
/**
 * 驱动一场 1v1 对战直到结束。
 * @returns {{winner:0|1|null, capped:boolean, frames:number, taken:[number,number]}}
 */
function playMatch(api, A, B, diffIdx, capFrames) {
  const { game, updateGame, DIFFS } = api;
  game.mode = 3;
  game.storyMode = false;
  game.pause = false;
  game.diffObj = DIFFS[diffIdx];
  game.mapIdx = 0;
  game.timer = 9999;
  game.select = { cursor: 0, idx1: A, idx2: B, phase: 'vs', t: 0, pickT: 0 };
  game.setupMatch();

  const mechs = game.mechs;
  const prev = [mechs[0].maxHp, mechs[1].maxHp];
  const taken = [0, 0];
  let frames = 0, fightSeen = 0, restarted = false, capped = false;

  while (true) {
    updateGame(1 / 60);
    frames++;
    for (let i = 0; i < 2; i++) {
      const d = prev[i] - mechs[i].hp;
      if (d > 0) taken[i] += d;
      prev[i] = mechs[i].hp;
    }
    if (game.state === 'fight') fightSeen = 1;
    if (game.state === 'end') break;
    if (fightSeen && game.state === 'intro') { restarted = true; break; }  // 同归于尽 → 重开
    if (frames >= capFrames) { capped = true; break; }
  }

  let winner = null;
  if (game.state === 'end' && game.spectateWinner) {
    winner = game.spectateWinner === mechs[0] ? 0 : 1;
  } else if (capped || restarted) {
    // 超时/僵持或同归于尽:按剩余血量百分比判优(±2% 内算平)
    const p = [mechs[0].hp / mechs[0].maxHp, mechs[1].hp / mechs[1].maxHp];
    if (Math.abs(p[0] - p[1]) > 0.02) winner = p[0] > p[1] ? 0 : 1;
  }
  return { winner, capped, frames, taken };
}

/* ------------------------- 配对统计(可在子进程执行) ------------------------- */
/**
 * 跑完单个有序配对 (a→b) 的全部场次,返回该配对的原始统计。
 * 累计量以整数和保留(前缀 _),供跨进程归并;展示字段另行四舍五入。
 */
function computePair(api, a, b, runs, diffIdx, capFrames, seed, names) {
  let aw = 0, bw = 0, dr = 0, cap = 0, fr = 0, d0 = 0, d1 = 0;
  let awf = 0, bwf = 0, afast = 0, bfast = 0;
  const fastFrames = FAST_WIN_SEC * 60;
  for (let r = 0; r < runs; r++) {
    // 逐场重播种:配对与序号参与派生,保证不同配对/不同 run 相互独立又可复现
    api.__reseed((seed ^ (a * 7919 + b * 104729 + r * 2654435761)) >>> 0);
    const res = playMatch(api, a, b, diffIdx, capFrames);
    fr += res.frames;
    d0 += res.taken[1];   // a 对 b 造成的总伤害 = b 承受的伤害
    d1 += res.taken[0];
    if (res.capped) cap++;
    if (res.winner === 0) { aw++; awf += res.frames; if (res.frames < fastFrames) afast++; }
    else if (res.winner === 1) { bw++; bwf += res.frames; if (res.frames < fastFrames) bfast++; }
    else dr++;
  }
  return {
    a, b, aName: names[a], bName: names[b], games: runs,
    aWin: aw, bWin: bw, draws: dr, capped: cap,
    avgDur: +(fr / runs / 60).toFixed(2), aDeal: Math.round(d0 / runs), bDeal: Math.round(d1 / runs),
    aWinDur: aw ? +(awf / aw / 60).toFixed(2) : null, bWinDur: bw ? +(bwf / bw / 60).toFixed(2) : null,
    aFastWin: afast, bFastWin: bfast,
    _fr: fr, _d0: d0, _d1: d1, _awf: awf, _bwf: bwf,   // 归并用的整数原始和
  };
}

/* ------------------------- 归并汇总 ------------------------- */
/** 由配对结果列表汇总出逐角色 agg / 胜率矩阵 / summary。 */
function aggregate(names, locked, pairs, meta) {
  const N = names.length;
  const agg = names.map((name, i) => ({
    i, name, locked: !!locked[i],
    games: 0, wins: 0, losses: 0, draws: 0,
    dealt: 0, takenTotal: 0, frames: 0, capCount: 0,
    winFrames: 0, fastWins: 0,
  }));
  const matrix = Array.from({ length: N }, () => new Array(N).fill(null));

  for (const p of pairs) {
    matrix[p.a][p.b] = +(p.aWin / p.games).toFixed(4);
    const A = agg[p.a], B = agg[p.b];
    A.games += p.games; A.wins += p.aWin; A.draws += p.draws; A.frames += p._fr; A.capCount += p.capped;
    A.dealt += p._d0; A.takenTotal += p._d1; A.winFrames += p._awf; A.fastWins += p.aFastWin;
    B.games += p.games; B.wins += p.bWin; B.draws += p.draws; B.frames += p._fr; B.capCount += p.capped;
    B.dealt += p._d1; B.takenTotal += p._d0; B.winFrames += p._bwf; B.fastWins += p.bFastWin;
  }

  for (const s of agg) {
    s.winRate = +(s.wins / s.games).toFixed(4);
    s.avgDeal = +(s.dealt / s.games).toFixed(1);
    s.avgTake = +(s.takenTotal / s.games).toFixed(1);
    s.avgDur = +(s.frames / s.games / 60).toFixed(2);
    s.avgWinDur = s.wins ? +(s.winFrames / s.wins / 60).toFixed(2) : null;
    s.fastWinPct = s.wins ? +(s.fastWins / s.wins).toFixed(4) : 0;
  }

  const rates = agg.map((s) => s.winRate);
  const mean = rates.reduce((x, y) => x + y, 0) / N;
  const std = Math.sqrt(rates.reduce((x, y) => x + (y - mean) ** 2, 0) / N);
  const hardPairs = pairs.filter((p) => p.aWin / p.games >= 0.9 || p.aWin / p.games <= 0.1);

  // 快速获胜汇总:全部胜场里落在 FAST_WIN_SEC 内的比例
  const totalWins = agg.reduce((x, s) => x + s.wins, 0);
  const totalFast = agg.reduce((x, s) => x + s.fastWins, 0);
  const fastWinRate = totalWins ? +(totalFast / totalWins).toFixed(4) : 0;
  // 疑似超模角色:速胜占比超告警线者
  const fastSuspects = agg.filter((s) => s.fastWinPct >= FAST_WIN_WARN)
    .map((s) => s.name + '(' + (s.fastWinPct * 100).toFixed(1) + '%)');
  // 隐藏角色相对其他角色的平均胜率差
  const hiddenRates = agg.filter((s) => HIDDEN_NAMES.includes(s.name)).map((s) => s.winRate);
  const otherRates = agg.filter((s) => !HIDDEN_NAMES.includes(s.name)).map((s) => s.winRate);
  const otherMean = otherRates.reduce((x, y) => x + y, 0) / (otherRates.length || 1);
  const hiddenMean = hiddenRates.length ? hiddenRates.reduce((x, y) => x + y, 0) / hiddenRates.length : 0;

  const summary = {
    diff: meta.diff, diffName: meta.diffName, runsPerPair: meta.runs, seed: meta.seed,
    jobs: meta.jobs, capSec: meta.capFrames / 60, matches: pairs.reduce((x, p) => x + p.games, 0),
    mean: +mean.toFixed(4), std: +std.toFixed(4),
    min: +Math.min(...rates).toFixed(4), max: +Math.max(...rates).toFixed(4),
    rangePP: +((Math.max(...rates) - Math.min(...rates)) * 100).toFixed(1),
    within4060: rates.filter((r) => r >= 0.4 && r <= 0.6).length,
    hardCount: hardPairs.length, hardTotal: pairs.length,
    hardPct: +((hardPairs.length / pairs.length) * 100).toFixed(1),
    koCount: pairs.reduce((x, p) => x + p.aWin + p.bWin, 0),
    drawCount: pairs.reduce((x, p) => x + p.draws, 0),
    cappedCount: pairs.reduce((x, p) => x + p.capped, 0),
    fastWinSec: FAST_WIN_SEC, fastWinRate, fastWins: totalFast, fastSuspects,
    hiddenMean: +hiddenMean.toFixed(4), otherMean: +otherMean.toFixed(4),
    hiddenEdgePP: +((hiddenMean - otherMean) * 100).toFixed(1),
    hiddenInBand: hiddenRates.filter((r) => r >= HIDDEN_TARGET[0] && r <= HIDDEN_TARGET[1]).length,
  };

  // 剔除进程归并用的内部字段,输出干净结果
  const cleanPairs = pairs.map(({ _fr, _d0, _d1, _awf, _bwf, ...rest }) => rest);
  return {
    meta: Object.assign({ source: 'index.html', chars: names, generatedAt: new Date().toISOString() },
      meta.tag || {}),
    chars: agg, matrix, pairs: cleanPairs, summary,
  };
}

/** 生成全部有序配对 [[a,b], ...] */
function buildPairs(N) {
  const out = [];
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (a !== b) out.push([a, b]);
  return out;
}

/** 准备一个解锁全部机体、可用的沙箱(单进程路径)。 */
function prepareApi(o, seed) {
  const api = loadGame({ seed });
  api.storyProg.cleared = 999;                 // 解锁全部机体(含隐藏)
  // 试算钩子:允许外部在开跑前直接改写 CHARS / WEAPONS / MELEE_WEP,
  // 用于在不改动 index.html 的前提下搜索数值
  if (typeof o.patch === 'function') o.patch(api);
  if (o.chars) { api.CHARS.length = 0; o.chars.forEach((c) => api.CHARS.push(c)); }
  return api;
}

/* ------------------------- 全量模拟(单进程) ------------------------- */
/**
 * 单进程跑完所有机体的排列组合。带 patch/chars 的调参调用必须走此路径。
 * @param {object} o {runs,cap(sec),diff,seed}
 */
function simulate(o) {
  o = o || {};
  const runs = o.runs || 300;
  const capFrames = Math.round((o.cap === undefined ? 90 : o.cap) * 60);
  const diffIdx = o.diff === undefined ? 1 : o.diff;
  const seed = (o.seed === undefined ? 12345 : o.seed) >>> 0;

  const api = prepareApi(o, seed);
  const names = api.CHARS.map((c) => c.name);
  const locked = api.CHARS.map((c) => !!c.locked);
  const pairs = buildPairs(names.length);
  const results = pairs.map(([a, b]) => computePair(api, a, b, runs, diffIdx, capFrames, seed, names));
  return aggregate(names, locked, results,
    { diff: diffIdx, diffName: api.DIFFS[diffIdx].name, runs, seed, jobs: 1, capFrames, tag: {} });
}

/* ------------------------- 全量模拟(多进程) ------------------------- */
/** 把配对按轮转方式均分到 jobs 条泳道,尽量让每个 worker 负载均衡。 */
function splitLanes(pairs, jobs) {
  const lanes = Array.from({ length: Math.min(jobs, pairs.length) }, () => []);
  pairs.forEach((p, i) => lanes[i % lanes.length].push(p));
  return lanes;
}

/** 为每个 worker 分配一条泳道并回收结果。 */
function runWorkers(jobBase, lanes) {
  return new Promise((resolve, reject) => {
    const results = [];
    const kids = [];
    let replied = 0, failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      for (const c of kids) { try { c.kill(); } catch (_) {} }
      reject(err);
    };
    for (const lane of lanes) {
      const cp = fork(__filename, ['--worker'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      kids.push(cp);
      cp.on('message', (msg) => {
        if (!failed && msg && msg.ok) results.push(...msg.pairs);
        else if (!msg || !msg.ok) return fail(new Error('worker 失败: ' + (msg && msg.error)));
        // worker 回传后仍驻留监听,故此处主动断开并结束它
        if (++replied === lanes.length) {
          for (const c of kids) { try { c.kill(); } catch (_) {} }
          resolve(results);
        }
      });
      cp.on('error', fail);
      cp.on('exit', (code) => { if (code !== 0 && replied < lanes.length) fail(new Error('worker 异常退出 code=' + code)); });
      cp.send(Object.assign({}, jobBase, { pairs: lane }));
    }
  });
}

/**
 * 多进程全量模拟:主进程只负责切分/归并,子进程各自载入一次性沙箱并跑一段泳道。
 * 带 patch/chars 的调用自动退回单进程(函数无法跨进程传递)。
 * @returns {Promise<object>} 与 simulate 同构的结果
 */
async function simulateMulti(o) {
  o = o || {};
  const jobs = Math.max(1, o.jobs || DEFAULT_JOBS);
  if (jobs === 1 || typeof o.patch === 'function' || o.chars) return simulate(o);   // 退回单进程

  const runs = o.runs || 300;
  const capFrames = Math.round((o.cap === undefined ? 90 : o.cap) * 60);
  const diffIdx = o.diff === undefined ? 1 : o.diff;
  const seed = (o.seed === undefined ? 12345 : o.seed) >>> 0;

  // 主进程先载入一次,只为取机体名单/AI 难度名(与 worker 同源,顺序一致)
  const probe = loadGame({ seed });
  probe.storyProg.cleared = 999;
  const names = probe.CHARS.map((c) => c.name);
  const locked = probe.CHARS.map((c) => !!c.locked);
  const diffName = probe.DIFFS[diffIdx].name;

  const pairs = buildPairs(names.length);
  const lanes = splitLanes(pairs, jobs);
  const results = await runWorkers({ runs, capFrames, diff: diffIdx, seed, names }, lanes);
  return aggregate(names, locked, results,
    { diff: diffIdx, diffName, runs, seed, jobs: lanes.length, capFrames, tag: {} });
}

/* ------------------------- 输出 ------------------------- */
const pct = (v) => (v * 100).toFixed(1) + '%';

function printReport(res, opts) {
  opts = opts || {};
  const s = res.summary;
  const line = '─'.repeat(72);
  console.log('\n' + line);
  console.log('机甲对决 · 平衡性模拟报告   (AI 难度:' + s.diffName + ' / 每对位 ' + s.runsPerPair +
    ' 场 / 共 ' + s.matches + ' 场 / seed ' + s.seed + ')');
  console.log(line);
  console.log(' 角色      胜率     场次   场均伤害  场均承伤  场均时长  胜场均时  速胜%  超时');
  console.log(line);
  const rows = res.chars.slice().sort((a, b) => b.winRate - a.winRate);
  for (const r of rows) {
    const flag = r.winRate < 0.4 ? ' ▲弱' : r.winRate > 0.6 ? ' ▼强' : '  ✓';
    const hid = HIDDEN_NAMES.includes(r.name) ? '★' : ' ';
    const fastFlag = r.fastWinPct >= FAST_WIN_WARN ? ' ⚡' : '';
    console.log(
      hid + r.name.padEnd(6, '　') + (r.winRate * 100).toFixed(1).padStart(6) + '%' +
      String(r.games).padStart(8) + String(r.avgDeal).padStart(10) + String(r.avgTake).padStart(10) +
      (r.avgDur.toFixed(1) + 's').padStart(10) +
      ((r.avgWinDur === null ? '—' : r.avgWinDur.toFixed(1) + 's')).padStart(9) +
      (r.fastWinPct * 100).toFixed(1).padStart(7) + String(r.capCount).padStart(6) + flag + fastFlag
    );
  }
  console.log(line);
  console.log(' 极差 ' + s.rangePP + 'pp   平均 ' + pct(s.mean) + '   标准差 ' + (s.std * 100).toFixed(1) + 'pp');
  console.log(' 验收① 胜率 ∈[40%,60%] 的角色: ' + s.within4060 + '/' + res.chars.length +
    (s.within4060 === res.chars.length ? '  ✓ 达标' : '  ✗ 未达标'));
  console.log(' 验收② 硬克制对(单边≥90%): ' + s.hardCount + '/' + s.hardTotal + ' = ' + s.hardPct + '%' +
    (s.hardPct < 20 ? '  ✓ 达标' : '  ✗ 未达标(目标<20%)'));
  console.log(' 验收③ 隐蔽角色(' + HIDDEN_NAMES.join('/') + ') 均值 ' + pct(s.hiddenMean) +
    ' / 其余均值 ' + pct(s.otherMean) + ' / 领先 ' + (s.hiddenEdgePP >= 0 ? '+' : '') + s.hiddenEdgePP + 'pp' +
    ' / 落在 52~58% 的: ' + s.hiddenInBand + '/' + HIDDEN_NAMES.length +
    (s.hiddenInBand === HIDDEN_NAMES.length ? '  ✓ 达标' : '  ✗ 未达标'));
  console.log(' 验收④ 快速获胜(<' + s.fastWinSec + 's): ' + (s.fastWinRate * 100).toFixed(1) + '% (' +
    s.fastWins + '/' + s.koCount + ' 胜场)' +
    (s.fastSuspects.length ? '   疑超模: ' + s.fastSuspects.join(' ') + '  ⚡需核查' : '   ✓ 无异常'));
  console.log(' 结束方式: KO ' + s.koCount + ' / 超时判优 ' + s.cappedCount + ' / 平局 ' + s.drawCount);
  console.log(line);

  // 速胜最集中的对位(定位到「谁 在极短时间内 打爆了谁」)
  // 每个无序对位由两条有序记录组成(a→b 与 b→a),此处按键合并并加权用时
  const aggPair = new Map();
  const bump = (who, whom, n, win, dur) => {
    if (!n) return;
    const k = who + '>' + whom;
    const e = aggPair.get(k) || { who, whom, n: 0, win: 0, durSum: 0, durW: 0 };
    e.n += n; e.win += win;
    if (dur !== null) { e.durSum += dur * n; e.durW += n; }
    aggPair.set(k, e);
  };
  for (const p of res.pairs) {
    bump(p.aName, p.bName, p.aFastWin, p.aWin, p.aWinDur);
    bump(p.bName, p.aName, p.bFastWin, p.bWin, p.bWinDur);
  }
  const fastPairs = [...aggPair.values()]
    .filter((x) => x.n >= 3)
    .sort((x, y) => y.n - x.n)
    .slice(0, 8);
  if (fastPairs.length) {
    console.log(' 速胜最集中对位(<' + s.fastWinSec + 's 取胜):');
    for (const p of fastPairs) {
      const pctOf = p.win ? (p.n / p.win * 100).toFixed(0) + '%' : '—';
      console.log('   · ' + (p.who + ' → ' + p.whom).padEnd(16, '　') +
        ' 速胜 ' + String(p.n).padStart(3) + '/' + String(p.win).padEnd(3) + ' (' + pctOf.padStart(4) + ')' +
        '   均用时 ' + (p.durW ? (p.durSum / p.durW).toFixed(1) : '—') + 's');
    }
    console.log(line);
  }

  if (opts.matrix) {
    console.log('\n对位胜率矩阵(行=左方胜率,列=右方):');
    const w = 6;
    let head = '        ';
    for (const nm of res.meta.chars) head += nm.padStart(w + 2, ' ');
    console.log(head);
    for (let i = 0; i < res.matrix.length; i++) {
      let row = res.meta.chars[i].padEnd(6, '　') + ' ';
      for (let j = 0; j < res.matrix[i].length; j++) {
        const v = res.matrix[i][j];
        row += (v === null ? '   —  ' : (v * 100).toFixed(0).padStart(5) + '% ').padStart(w + 2, ' ');
      }
      console.log(row);
    }
  }
}

function printCompare(base, after) {
  const line = '─'.repeat(72);
  console.log('\n' + line);
  console.log('回归对比   baseline → after');
  console.log(line);
  const bmap = new Map(base.chars.map((c) => [c.name, c]));
  console.log(' 角色      基线胜率   本轮胜率     变化   基速胜%  轮速胜%');
  console.log(line);
  for (const c of after.chars.slice().sort((a, b) => b.winRate - a.winRate)) {
    const b = bmap.get(c.name);
    if (!b) continue;
    const d = (c.winRate - b.winRate) * 100;
    const ds = (d >= 0 ? '+' : '') + d.toFixed(1) + 'pp';
    const tag = c.winRate < 0.4 ? ' ▲弱' : c.winRate > 0.6 ? ' ▼强' : '  ✓';
    const hid = HIDDEN_NAMES.includes(c.name) ? '★' : ' ';
    const bf = (b.fastWinPct === undefined ? 0 : b.fastWinPct) * 100;
    console.log(hid + c.name.padEnd(6, '　') + pct(b.winRate).padStart(9) + pct(c.winRate).padStart(11) + ds.padStart(11) +
      bf.toFixed(1).padStart(9) + (c.fastWinPct * 100).toFixed(1).padStart(9) + tag);
  }
  console.log(line);
  const bs = base.summary, as = after.summary;
  console.log(' 极差     ' + (bs.rangePP + 'pp').padStart(9) + (as.rangePP + 'pp').padStart(11) +
    ((as.rangePP - bs.rangePP >= 0 ? '+' : '') + (as.rangePP - bs.rangePP).toFixed(1) + 'pp').padStart(11));
  console.log(' 标准差   ' + ((bs.std * 100).toFixed(1) + 'pp').padStart(9) + ((as.std * 100).toFixed(1) + 'pp').padStart(11) +
    (((as.std - bs.std) * 100 >= 0 ? '+' : '') + ((as.std - bs.std) * 100).toFixed(1) + 'pp').padStart(11));
  console.log(' 区间内   ' + (bs.within4060 + '/' + base.chars.length).padStart(9) + (as.within4060 + '/' + after.chars.length).padStart(11));
  console.log(' 硬克制   ' + (bs.hardCount + '/' + bs.hardTotal + ' ' + bs.hardPct + '%').padStart(9) +
    (as.hardCount + '/' + as.hardTotal + ' ' + as.hardPct + '%').padStart(11));
  const bhm = bs.hiddenMean === undefined ? '—' : pct(bs.hiddenMean);
  console.log(' 隐均胜率 ' + bhm.padStart(9) + pct(as.hiddenMean).padStart(11) +
    (as.hiddenEdgePP === undefined ? '' : (' 领先' + (as.hiddenEdgePP >= 0 ? '+' : '') + as.hiddenEdgePP + 'pp').padStart(11)));
  const bfw = bs.fastWinRate === undefined ? '—' : pct(bs.fastWinRate);
  console.log(' 速胜占比 ' + bfw.padStart(9) + pct(as.fastWinRate).padStart(11));
  console.log(line);

  // 只在基线里是硬克制、而本轮解除了的对位
  const key = (p) => p.aName + '>' + p.bName;
  const bHard = new Map(base.pairs.filter((p) => p.aWin / p.games >= 0.9 || p.aWin / p.games <= 0.1).map((p) => [key(p), p]));
  const aHard = new Map(after.pairs.filter((p) => p.aWin / p.games >= 0.9 || p.aWin / p.games <= 0.1).map((p) => [key(p), p]));
  const fixed = [...bHard.keys()].filter((k) => !aHard.has(k));
  const broke = [...aHard.keys()].filter((k) => !bHard.has(k));
  if (fixed.length) console.log(' 已解除的硬克制 (' + fixed.length + '): ' + fixed.join('  '));
  if (broke.length) console.log(' 新增的硬克制 (' + broke.length + '): ' + broke.join('  '));
  console.log(line);
}

/* ------------------------- CLI ------------------------- */
function parseArgs(argv) {
  const o = { diff: 1, runs: 300, cap: 90, seed: 12345, fast: null, matrix: false, quiet: false, json: false,
    save: null, compare: null, jobs: null, worker: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--runs') o.runs = parseInt(next(), 10);
    else if (k === '--cap') o.cap = parseFloat(next());
    else if (k === '--diff') o.diff = parseInt(next(), 10);
    else if (k === '--seed') o.seed = parseInt(next(), 10);
    else if (k === '--fast') o.fast = parseFloat(next());
    else if (k === '--jobs') o.jobs = parseInt(next(), 10);
    else if (k === '--save') o.save = next();
    else if (k === '--compare') o.compare = next();
    else if (k === '--matrix') o.matrix = true;
    else if (k === '--quiet') o.quiet = true;
    else if (k === '--json') o.json = true;
    else if (k === '--worker') o.worker = true;
    else if (k === '-h' || k === '--help') { o.help = true; }
    else if (!k.startsWith('--')) o.compare = o.compare || k;
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log('用法: node tools/balance-sim.js [--runs N] [--cap SEC] [--diff 0|1|2] [--seed N] [--jobs N]\n' +
      '                              [--save PATH] [--compare PATH] [--matrix] [--quiet] [--json]\n\n' +
      '  --runs N       每对位模拟场数         (默认 300)\n' +
      '  --cap SEC      单场上限秒数,超时按血量判优 (默认 90)\n' +
      '  --diff 0|1|2   AI 难度 简单/普通/困难 (默认 1)\n' +
      '  --seed N       随机种子,决定逐帧可复现性 (默认 12345)\n' +
      '  --jobs N       并行子进程数,1=单进程 (默认 ' + DEFAULT_JOBS + ')\n' +
      '  --fast SEC     速胜判定阈值秒数 (默认 ' + FAST_WIN_SEC + ')\n' +
      '  --save PATH    把结果 JSON 写入指定路径,作为下轮的回归基线\n' +
      '  --compare PATH 与已保存的基线 JSON 对比,输出逐角色/整体差异\n' +
      '  --matrix       额外打印全角色对位胜率矩阵\n' +
      '  --quiet        只打印汇总指标\n' +
      '  --json         仅把结果 JSON 输出到 stdout\n' +
      '\n' +
      '  注: 报告含「胜场均时 / 速胜%」列,速胜=<' + FAST_WIN_SEC + 's 结束的胜场;\n' +
      '      某角色速胜% ≥ ' + (FAST_WIN_WARN * 100) + '% 会标记 ⚡,提示核查其超模技能。\n');
    return;
  }
  const t0 = Date.now();
  if (o.fast !== null && o.fast > 0) FAST_WIN_SEC = o.fast;
  const res = await simulateMulti({ runs: o.runs, cap: o.cap, diff: o.diff, seed: o.seed, jobs: o.jobs });

  if (o.json) { console.log(JSON.stringify(res, null, 2)); return; }

  if (!o.quiet) printReport(res, { matrix: o.matrix });
  else {
    const s = res.summary;
    console.log('极差 ' + s.rangePP + 'pp / 标准差 ' + (s.std * 100).toFixed(1) + 'pp / 区间内 ' +
      s.within4060 + '/' + res.chars.length + ' / 硬克制 ' + s.hardCount + '/' + s.hardTotal + ' (' + s.hardPct + '%)' +
      ' / 隐均 ' + (s.hiddenMean * 100).toFixed(1) + '%' +
      ' / 速胜 ' + (s.fastWinRate * 100).toFixed(1) + '%' +
      (s.fastSuspects.length ? ' / 疑超模 ' + s.fastSuspects.join(' ') : ''));
  }

  if (o.save) {
    fs.mkdirSync(path.dirname(path.resolve(o.save)), { recursive: true });
    fs.writeFileSync(path.resolve(o.save), JSON.stringify(res));
    console.log('结果已保存 → ' + o.save);
  }
  if (o.compare) {
    const base = JSON.parse(fs.readFileSync(path.resolve(o.compare), 'utf8'));
    printCompare(base, res);
  }
  console.log('用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's  (jobs=' + (res.summary.jobs || 1) + ')');
}

/* ------------------------- Worker 入口 ------------------------- */
/** 子进程:接收一条泳道作业,载入一次沙箱后跑完并回传配对结果。 */
function workerMain() {
  let api = null;
  process.on('message', (job) => {
    try {
      if (!api) api = loadGame({ seed: job.seed });
      api.storyProg.cleared = 999;
      const out = [];
      for (const [a, b] of job.pairs) {
        out.push(computePair(api, a, b, job.runs, job.diff, job.capFrames, job.seed, job.names));
      }
      process.send({ ok: true, pairs: out });
    } catch (e) {
      process.send({ ok: false, error: String((e && e.stack) || e) });
    }
  });
}

if (require.main === module) {
  if (process.argv.includes('--worker')) workerMain();
  else main();
}
module.exports = { loadGame, simulate, simulateMulti, playMatch, computePair, aggregate, buildPairs,
  printReport, printCompare, FAST_WIN_SEC, FAST_WIN_WARN, HIDDEN_NAMES, DEFAULT_JOBS };
