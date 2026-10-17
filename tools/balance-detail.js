#!/usr/bin/env node
'use strict';
/* =========================================================================
 * 机甲对决 · 详细平衡统计器 (tools/balance-detail.js)
 * -------------------------------------------------------------------------
 * 与 balance-sim 共用同一个真实游戏引擎，但额外记录：
 *   · 每个角色的出场数/胜场/胜率/伤害/承伤/治疗/击杀/死亡
 *   · 每个技能（含终结技）的施放次数、命中次数、造成伤害、平均伤害
 *   · 普通攻击/召唤物/持续领域/雷击等伤害来源的归属
 *   · 两种采样方式：
 *       spectate   —— 复刻游戏内观赏模式“胜者留场、败者随机换人、5 连胜封顶”
 *       roundrobin —— 均匀有序对位（原 balance-sim 的采样方式）
 *
 * 用法:
 *   node tools/balance-detail.js [--mode spectate|roundrobin] [--matches N]
 *                                [--runs N] [--diff 0|1|2] [--seed N]
 *                                [--cap SEC] [--save PATH] [--json] [--all-skills]
 *
 *   spectate 默认 5000 场；roundrobin 默认每对位 500 场（91,000 场）。
 *   --diff 默认 0（游戏默认“简单”，与观赏模式实际运行一致）。
 *
 * 说明:
 *   伤害归属优先使用实体携带的 sk（技能 id），其次使用施放瞬间的 _castId。
 *   普通攻击/地图机关/无来源伤害分别记为“普通攻击”和“中立伤害”，不会
 *   被强行算到某个技能头上。护盾格挡单独记录为 blocked/blocks。
 * ========================================================================= */

const fs = require('fs');
const path = require('path');
const { loadGame, playMatch, buildPairs } = require('./balance-sim');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HIDDEN = new Set(['天罚', '湮灭']);
const pct = (v) => (v * 100).toFixed(1) + '%';
const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

function blankChar(name, idx) {
  return {
    idx, name, hidden: HIDDEN.has(name),
    games: 0, wins: 0, losses: 0, draws: 0, frames: 0,
    damage: 0, taken: 0, healing: 0, kills: 0, deaths: 0,
    hits: 0, hitsTaken: 0, blocked: 0, blocks: 0,
    casts: 0, ultCasts: 0,
    skillCasts: {}, skillDamage: {}, skillHits: {}, skillHealing: {},
  };
}

function bump(obj, key, value) {
  obj[key] = (obj[key] || 0) + value;
}

function mergeSkillMap(dst, src) {
  if (!src) return;
  for (const k of Object.keys(src)) dst[k] = (dst[k] || 0) + src[k];
}

/**
 * 把一场比赛的两份 telemetry 合并进角色统计。
 * @param {object} s 角色统计
 * @param {number} mechId 本场该角色的槽位 id（0/1）
 * @param {object} T playMatch 返回的 telemetry
 */
function mergeTelemetry(s, mechId, T, frames) {
  if (!T) return;
  s.games++;
  s.frames += frames;
  s.damage += T.damage[mechId] || 0;
  s.taken += T.taken[mechId] || 0;
  s.healing += T.healing[mechId] || 0;
  s.kills += T.kills[mechId] || 0;
  s.deaths += T.deaths[mechId] || 0;
  s.hits += T.hits[mechId] || 0;
  s.hitsTaken += T.hitsTaken[mechId] || 0;
  s.blocked += T.blocked[mechId] || 0;
  s.blocks += T.blocks[mechId] || 0;
  s.casts += T.casts[mechId] || 0;
  s.ultCasts += T.ultCasts[mechId] || 0;
  mergeSkillMap(s.skillCasts, T.skillCasts[mechId]);
  mergeSkillMap(s.skillDamage, T.skillDamage[mechId]);
  mergeSkillMap(s.skillHits, T.skillHits[mechId]);
  mergeSkillMap(s.skillHealing, T.skillHealing[mechId]);
}

function skillName(api, id) {
  const sk = api.SKILLS[id], ul = api.ULTIMATES[id];
  return (ul && ul.name) || (sk && sk.name) || id;
}

function skillKind(api, id) {
  return api.ULTIMATES[id] ? '终结技' : '普通技';
}

