/* =========================================================================
 * 机甲对决 MECH DUEL · 02-story-data.js
 * 故事模式数据与存档进度
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 1b. 故事模式数据 ----------------
 * 一条主线共 10 关:进入故事模式后先选定一名出击机师,再用该机师顺关卡推进。
 * 每关战场遍布普通杂兵,末段由该关的剧情机师坐镇 Boss —— Boss 使用该关卡角色的
 * 外观、武装、技能与底盘数值(经统一系数换算),不再是玩家所选机师的镜像。
 * 第 9 / 第 10 关的 Boss 分别是隐藏机体「天罚」与「湮灭」;击败后即解锁该机体,
 * 之后可在选人界面(对战 / 街机 / 故事)中选用。 */
const STORY_KEY='mechduel.story.v1';
let storyProg={cleared:0};                 // 已通关关卡数(顺序推进)
function loadStory(){
  try{ const s=localStorage.getItem(STORY_KEY); if(s){ const o=JSON.parse(s); if(o&&typeof o.cleared==='number') storyProg={cleared:o.cleared}; } }catch(e){}
}
function saveStory(){ try{ localStorage.setItem(STORY_KEY,JSON.stringify(storyProg)); }catch(e){} }
function storyLevelOpen(i){ return i===0 || storyProg.cleared>=i; }        // 第 i 关(0 基)是否已解锁
/* 隐藏机体解锁:通关数量达到该机体的 unlock 关卡数后解锁,可在选人界面选用。 */
function charUnlocked(i){ const c=CHARS[i]; return !c.locked || storyProg.cleared>=(c.unlock||0); }

/* 普通杂兵模板(属性远低于机师,成群出现) */
const MOBS={
  grunt:  {name:'巡逻机', tag:'杂兵', hp:24, spd:62, jump:210, atk:0.7, bullet:6, regen:10, size:0.60, weapon:'vulcan',
    pal:{main:'#6a7480',dark:'#454d58',light:'#9aa6b4',joint:'#2b3138',visor:'#ff9a4d',gun:'#3a4048',saber:'#cfd6ea'}},
  raider: {name:'掠夺者', tag:'杂兵', hp:30, spd:88, jump:230, atk:0.8, bullet:7, regen:12, size:0.68, weapon:'rifle',
    pal:{main:'#8a5a3a',dark:'#573524',light:'#c99a6a',joint:'#3a2a1e',visor:'#ffd166',gun:'#42322a',saber:'#ffd166'}},
  drone:  {name:'浮游机', tag:'杂兵', hp:18, spd:76, jump:220, atk:0.6, bullet:6, regen:14, size:0.56, weapon:'spread', canFly:true,
    pal:{main:'#3f7a80',dark:'#265055',light:'#7fd0d8',joint:'#1e3033',visor:'#7df9ff',gun:'#2a3a3d',saber:'#7df9ff'}},
  gunner: {name:'重炮兵', tag:'杂兵', hp:36, spd:54, jump:200, atk:0.7, bullet:8, regen:10, size:0.74, weapon:'rocket',
    pal:{main:'#5a4a7a',dark:'#38294f',light:'#9a86c9',joint:'#2a2138',visor:'#ff6a9a',gun:'#342a44',saber:'#c9a6ff'}},
};
function mobChar(type){ return MOBS[type]||MOBS.grunt; }
/* 故事模式 Boss 平衡系数:
 * Boss = 本关剧情机师(第 9/10 关为隐藏机体),完整继承该角色的外观、武装、
 * 技能组与底盘数值,再用统一系数换算,保证 1~10 关的强度规则一致:
 *   hpK  — 血量倍率(略高于玩家,压迫感来源)
 *   dmgK — 输出倍率(略低于玩家,给玩家「换血占优」的窗口)
 *   sizeK— 体型倍率(同步放大受击面积与近战范围,过大则近战范围碾压)
 *   regen— 回复倍率 */
const STORY_BOSS={ hpK:1.15, dmgK:0.8, sizeK:1.35, regenK:1.0, bossWaveAdds:0 };
/* 波间补给:清剿一波后为机师纳米修复,避免「上一波残血 → 下一波必败」的连续消耗死局。
 * healK 为按最大血量回复的比例(0=不回复,1=回满)。 */
const WAVE_HEAL={ healK:0.9 };
/* Boss 一律取自本关剧情机师(第 9/10 关由 bossIdx 指定隐藏机体);
 * 技能组与该角色在选人界面中可选的版本完全一致,避免「Boss 长得像 X、用的却是 Y 的技能」。 */
