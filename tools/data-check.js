#!/usr/bin/env node
'use strict';
/* =========================================================================
 * 机甲对决 · 技能数据一致性检查 (tools/data-check.js)
 * -------------------------------------------------------------------------
 * 技能改动必须五处同步:
 *   1. js/01-core.js  SKILLS       —— 技能定义/冷却/描述
 *   2. js/01-core.js  SKILL_RATING —— 平衡模型评分
 *   3. js/01-core.js  CHARS        —— 机体技能槽装配
 *   4. js/08-mech.js   castSkill   —— 技能实际效果
 *   5. js/10-ai.js     case 白名单 —— AI 施放决策
 *
 * 另外校验第 1 层结构约束:
 *   · 每台机体 6 个槽位(nJ/nK/fJ/fK/bJ/bK)全部装配
 *   · nJ 为专属签名技:全游戏唯一
 *   · 任一技能最多被 3 台机体使用
 *   · 不留下“定义了却没人用”的技能
 *
 * 用法: npm run data:check
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const { loadGame } = require('./balance-sim.js');

const ROOT = path.resolve(__dirname, '..');
const SLOTS = ['nJ', 'nK', 'fJ', 'fK', 'bJ', 'bK'];
const MAX_PER_SKILL = 1;

function caseIds(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const ids = new Set();
  const re = /case\s+'([^']+)'\s*:/g;
  let m;
  while ((m = re.exec(src))) ids.add(m[1]);
  return ids;
}

function main() {
  const api = loadGame({ seed: 12345 });
  api.storyProg.cleared = 999;
  const { CHARS, SKILLS, SKILL_RATING, SKILL_VARIANTS, ULTIMATES, MUSIC } = api;

  const skillIds = Object.keys(SKILLS);
  const ratingIds = Object.keys(SKILL_RATING);
  const mechCases = caseIds('js/08-mech.js');
  const aiCases = caseIds('js/10-ai.js');

  const errors = [];
  const warnings = [];

  // 1. SKILLS ↔ SKILL_RATING 双向一致
  for (const id of skillIds) if (!SKILL_RATING[id]) errors.push(`SKILL_RATING 缺少技能: ${id}`);
  for (const id of ratingIds) if (!SKILLS[id]) errors.push(`SKILL_RATING 存在多余技能: ${id}`);

  // 2. 技能实现 / AI 白名单覆盖
  for (const id of skillIds) {
    if (!mechCases.has(id) && !SKILL_VARIANTS[id]) errors.push(`js/08-mech.js 缺少实现: ${id}`);
    if (!aiCases.has(id) && !SKILL_VARIANTS[id]) errors.push(`js/10-ai.js AI 白名单缺少处理: ${id}`);
  }
  // 2b. 终结技:每个角色唯一,且必须有定义
  const ultSeen = new Map();
  for (const ch of CHARS) {
    const id = ch.ult;
    if (!id) { errors.push(`${ch.name} 缺少终结技`); continue; }
    if (!ULTIMATES[id]) errors.push(`${ch.name} 的终结技未定义: ${id}`);
    if (ultSeen.has(id)) errors.push(`终结技重复: ${id} 同时属于 ${ultSeen.get(id)} 与 ${ch.name}`);
    else ultSeen.set(id, ch.name);
  }
  // 2c. 变体表不能引用未定义技能,技能名不能重复
  for (const id of Object.keys(SKILL_VARIANTS)) if (!SKILLS[id]) errors.push(`SKILL_VARIANTS 引用了未定义技能: ${id}`);
  const nameSeen = new Map();
  for (const id of skillIds) {
    const nm = SKILLS[id].name;
    if (nameSeen.has(nm)) errors.push(`技能名重复: ${nm} (${nameSeen.get(nm)} / ${id})`);
    else nameSeen.set(nm, id);
  }

  // 2d. BGM 循环长度:每首必须 >15 秒
  const bgmLens = [];
  for (const [name, tr] of Object.entries(MUSIC)) {
    const len = Math.max(...tr.parts.map((p) => p.seq.trim().split(/\s+/).length));
    const sec = len * 60 / tr.bpm / (tr.div || 4);
    bgmLens.push({ name, sec });
    if (sec <= 15) errors.push(`BGM ${name} 循环长度 ${sec.toFixed(2)}s ≤ 15s`);
  }
  bgmLens.sort((a, b) => a.sec - b.sec);
  console.log(`BGM 曲目 ${bgmLens.length} 首 / 最短 ${bgmLens[0].sec.toFixed(1)}s (${bgmLens[0].name}) / 最长 ${bgmLens[bgmLens.length - 1].sec.toFixed(1)}s`);
  console.log('');

  // 3. CHARS 装配:六槽齐全、技能存在、频率上限、nJ 唯一
  const usage = new Map(skillIds.map((id) => [id, []]));
  const nJ = new Map();
  for (const ch of CHARS) {
    const skills = ch.skills || {};
    for (const slot of SLOTS) {
      const id = skills[slot];
      if (!id) { errors.push(`${ch.name} 缺少槽位 ${slot}`); continue; }
      if (!SKILLS[id]) errors.push(`${ch.name}.${slot} 引用了未定义技能: ${id}`);
      if (!usage.has(id)) usage.set(id, []);
      usage.get(id).push(ch.name);
      if (slot === 'nJ') {
        if (nJ.has(id)) errors.push(`nJ 签名技重复: ${id} 同时属于 ${nJ.get(id)} 与 ${ch.name}`);
        else nJ.set(id, ch.name);
      }
    }
  }

  for (const [id, names] of usage) {
    if (names.length > MAX_PER_SKILL)
      errors.push(`技能 ${id} 被 ${names.length} 台机体使用(上限 ${MAX_PER_SKILL}): ${names.join(' ')}`);
    if (!names.length) warnings.push(`技能 ${id} 已定义但未装配到任何机体`);
  }

  // 4. 故事模式 Boss:必须是本关剧情角色(第 9/10 关为隐藏机体),技能组完全一致
  const { STORY, bossChar } = api;
  for (const lv of STORY) {
    const srcIdx = lv.bossIdx !== undefined ? lv.bossIdx : lv.hero;
    const src = CHARS[srcIdx];
    const boss = bossChar(lv);
    if (!src) { errors.push(`故事第 ${lv.idx + 1} 关引用了不存在的机体索引: ${srcIdx}`); continue; }
    if (boss.name !== src.name)
      errors.push(`故事第 ${lv.idx + 1} 关 Boss 名称不一致: ${boss.name} ≠ ${src.name}`);
    for (const slot of SLOTS) {
      if (boss.skills[slot] !== src.skills[slot])
        errors.push(`故事第 ${lv.idx + 1} 关 Boss 技能不一致: ${slot} ${boss.skills[slot]} ≠ ${src.skills[slot]}`);
    }
  }

  // 5. 输出
  console.log('机甲对决 · 技能数据一致性检查\n');
  console.log('技能'.padEnd(18) + '装配数  机体');
  console.log('─'.repeat(64));
  for (const id of skillIds.slice().sort((a, b) => usage.get(b).length - usage.get(a).length || a.localeCompare(b))) {
    const names = usage.get(id) || [];
    console.log(id.padEnd(18) + String(names.length).padStart(5) + '   ' + names.join(' '));
  }
  console.log('─'.repeat(64));
  console.log(`技能定义 ${skillIds.length} / 评分 ${ratingIds.length} / 终结技 ${Object.keys(ULTIMATES).length} / 机体 ${CHARS.length} / 签名技 ${nJ.size}`);
  console.log(`最高装配数 ${Math.max(...[...usage.values()].map((a) => a.length))} (上限 ${MAX_PER_SKILL})`);

  if (warnings.length) {
    console.log('\n提示:');
    for (const w of warnings) console.log('  · ' + w);
  }
  if (errors.length) {
    console.log('\n✗ 检查未通过:');
    for (const e of errors) console.log('  · ' + e);
    process.exitCode = 1;
    return;
  }
  console.log('\n✓ 五处同步与结构约束全部通过');
}

main();