function makeSkillRows(api, s) {
  const ids = new Set([
    ...Object.keys(s.skillCasts || {}),
    ...Object.keys(s.skillDamage || {}),
    ...Object.keys(s.skillHits || {}),
    ...Object.keys(s.skillHealing || {}),
  ]);
  const rows = [];
  for (const id of ids) {
    const casts = (s.skillCasts || {})[id] || 0;
    const dmg = (s.skillDamage || {})[id] || 0;
    const hits = (s.skillHits || {})[id] || 0;
    const heal = (s.skillHealing || {})[id] || 0;
    if (!casts && !dmg && !hits && !heal) continue;
    rows.push({
      id, name: skillName(api, id), kind: skillKind(api, id),
      casts, hits, damage: dmg, healing: heal,
      avgDamage: casts ? dmg / casts : 0,
      avgHits: casts ? hits / casts : 0,
      share: s.damage ? dmg / s.damage : 0,
      perGame: s.games ? dmg / s.games : 0,
    });
  }
  rows.sort((a, b) => b.damage - a.damage || b.casts - a.casts || a.id.localeCompare(b.id));
  return rows;
}

/**
 * 观赏模式采样：复刻 nextSpectators 的胜者留场 + 5 连胜封顶。
 */
function runSpectate(api, o) {
  const names = api.CHARS.map((c) => c.name);
  const stats = names.map((n, i) => blankChar(n, i));
  const rng = mulberry32((o.seed ^ 0x9e3779b9) >>> 0);
  const ri = (n) => Math.floor(rng() * n);
  const N = names.length;
  let a = ri(N), b = ri(N);
  while (b === a) b = ri(N);
  let streak = 0, lastSlot = -1, matches = 0, attempts = 0, draws = 0, capped = 0, neutral = 0;
  let guard = 0;
  const target = o.matches;
  while (matches < target && guard++ < target * 5 + 100) {
    api.__reseed((o.seed ^ ((++attempts) * 2654435761)) >>> 0);
    const res = playMatch(api, a, b, o.diff, o.capFrames, { telemetry: true });
    if (res.capped) capped++;
    // 平局：真实观赏模式会原地重开同一回合，不记入天梯；这里也丢弃这场统计
    if (res.winner === null) {
      draws++;
      continue;
    }
    matches++;
    neutral += res.telemetry && res.telemetry.neutralDamage || 0;
    const w = res.winner;
    const loser = w === 0 ? b : a;
    const winnerChar = w === 0 ? a : b;
    const sl = stats[a], sr = stats[b];
    mergeTelemetry(sl, 0, res.telemetry, res.frames);
    mergeTelemetry(sr, 1, res.telemetry, res.frames);
    stats[winnerChar].wins++;
    stats[loser].losses++;
    // 与游戏内 nextSpectators 一致：胜者留场，连守 5 场后双方重抽
    const champSlot = w;
    if (champSlot !== lastSlot) streak = 0;
    streak++; lastSlot = champSlot;
    const keep = winnerChar;
    if (streak >= 5) {
      a = ri(N); b = ri(N);
      while (b === a) b = ri(N);
      streak = 0; lastSlot = -1;
    } else if (champSlot === 0) {
      let n; do { n = ri(N); } while (n === keep);
      b = n;
    } else {
      let n; do { n = ri(N); } while (n === keep);
      a = n;
    }
  }
  return { stats, matches, draws, capped, neutral, names };
}

/**
 * 均匀有序对位采样：与原 balance-sim 的 14×13×runs 完全同口径。
 */
function runRoundRobin(api, o) {
  const names = api.CHARS.map((c) => c.name);
  const stats = names.map((n, i) => blankChar(n, i));
  const pairs = buildPairs(names.length);
  let matches = 0, draws = 0, capped = 0, neutral = 0;
  const runs = o.runs;
  for (const [a, b] of pairs) {
    for (let r = 0; r < runs; r++) {
      api.__reseed((o.seed ^ (a * 7919 + b * 104729 + r * 2654435761)) >>> 0);
      const res = playMatch(api, a, b, o.diff, o.capFrames, { telemetry: true });
      matches++;
      if (res.capped) capped++;
      if (res.winner === null) draws++;
      neutral += res.telemetry && res.telemetry.neutralDamage || 0;
      mergeTelemetry(stats[a], 0, res.telemetry, res.frames);
      mergeTelemetry(stats[b], 1, res.telemetry, res.frames);
      if (res.winner === 0) { stats[a].wins++; stats[b].losses++; }
      else if (res.winner === 1) { stats[b].wins++; stats[a].losses++; }
    }
  }
  return { stats, matches, draws, capped, neutral, names };
}