function bossChar(lv){
  const B=STORY_BOSS;
  const srcIdx=lv.bossIdx!==undefined?lv.bossIdx:(lv.hero!==undefined?lv.hero:0);
  const src=CHARS[srcIdx]||CHARS[0];
  return {
    name:src.name, tag:'BOSS',
    pal:src.pal,
    hp:Math.round(src.hp*B.hpK),
    spd:src.spd, jump:src.jump,
    atk:Math.round(src.atk*100*B.dmgK)/100,
    bullet:Math.max(1,Math.round(src.bullet*B.dmgK)),
    regen:Math.round(src.regen*B.regenK),
    size:Math.min(1.6,+(src.size*B.sizeK).toFixed(2)),
    role:src.role, weapon:src.weapon, meleeW:src.meleeW||'saber',
    canFly:!!src.canFly, airW:src.airW,
    pCount:src.pCount, pSize:src.pSize, guardMul:src.guardMul,
    ult:src.ult,
    skills:Object.assign({},src.skills)       // 与本关剧情机师同款技能组
  };
}
/* 关卡表:hero=本关机师(0 基,CHARS 索引) / map=战场索引 / mobs=杂兵种类 / count=杂兵数量 */
const STORY=[
 {idx:0, hero:0, map:0, mobs:['grunt','raider'],       count:5, title:'第一关 · 霓虹废墟',
  intro:['联邦旧城区的霓虹依旧闪烁,','巡逻部队却在一夜之间全部失控。','侦察队长「突击者」接下匿名委托:','「看来今晚,不会太平。」']},
 {idx:1, hero:1, map:1, mobs:['grunt','gunner'],       count:5, title:'第二关 · 荒漠残垣',
  intro:['黄沙掩埋了旧战场的残骸。','重炮手「重装兵」循着硝烟而来,','却发现昔日战友的火控信号','正指向他自己。']},
 {idx:2, hero:2, map:2, mobs:['raider','drone','grunt'],count:6, title:'第三关 · 冰原哨站',
  intro:['冰原哨站已断联七日。','竞速冠军「疾风」奉命突入,','在刺骨风雪中,他听见了','与自己心跳同频的引擎轰鸣。']},
 {idx:3, hero:3, map:3, mobs:['gunner','grunt'],       count:5, title:'第四关 · 熔岩熔炉',
  intro:['千年前的要塞守卫机「堡垒」,','在熔岩工厂深处醒来。','它必须弄清:','自己究竟在守卫什么。']},
 {idx:4, hero:4, map:0, mobs:['raider','gunner','grunt'],count:6, title:'第五关 · 夜猎追踪',
  intro:['赏金公会的头号猎人「猎手」,','收到了一份没有署名的悬赏。','目标——正是他自己。','「有意思。这单我接了。」']},
 {idx:5, hero:5, map:1, mobs:['drone','raider'],       count:6, title:'第六关 · 沙海魅影',
  intro:['暗影局的特工「幽灵」档案空白。','沙暴之中,一个与他背影一致的影子','反复出现在瞄准镜里。','「那我只好,先一步解决你。」']},
 {idx:6, hero:6, map:2, mobs:['gunner','drone','grunt'],count:6, title:'第七关 · 冰封巨影',
  intro:['远古机甲「巨兽」沉眠千年,','被冰层下不安的震动唤醒。','它嗅到了战争的味道,','而这次,它不愿再睡去。']},
 {idx:7, hero:7, map:3, mobs:['drone','raider','gunner'],count:7, title:'第八关 · 能量熔炉',
  intro:['实验机「新星」的能源核心濒临失控。','她必须亲手压制自己造出的失控体,','否则整个工厂都将化为灰烬。','「理论,由我来验证。」']},
 {idx:8, hero:7, map:0, mobs:['gunner','drone','raider'],count:7, title:'第九关 · 审判降临', unlock:11,
  bossIdx:12,
  intro:['天空裂开一道金线。','「天罚」循着能量波动自苍穹而降,','它的光束所指之处,万物皆受裁定。','只有击败审判者,才能窃取它的力量。']},
 {idx:9, hero:8, map:3, mobs:['gunner','drone','raider'],count:8, title:'第十关 · 终焉之门', unlock:12,
  bossIdx:13,
  intro:['获得审判之力的「天罚」','在熔炉最深处,遇见了灾厄本身。','「湮灭」睁开了猩红的目镜——','战场,不再有明天。']},
];
function mechLabel(m){
  if(game.mode===3) return m.id===0?'左':'右';   // 观赏模式:双方皆电脑,以左右区分
  return m.id===0?'P1':(m.ctrl==='cpu'?'AI':'P2');
}