function finalize(api, raw, o) {
  const stats = raw.stats.map((s) => {
    s.winRate = s.games ? s.wins / s.games : 0;
    s.avgDamage = s.games ? s.damage / s.games : 0;
    s.avgTaken = s.games ? s.taken / s.games : 0;
    s.avgHealing = s.games ? s.healing / s.games : 0;
    s.avgCasts = s.games ? s.casts / s.games : 0;
    s.avgUlt = s.games ? s.ultCasts / s.games : 0;
    s.avgDuration = s.games ? s.frames / s.games / 60 : 0;
    s.skills = makeSkillRows(api, s);
    const skillDamageSum = Object.values(s.skillDamage || {}).reduce((x, y) => x + y, 0);
    s.skillDamageTotal = skillDamageSum;
    s.basicDamage = Math.max(0, s.damage - skillDamageSum);
    s.basicShare = s.damage ? s.basicDamage / s.damage : 0;
    const regularCasts = Math.max(0, s.casts - s.ultCasts);
    s.regularCasts = regularCasts;
    s.avgRegularCasts = s.games ? regularCasts / s.games : 0;
    return s;
  });
  const rates = stats.map((s) => s.winRate);
  const mean = rates.reduce((x, y) => x + y, 0) / (rates.length || 1);
  const std = Math.sqrt(rates.reduce((x, y) => x + (y - mean) ** 2, 0) / (rates.length || 1));
  // 全局技能视图
  const globalSkills = {};
  for (const s of stats) {
    for (const row of s.skills) {
      const g = globalSkills[row.id] || (globalSkills[row.id] = {
        id: row.id, name: row.name, kind: row.kind,
        owners: [], casts: 0, hits: 0, damage: 0, healing: 0,
      });
      g.owners.push(s.name);
      g.casts += row.casts; g.hits += row.hits; g.damage += row.damage; g.healing += row.healing;
    }
  }
  const globalRows = Object.values(globalSkills)
    .map((g) => ({ ...g, avgDamage: g.casts ? g.damage / g.casts : 0 }))
    .sort((a, b) => b.damage - a.damage || b.casts - a.casts);
  const totals = stats.reduce((t, s) => {
    t.damage += s.damage; t.taken += s.taken; t.healing += s.healing;
    t.casts += s.casts; t.ultCasts += s.ultCasts; t.skillDamage += s.skillDamageTotal;
    t.basicDamage += s.basicDamage; t.kills += s.kills;
    return t;
  }, { damage: 0, taken: 0, healing: 0, casts: 0, ultCasts: 0, skillDamage: 0, basicDamage: 0, kills: 0 });
  return {
    meta: {
      source: 'index.html', generatedAt: new Date().toISOString(),
      mode: o.mode, diff: o.diff, diffName: api.DIFFS[o.diff].name,
      matches: raw.matches, draws: raw.draws, capped: raw.capped,
      seed: o.seed, runsPerPair: o.mode === 'roundrobin' ? o.runs : null,
      chars: raw.names,
    },
    summary: {
      matches: raw.matches, draws: raw.draws, capped: raw.capped,
      neutralDamage: raw.neutral,
      mean: +mean.toFixed(4), std: +std.toFixed(4),
      min: +Math.min(...rates).toFixed(4), max: +Math.max(...rates).toFixed(4),
      rangePP: +((Math.max(...rates) - Math.min(...rates)) * 100).toFixed(1),
      within4060: rates.filter((r) => r >= 0.4 && r <= 0.6).length,
      totals,
    },
    chars: stats,
    skills: globalRows,
  };
}

function printReport(api, res, o, savePath) {
  const line = '─'.repeat(96);
  console.log('\n' + line);
  console.log('机甲对决 · 详细平衡统计   (' + (o.mode === 'spectate' ? '观赏模式/胜者留场' : '均匀对位') +
    ' / AI:' + api.DIFFS[o.diff].name + ' / ' + res.meta.matches.toLocaleString() + ' 场 / seed ' + o.seed + ')');
  console.log(line);
  console.log(' 角色       胜率     出场     伤害/场   承伤/场   治疗/场   击杀  死亡   技能/场  终结/场  时长');
  const rows = res.chars.slice().sort((a, b) => b.winRate - a.winRate);
  for (const s of rows) {
    const flag = s.winRate < 0.4 ? ' ▲弱' : s.winRate > 0.6 ? ' ▼强' : '  ✓';
    console.log(
      (s.hidden ? '★' : ' ') + s.name.padEnd(6, '　') +
      pct(s.winRate).padStart(8) + String(s.games).padStart(7) +
      n1(s.avgDamage).padStart(10) + n1(s.avgTaken).padStart(10) + n1(s.avgHealing).padStart(10) +
      String(s.kills).padStart(6) + String(s.deaths).padStart(6) +
      n1(s.avgCasts).padStart(9) + n1(s.avgUlt).padStart(9) +
      (n1(s.avgDuration) + 's').padStart(8) + flag
    );
  }
  console.log(line);
  console.log(' 极差 ' + res.summary.rangePP + 'pp / 标准差 ' + (res.summary.std * 100).toFixed(1) +
    'pp / 区间内 ' + res.summary.within4060 + '/' + res.chars.length +
    ' / 平局重开 ' + res.summary.draws + ' / 超时 ' + res.summary.capped +
    ' / 中立伤害 ' + Math.round(res.summary.neutralDamage));
  console.log(line);

  console.log('\n 各角色技能明细（按伤害排序，默认显示前 5；* 为终结技）');
  for (const s of rows) {
    console.log('\n ' + (s.hidden ? '★' : '') + s.name + '   胜率 ' + pct(s.winRate) + '   伤害/场 ' + n1(s.avgDamage) +
      '   技能/场 ' + n1(s.avgRegularCasts) + '   终结/场 ' + n1(s.avgUlt));
    const list = o.allSkills ? s.skills : s.skills.slice(0, 5);
    if (!list.length) { console.log('   （无技能数据）'); continue; }
    for (const r of list) {
      console.log('   ' + (r.kind === '终结技' ? '*' : ' ') + r.name.padEnd(8, '　') +
        ' 用 ' + String(r.casts).padStart(5) + ' 次' +
        '  伤害 ' + String(Math.round(r.damage)).padStart(7) +
        '  单次 ' + n1(r.avgDamage).padStart(7) +
        '  占比 ' + (r.share * 100).toFixed(1).padStart(5) + '%' +
        (r.healing ? '  治疗 ' + Math.round(r.healing) : '') +
        (r.hits ? '  命中 ' + r.hits : ''));
    }
    if (!o.allSkills && s.skills.length > 5) console.log('   …… 其余 ' + (s.skills.length - 5) + ' 项已写入 JSON');
    console.log('    普通攻击/未归属 伤害 ' + String(Math.round(s.basicDamage)).padStart(7) +
      '  占比 ' + (s.basicShare * 100).toFixed(1).padStart(5) + '%' +
      '  命中 ' + String(s.hits).padStart(6) + '  被命中 ' + String(s.hitsTaken).padStart(6) +
      '  格挡 ' + Math.round(s.blocked).toString().padStart(5));
  }

  console.log('\n 全局技能伤害排行（前 15）');
  for (const g of res.skills.slice(0, 15)) {
    console.log(' ' + (g.kind === '终结技' ? '*' : ' ') + g.name.padEnd(8, '　') +
      ' 持有 ' + g.owners.join('/').padEnd(12, '　') +
      ' 用 ' + String(g.casts).padStart(6) + ' 次  伤害 ' + String(Math.round(g.damage)).padStart(8) +
      '  单次 ' + n1(g.avgDamage).padStart(7));
  }
  console.log(line);
  if (savePath) console.log('详细数据已保存 → ' + savePath);
}

function parseArgs(argv) {
  const o = {
    mode: 'spectate', matches: 5000, runs: 500, diff: 0, seed: 12345,
    cap: 90, save: null, json: false, allSkills: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], next = () => argv[++i];
    if (k === '--mode') o.mode = next();
    else if (k === '--matches') o.matches = parseInt(next(), 10);
    else if (k === '--runs') o.runs = parseInt(next(), 10);
    else if (k === '--diff') o.diff = parseInt(next(), 10);
    else if (k === '--seed') o.seed = parseInt(next(), 10);
    else if (k === '--cap') o.cap = parseFloat(next());
    else if (k === '--save') o.save = next();
    else if (k === '--json') o.json = true;
    else if (k === '--all-skills') o.allSkills = true;
    else if (k === '-h' || k === '--help') { o.help = true; }
  }
  o.capFrames = Math.round(o.cap * 60);
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log('用法: node tools/balance-detail.js [--mode spectate|roundrobin] [--matches N] [--runs N]\n' +
      '                                  [--diff 0|1|2] [--seed N] [--cap SEC] [--save PATH]\n' +
      '                                  [--json] [--all-skills]\n\n' +
      '  --mode spectate   胜者留场采样，默认 5000 场（与游戏观赏模式一致）\n' +
      '  --mode roundrobin 均匀有序对位，每对位 --runs 场（默认 500）\n' +
      '  --diff 0|1|2      AI 难度，默认 0=简单（游戏默认）\n' +
      '  --save PATH       保存完整 JSON 明细\n' +
      '  --all-skills      打印每个角色的全部技能，而非仅前 5\n');
    return;
  }
  if (!['spectate', 'roundrobin'].includes(o.mode)) throw new Error('未知模式: ' + o.mode);
  if (![0, 1, 2].includes(o.diff)) throw new Error('难度必须是 0/1/2');
  const api = loadGame({ seed: o.seed });
  api.storyProg.cleared = 999;
  const t0 = Date.now();
  const raw = o.mode === 'spectate' ? runSpectate(api, o) : runRoundRobin(api, o);
  const res = finalize(api, raw, o);
  if (o.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    printReport(api, res, o, o.save);
  }
  if (o.save) {
    const p = path.resolve(o.save);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(res, null, 2));
    if (!o.json) console.log('已保存 → ' + o.save);
  }
  console.error('用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

if (require.main === module) main();
module.exports = { runSpectate, runRoundRobin, finalize };
