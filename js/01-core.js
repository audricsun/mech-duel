/* =========================================================================
 * 机甲对决 MECH DUEL · 01-core.js
 * 常量与工具:调色板/武器表/机体表/平衡与技能评分模型
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 1. 常量与工具 ---------------- */
const W = 480, H = 270;            // 逻辑分辨率(游戏逻辑与 UI 坐标系)
let SC = 2;                        // 渲染倍率:实际画布 = 480×270 × SC(随窗口自适应,整数倍保证像素对齐)
const GROUND = 236;                // 地面 y(逻辑)
const GRAV = 640;                  // 重力
const SPD = 92;                    // 移动速度
const JUMPV = 250;                 // 起跳速度
const ATK_TIME = 0.32;             // 挥砍动画时长(默认光刃;具体武器见 MELEE_WEP)
const BULLET_DMG = 7, MELEE_DMG = 12, ENERGY_COST = 25;
const ROUND_TIME = 60;             // 回合限时(秒)

/* 动态相机:zoom 按战场单位包围盒连续平滑追踪(不再量化,避免阶梯跳变) */
const CAM={ zoom:1, zEff:1, cx:W/2, cy:H/2 };
const ZMIN=0.6, ZMAX=1.5;          // 可缩放范围:拉远看全局战场 / 拉近看贴身缠斗

/* 专属武器表:cd 射击间隔 / cost 耗能 / dmg 相对机体 bullet 的倍率 / speed 弹速
 * fan 扇形弹数 / fanArc 扇形角距(rad) / aoe 爆炸半径 / pierce 穿透 / wave 波浪轨迹 / knock 额外击退
 * range AI 交战距离偏好(≥140 视为远程特化:保持距离输出) */
const WEAPONS={
  rifle:  {name:'突击步枪', cd:0.5,  cost:25, dmg:1.0,  speed:250, range:145},
  vulcan: {name:'连射机炮', cd:0.16, cost:9,  dmg:0.5,  speed:290, range:85},
  rocket: {name:'火箭炮',   cd:0.9,  cost:30, dmg:1.9,  speed:165, aoe:34, knock:160, range:210},
  spread: {name:'散弹炮',   cd:0.65, cost:25, dmg:0.62, speed:235, fan:3, fanArc:0.22, range:150},
  laser:  {name:'光束枪',   cd:0.55, cost:27, dmg:1.15, speed:430, pierce:true, range:215},
  arc:    {name:'电弧枪',   cd:0.42, cost:20, dmg:1.25, speed:230, wave:true, range:115},
  /* 空中特化武装(仅可飞行机体,飞行中 下+射击 触发) */
  homing: {name:'追踪飞弹', cd:1.1,  cost:28, dmg:0.85, speed:250},
  seeker: {name:'追踪火箭', cd:1.4,  cost:32, dmg:1.5,  speed:190, aoe:30, knock:120},
  mortar: {name:'迫击炮',   cd:1.7,  cost:36, dmg:1.7,  speed:200, aoe:42, knock:160},
};
/* 近身武器表:不同机师使用不同近战兵装,在伤害/范围/出手速度/击退上各有取舍
 * dmg 伤害倍率 / range 攻击距离 / arc 垂直判定高度 / kb 击退 / atkT 挥砍时长 / cd 攻击间隔 */
const MELEE_WEP={
  saber:     {name:'光刃',  dmg:1.0,  range:38, arc:34, kb:110, atkT:0.32, cd:0.55},
  dagger:    {name:'匕首',  dmg:0.85, range:34, arc:26, kb:75,  atkT:0.18, cd:0.30},
  spear:     {name:'长枪',  dmg:1.15, range:56, arc:24, kb:135, atkT:0.36, cd:0.72},
  hammer:    {name:'战锤',  dmg:1.75, range:40, arc:42, kb:250, atkT:0.50, cd:1.02},
  greatsword:{name:'大剑',  dmg:1.30, range:50, arc:46, kb:180, atkT:0.42, cd:0.86},
};
/* 技能表:先按防御(开 0.5s 输入窗口)→ 窗口内 方向(无/前/后)+斩(J)/射(K) 组合施放
 * cd 冷却秒数;施放不耗能,冷却独立按技能 id 记录 */
const SKILLS={
  dash:      {name:'冲刺斩',   cd:4,   desc:'向前猛冲,路径造成 1.2× 斩击'},
  triple:    {name:'速射三连', cd:5,   desc:'瞬间连射 3 发主武器弹药(不耗能)'},
  tumble:    {name:'战术翻滚', cd:6,   desc:'向后翻滚拉开距离,2.5 秒移速 +50%'},
  fortify:   {name:'震荡壁垒', cd:9,   desc:'3 秒受伤减半且免疫击退'},
  rocketsalvo:{name:'火箭齐射',cd:8,   desc:'不耗能快速齐射 6 枚火箭'},
  mortarBarrage:{name:'多发迫击炮',cd:9, desc:'一次抛射 5 枚迫击炮弹,散落目标区域并范围爆炸'},
  blinkF:    {name:'瞬步突进', cd:3.5, desc:'向面朝方向瞬移 70px'},
  blinkB:    {name:'残影回撤', cd:3.5, desc:'向身后瞬移 70px,瞬间拉开距离'},
  spin:      {name:'回旋斩',   cd:5,   desc:'旋转光剑,周身范围斩击'},
  eshield:   {name:'能量护盾', cd:8,   desc:'2 秒完全格挡所有伤害'},
  shieldbash:{name:'盾击冲锋', cd:6,   desc:'举盾冲锋,将对手狠狠撞飞'},
  vulcan:    {name:'火神炮模式',cd:9,  desc:'坐地机炮形态:2.8 秒内自动向对手倾泻 5 连发扇形弹幕,期间受伤 -30%'},
  overcharge:{name:'过载射击', cd:12,  desc:'5 秒射击不耗能、射速提升'},
  twinlaser: {name:'双束狙击', cd:7,   desc:'上下双光束同时狙击,穿透一切'},
  leapblast: {name:'后跃齐射', cd:7,   desc:'向后跃起的同时向前散射 3 束火力'},
  cloak:     {name:'光学迷彩', cd:10,  desc:'2.5 秒隐身,下次攻击 1.8× 伤害'},
  shadow:    {name:'影袭',     cd:6,   desc:'瞬移到对手背后并斩击'},
  shadowdash:{name:'疾影斩',   cd:6,   desc:'化作残影突进,路径造成 1.4× 斩击'},
  trample:   {name:'巨兽冲撞', cd:7,   desc:'狂暴冲锋,撞击造成 1.5× 伤害并击飞'},
  roar:      {name:'战吼',     cd:9,   desc:'震退周围敌人,2.5 秒免疫击退硬直'},
  burst:     {name:'能量爆发', cd:11,  desc:'能量回满,3 秒回复 ×3'},
  arcburst:  {name:'星弧连射', cd:6,   desc:'扇形射出 5 道电弧弹'},
  judgement: {name:'天罚审判', cd:10,  desc:'周身爆发 12 道环形审判弹幕,全方位压制'},
  oblivion:  {name:'湮灭冲击', cd:11,  desc:'引爆周身能量,超大范围重创并击飞敌人'},
  hellfire:  {name:'地狱火导弹', cd:9,  desc:'原地垂直齐射 6 枚地狱火导弹,划弧追踪目标爆炸'},
  missileSalvo:{name:'多联装追踪导弹',cd:10,desc:'一次齐射 8 枚追踪导弹,自主修正航向锁定目标'},
  rocketBarrage:{name:'多联装火箭弹',cd:8,desc:'扇形连射 6 枚火箭弹,覆盖前方大片区域'},
  incendiary:{name:'凝固燃烧弹', cd:9,  desc:'一次抛射 3 枚燃烧弹,散落目标附近并留下连片火海'},
  drone:     {name:'浮游炮',     cd:14, desc:'召唤浮游炮 10 秒,自主盘旋于敌人头顶向下贯穿射击'},
  drone3:    {name:'三连装浮游炮',cd:14,desc:'召唤 3 架无人机,自主锁定敌人并以 3 连发点射(每轮随机 1~2 秒冷却)'},
  cover:     {name:'部署掩体',   cd:12, desc:'在身前展开固定 HP 的合金掩体,拦截来袭弹药'},
  healDrone: {name:'修复无人机', cd:16, desc:'召唤修复无人机 8 秒,持续为己方充能回血'},
  lightning: {name:'雷击锁定',   cd:10, desc:'锁定最近敌人,1 秒 5 道雷击,持续 3 秒'},
  iceball:   {name:'寒冰球',     cd:8,  desc:'放出缓慢飞行的寒冰球,阻挡敌方弹药并冻结接触者'},
  emorb:     {name:'电磁球',     cd:9,  desc:'向前放出 4 颗缓慢前飘的电磁球,拦截敌方弹药并令接触者受磁力干扰减速'},
};
/* 技能评分表(平衡模型输入):kind 结算类型 / n 弹数 / mul 伤害倍率 / wep 参照武器(main=本机主武器)
 * util 功能价值(增益/位移/格挡等等效分) / tags 类型标签(追踪/穿透/范围/多目标/强化…附加评价分) */
const SKILL_RATING={
  dash:      {kind:'melee', n:1, mul:1.35,util:3, tags:['melee','mobility']},
  triple:    {kind:'ranged',n:3, mul:1.0, wep:'main', util:0, tags:['ranged','multi']},
  tumble:    {kind:'buff',  util:6, tags:['buff','mobility']},
  fortify:   {kind:'buff',  util:8, tags:['buff','defense']},
  rocketsalvo:{kind:'ranged',n:6,mul:0.44,wep:'rocket',util:0, tags:['ranged','multi','aoe']},
  mortarBarrage:{kind:'ranged',n:5, mul:0.70, wep:'mortar',util:0, tags:['ranged','multi','aoe']},
  blinkF:    {kind:'util',  util:4, tags:['mobility']},
  blinkB:    {kind:'util',  util:4, tags:['mobility']},
  spin:      {kind:'melee', n:1, mul:0.95,util:2, tags:['aoe','melee']},
  eshield:   {kind:'buff',  util:9, tags:['buff','defense']},
  shieldbash:{kind:'melee', n:1, mul:1.1, util:4, tags:['melee','mobility']},
  vulcan:    {kind:'ranged',n:18,mul:0.5, wep:'vulcan', util:3, tags:['ranged','buff']},
  overcharge:{kind:'buff',  util:7, tags:['buff','ranged']},
  twinlaser: {kind:'ranged',n:2, mul:1.15,wep:'laser', util:0, tags:['ranged','pierce','multi']},
  leapblast: {kind:'ranged',n:3, mul:1.1, wep:'main', util:3, tags:['ranged','multi','mobility']},
  cloak:     {kind:'buff',  util:8, tags:['buff']},
  shadow:    {kind:'melee', n:1, mul:1.1, util:5, tags:['melee','mobility']},
  shadowdash:{kind:'melee', n:1, mul:1.5, util:3, tags:['melee','mobility']},
  trample:   {kind:'melee', n:1, mul:1.6, util:3, tags:['melee','mobility']},
  roar:      {kind:'buff',  util:6, tags:['aoe','buff']},
  burst:     {kind:'buff',  util:7, tags:['buff']},
  arcburst:  {kind:'ranged',n:6, mul:0.58, wep:'arc', util:0, tags:['ranged','multi']},
  judgement: {kind:'ranged',n:12,mul:0.45,wep:'laser', util:2, tags:['ranged','multi','pierce','aoe']},
  oblivion:  {kind:'melee', n:1, mul:1.9, util:2, tags:['aoe','melee']},
  hellfire:  {kind:'ranged',n:6, mul:0.575,wep:'homing', util:2, tags:['ranged','homing','multi','aoe']},
  missileSalvo:{kind:'ranged',n:8,mul:0.43,wep:'homing', util:1, tags:['ranged','homing','multi','aoe']},
  rocketBarrage:{kind:'ranged',n:6,mul:0.48,wep:'rocket', util:1, tags:['ranged','multi','aoe']},
  incendiary:{kind:'ranged',n:3, mul:0.8, wep:'rocket', util:2, tags:['ranged','multi','aoe','dot']},
  drone:     {kind:'summon',n:8, mul:0.85,wep:'laser', util:6, tags:['ranged','summon','pierce']},
  drone3:    {kind:'summon',n:9, mul:0.3, wep:'laser', util:5, tags:['ranged','summon','multi']},
  cover:     {kind:'util',  util:9, tags:['defense']},
  healDrone: {kind:'util',  util:10,tags:['summon','buff']},
  lightning: {kind:'ranged',n:15,mul:0.30,wep:'laser', util:3, tags:['ranged','homing','multi']},
  iceball:   {kind:'ranged',n:1, mul:1.45,wep:'main', util:5, tags:['ranged','defense']},
  emorb:     {kind:'ranged',n:4, mul:0.55,wep:'main', util:6, tags:['ranged','defense','multi']},
};
/* 类型标签权重:追踪/召唤/持续伤害等信息量更高的类型获得额外评价分 */
const TAG_W={ ranged:1.0, melee:0.5, buff:3.2, mobility:1.6, aoe:2.2, pierce:2.6,
              homing:3.4, multi:2.0, dot:3.0, summon:3.2, defense:3.4 };
/* 角色平衡度模型:属性分(血量/速度/回复/普攻 DPS)+ 技能分(伤害×倍率 + 功能 + 类型附加 / 冷却)
 * 输出综合战力 CPR;技能分内已含「冷却折算」,短 CD 技能因可更频繁施放而收益更高。 */
function balanceOf(ch){
  const wm=WEAPONS[ch.weapon]||WEAPONS.rifle;
  const mw=MELEE_WEP[ch.meleeW||'saber'];
  const baseRangedDPS=wm.dmg*ch.bullet/wm.cd;
  /* 近战武器各有取舍:用 DPS×射程修正折算成一维近战强度 */
  const meleeVal=mw.dmg*MELEE_DMG/mw.cd*(0.8+mw.range/200)*ch.atk*roleMeleeMul(ch);
  const hpScore=ch.hp;
  const speedScore=ch.spd*0.5+ch.jump*0.10+(ch.canFly?9:0);
  const regenScore=ch.regen*0.9;
  const atkScore=baseRangedDPS*6+meleeVal*2.4;
  let skillScore=0, rangedSkills=0, buffSkills=0;
  const detail=[];
  for(const slot of ['nJ','fJ','bJ','nK','fK','bK']){
    const id=ch.skills&&ch.skills[slot]; if(!id) continue;
    const r=SKILL_RATING[id]||{kind:'buff',util:4,tags:[]}, sk=SKILLS[id]||{cd:6};
    let dmg=0;
    if(r.kind==='ranged'||r.kind==='summon'){
      const w=(r.wep&&r.wep!=='main')?(WEAPONS[r.wep]||wm):wm;
      dmg=(r.n||1)*ch.bullet*w.dmg*(r.mul||1);
    }else if(r.kind==='melee'){ dmg=(r.n||1)*ch.atk*mw.dmg*MELEE_DMG*(r.mul||1)*roleMeleeMul(ch); }
    let tagBonus=0; for(const t of (r.tags||[])) tagBonus+=(TAG_W[t]||0);
    const raw=dmg+(r.util||0)*6+tagBonus*7;
    const eff=raw/Math.max(2.5,sk.cd);
    skillScore+=eff*14;
    const tl=r.tags||[];
    if(tl.some(t=>t==='ranged'||t==='homing'||t==='summon')) rangedSkills++;
    if(tl.some(t=>t==='buff'||t==='defense')) buffSkills++;
    detail.push({slot,id,dmg:Math.round(dmg),util:r.util||0,tags:tl,eff:+eff.toFixed(1)});
  }
  const cpr=Math.round(hpScore+speedScore+regenScore+atkScore+skillScore);
  return { cpr, hp:Math.round(hpScore), speed:Math.round(speedScore), regen:Math.round(regenScore),
           atk:Math.round(atkScore), skill:Math.round(skillScore), rangedSkills, buffSkills, detail };
}
/* 全角色平衡报表:以 8 台原生机体均值为基准,输出偏离度(隐藏机体目标高于均值) */
function balanceReport(){
  const rows=CHARS.map((c,i)=>Object.assign({i,name:c.name,tag:c.tag,locked:!!c.locked},balanceOf(c)));
  const base=rows.filter(r=>!r.locked);
  const mean=base.reduce((a,r)=>a+r.cpr,0)/Math.max(1,base.length);
  for(const r of rows) r.deviate=+(((r.cpr-mean)/mean)*100).toFixed(1);
  return {mean:Math.round(mean), rows};
}
/* 技能槽键位标签(方向相对角色朝向:前=面朝方向,后=背向) */
const SLOT_LABELS={ nJ:'防J', fJ:'防前J', bJ:'防后J', nK:'防K', fK:'防前K', bK:'防后K' };
function skillBrief(ch){
  return ['nJ','fJ','bJ','nK','fK','bK'].filter(s=>ch.skills&&ch.skills[s])
    .map(s=>SLOT_LABELS[s]+SKILLS[ch.skills[s]].name).join(' ');
}

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rnd   = (a,b)=>a+Math.random()*(b-a);
const ri    = (a,b)=>Math.floor(rnd(a,b+1));

/* 选人 / 选图界面布局(机体 5×3 格、地图 4×2 格,末格均为"随机") */
const SEL_COLS=5, SEL_CX=18, SEL_CY=42, SEL_GX=90, SEL_GY=56, SEL_CW=84, SEL_CH=52;
const MAPSEL_COLS=4, MAPSEL_CX=16, MAPSEL_CY=64, MAPSEL_GX=116, MAPSEL_GY=76, MAPSEL_CW=104, MAPSEL_CH=60;

const cv = document.getElementById('cv');
const g  = cv.getContext('2d');

/* 双方配色(基础素材方案:纯代码像素调色板,见 drawMech) */
const PAL = {
  p1:{ main:'#3f6fb5', dark:'#27436f', light:'#7fb3e8', joint:'#2a3341',
       visor:'#5ff2ff', gun:'#39424f', saber:'#8df6ff', label:'P1', name:'突击者' },
  p2:{ main:'#c04b3f', dark:'#75302a', light:'#eb8f6a', joint:'#3d2c2a',
       visor:'#ffc24d', gun:'#4a4038', saber:'#ffd166', label:'P2', name:'重装兵' }
};

/* 战斗定位:melee 近战 / ranged 远程 / balanced 均衡。影响两件事——
 *   melee 近战伤害倍率:近战角色的贴身斩击更疼,远程角色贴身缠斗则明显吃亏;
 *   pref 交战距离倍率:近战角色主动贴脸,远程角色保持更远的火力间距。
 * 近战伤害乘在所有近战结算路径(挥砍/冲刺/回旋斩)与平衡模型上。 */
const ROLE={
  melee:   {name:'近战', melee:1.28, pref:0.62},
  ranged:  {name:'远程', melee:0.72, pref:1.00},
  balanced:{name:'均衡', melee:1.00, pref:1.00},
};
function roleOf(ch){ return ROLE[(ch&&ch.role)||'balanced']||ROLE.balanced; }
function roleMeleeMul(m){ const ch=(m&&m.ch)||m; return roleOf(ch).melee; }

/* 机体名册:8 种可选机甲,数值各有侧重
 * hp 血量 / spd 移速 / jump 跳力 / atk 斩击倍率 / bullet 子弹伤害
 * regen 能量回复 / size 体型 / guardMul 防御减伤
 * lore 背景故事 / skills 技能槽:防+方向+J/K 组合施放(n=无方向 f=前 b=后) */
const CHARS=[
 {name:'突击者',tag:'均衡型', role:'balanced', pal:PAL.p1, hp:107, spd:93.3, jump:250, atk:1.0,  bullet:10.4, regen:18.6, size:1.0,  weapon:'rifle', meleeW:'saber',
  lore:'前联邦侦察队长,因抗命救下小队被除役,如今以佣兵身份追寻当年被掩盖的真相。',
  skills:{nJ:'dash', nK:'triple', fJ:'cover', fK:'lightning', bJ:'tumble', bK:'drone3'}},
 {name:'重装兵',tag:'重装型', role:'melee', pal:PAL.p2, hp:168, spd:77.9, jump:230, atk:1.25, bullet:11.5, regen:26, size:1.15, weapon:'vulcan', meleeW:'hammer',
  lore:'拆迁部队出身的重炮手,信条是"一炮解决不了就三炮",弹药与义气一样充足。',
  skills:{nJ:'fortify', nK:'rocketsalvo', fJ:'cover', fK:'incendiary', bJ:'mortarBarrage', bK:'lightning'}},
 {name:'疾风',  tag:'高速型', role:'melee', pal:{main:'#7a4fc9',dark:'#4a2f7a',light:'#b18cf0',joint:'#2e2a44',visor:'#7df9ff',gun:'#3c3652',saber:'#c9a6ff'},
   hp:160, spd:149.5, jump:290, atk:0.9, bullet:15.5, regen:38, size:0.88, weapon:'vulcan', meleeW:'dagger', canFly:true, airW:'homing',
  lore:'天空竞速三连冠,厌倦了永远独跑的赛道,转而追逐刀光与音障之间的极限。',
  skills:{nJ:'overcharge', nK:'arcburst', fJ:'blinkF', fK:'iceball', bJ:'blinkB', bK:'missileSalvo'}},
 {name:'堡垒',  tag:'防卫型', role:'melee', pal:{main:'#5a7a4a',dark:'#38512e',light:'#8fb37a',joint:'#2f3829',visor:'#d8ff5e',gun:'#3e4438',saber:'#d8ff5e'},
   hp:142, spd:70, jump:220, atk:0.9,  bullet:6.9, regen:19, size:1.22, guardMul:0.10, weapon:'spread', meleeW:'greatsword',
  lore:'旧战争纪元的要塞守卫机,核心深处仍执行着数百年前最后一道守卫指令。',
  skills:{nJ:'eshield', nK:'vulcan', fJ:'shieldbash', fK:'cover', bJ:'emorb', bK:'mortarBarrage'}},
 {name:'猎手',  tag:'火力型', role:'ranged', pal:{main:'#c98436',dark:'#7a4f1f',light:'#f0b466',joint:'#43301f',visor:'#ffe27a',gun:'#4a4038',saber:'#ffd166'},
   hp:120, spd:88.9, jump:250, atk:0.85, bullet:11.3, regen:34.2, size:0.95, weapon:'laser', meleeW:'spear',
  lore:'赏金公会头号猎人,只为配得上价的猎物出枪,从不失手,也从不留情。',
  skills:{nJ:'overcharge', nK:'twinlaser', fJ:'lightning', fK:'healDrone', bJ:'leapblast', bK:'missileSalvo'}},
 {name:'幽灵',  tag:'刺客型', role:'melee', pal:{main:'#3f4a5f',dark:'#262e40',light:'#7a8aa8',joint:'#1d222e',visor:'#64f0c8',gun:'#2e3644',saber:'#64f0c8'},
   hp:166, spd:145, jump:265, atk:1.28, bullet:15.3, regen:37, size:0.85, weapon:'arc', meleeW:'dagger', canFly:true, airW:'seeker',
  lore:'暗影局最年轻的特工,全部档案已被抹消,没人见过他面具下的样子。',
  skills:{nJ:'cloak', nK:'twinlaser', fJ:'shadowdash', fK:'iceball', bJ:'blinkB', bK:'shadow'}},
 {name:'巨兽',  tag:'巨体型', role:'melee', pal:{main:'#8a5f3a',dark:'#57391f',light:'#c99a66',joint:'#382a1d',visor:'#ff9a4d',gun:'#443528',saber:'#ffb066'},
   hp:178, spd:59, jump:215, atk:1.35, bullet:8.7, regen:34, size:1.38, weapon:'rocket', meleeW:'hammer',
  lore:'远古战争机甲的最后一台,在废土下沉眠千年,苏醒后仍记得战争的味道。',
  skills:{nJ:'hellfire', nK:'roar', fJ:'trample', fK:'fortify', bJ:'mortarBarrage', bK:'rocketBarrage'}},
 {name:'新星',  tag:'能量型', role:'balanced', pal:{main:'#d86fa8',dark:'#8a3f6a',light:'#f0b4d0',joint:'#3d2a35',visor:'#ffffff',gun:'#46303c',saber:'#ffd6f0'},
   hp:140, spd:106, jump:260, atk:0.9,  bullet:15.8, regen:54.2, size:0.92, weapon:'vulcan', meleeW:'saber', canFly:true, airW:'mortar',
  lore:'天才能量学者,为验证自己的无限能源理论,亲手改装了这台失控边缘的实验机。',
   skills:{nJ:'burst', nK:'eshield', fJ:'rocketBarrage', fK:'iceball', bJ:'blinkF', bK:'healDrone'}},
 {name:'磁暴',  tag:'电磁型', role:'melee', pal:{main:'#2f8f9e',dark:'#1a5560',light:'#7fe0ee',joint:'#173034',visor:'#eaffff',gun:'#22383d',saber:'#7df9ff'},
   hp:120, spd:80, jump:234, atk:1.0, bullet:7.9, regen:15, size:1.05, weapon:'arc', meleeW:'spear',
  lore:'电磁兵器试验体,以磁场为盾、以电弧为矛。它坚称自己是被"唤醒"而非被"制造"的。',
  skills:{nJ:'emorb', nK:'twinlaser', fJ:'cover', fK:'lightning', bJ:'fortify', bK:'drone3'}},
 {name:'工匠',  tag:'工程型', role:'balanced', pal:{main:'#4a6a8a',dark:'#2c4055',light:'#8fb0cf',joint:'#22303d',visor:'#ffd166',gun:'#2f3f4f',saber:'#ffd166'},
   hp:138, spd:75, jump:240, atk:0.95, bullet:8.1, regen:19, size:1.1, weapon:'rifle', meleeW:'greatsword',
  lore:'废土第一机械师,能把一堆废铁修成堡垒。她拒绝造兵器,只造"能让人活下来的东西"。',
  skills:{nJ:'cover', nK:'drone', fJ:'healDrone', fK:'lightning', bJ:'fortify', bK:'rocketBarrage'}},
 {name:'游隼',  tag:'狙击型', role:'ranged', pal:{main:'#b8c0cc',dark:'#7a828f',light:'#f0f4fa',joint:'#5a6068',visor:'#ff5b5b',gun:'#8a929e',saber:'#ff5b5b'},
   hp:132, spd:92, jump:252, atk:0.9, bullet:13.2, regen:22, size:0.92, weapon:'laser', meleeW:'spear',
  lore:'废土游荡的独行狙击手,信奉"一枪一命,一命一价"。他的瞄准镜里,从没有目标出现过第二次。',
  skills:{nJ:'twinlaser', nK:'overcharge', fJ:'blinkF', fK:'arcburst', bJ:'eshield', bK:'missileSalvo'}},
/* —— 泛用型验证机「自由」:参考《高达 SEED》泛用机设计,肩背翼展密布光束兵装 —— */
 {name:'自由',  tag:'泛用型', role:'ranged', pal:{main:'#e6ecf5',dark:'#2b4a8f',light:'#ff7a7a',joint:'#39415a',visor:'#ffd166',gun:'#4a5568',saber:'#ff5b7f'},
   hp:115, spd:99, jump:268, atk:0.95, bullet:9.9, regen:24, size:0.95, weapon:'laser', meleeW:'saber', canFly:true, airW:'seeker',
  lore:'「种」计划遗留的泛用型验证机,肩背翼展间密布着数门光束兵装。当它张开全弹发射的瞬间,那便是自由意志最后的宣言。',
  skills:{nJ:'judgement', nK:'twinlaser', fJ:'drone3', fK:'missileSalvo', bJ:'blinkB', bK:'overcharge'}},
/* —— 以下两台为隐藏机体:通关故事模式第 9/10 关后解锁 —— */
 {name:'天罚',  tag:'审判型', role:'ranged', locked:true, unlock:9,
   pal:{main:'#c9a227',dark:'#7d6413',light:'#ffe89a',joint:'#3a3220',visor:'#fffbdc',gun:'#4a4130',saber:'#fff3b8'},
   hp:146, spd:96.9, jump:286, atk:1.32, bullet:4.55, regen:49, size:1.02, weapon:'laser', meleeW:'greatsword', canFly:true, airW:'seeker',
   pCount:1.5, pSize:1.5,   // 隐藏机体:投射物数量 ×1.5、体积 ×1.5
   lore:'自苍穹降下的审判者,以雷火裁定战场。它的每一次降临,都意味着某一方已被宣判。',
   skills:{nJ:'judgement', nK:'overcharge', fJ:'drone', fK:'lightning', bJ:'eshield', bK:'healDrone'}},
 {name:'湮灭',  tag:'终焉型', role:'balanced', locked:true, unlock:10,
   pal:{main:'#5b2a7a',dark:'#2f1540',light:'#a86ee0',joint:'#241432',visor:'#ff3b6b',gun:'#33203f',saber:'#e0a6ff'},
   hp:160, spd:84.9, jump:262, atk:1.52, bullet:6.3, regen:45, size:1.16, weapon:'rocket', meleeW:'hammer', guardMul:0.08,
   pCount:1.5, pSize:1.5,   // 隐藏机体:投射物数量 ×1.5、体积 ×1.5
   lore:'灾厄的具现,传闻它能将一切存在抹为虚无。当它睁开猩红的目镜,战场便不再有明天。',
   skills:{nJ:'oblivion', nK:'rocketsalvo', fJ:'mortarBarrage', fK:'lightning', bJ:'fortify', bK:'healDrone'}},
];
/* 训练模式靶机:不会死亡的特殊敌人 —— 用于自由练习各机体技能。
 * 速度/跳跃/攻击全为 0 且被动,完全挨打;受击正常掉血但血量下限锁定 DUMMY_HP_FLOOR,
 * 触底后停留 1 秒,再快速回满,以便直观展示各技能的伤害强度。 */
const DUMMY_HP_FLOOR=10;         // 靶机血量下限(不会低于此值)
const TRAIN_DUMMY={
  name:'训练靶机', tag:'训练用', hp:520, spd:0, jump:0, atk:0, bullet:0, regen:0, size:1.25,
  weapon:'rifle', meleeW:'saber',
  pal:{main:'#4a5566',dark:'#2b3240',light:'#9aa8bd',joint:'#1e2430',visor:'#7dff6a',gun:'#39414f',saber:'#9adcff'},
  skills:{}
};
/* AI 难度:react 决策间隔 / atkP 出手倾向 / guardP 格挡意识 / shootP 射击倾向 / retreat 后撤倾向 */
const DIFFS=[
 {name:'简单', desc:'AI 反应迟钝,适合熟悉操作', react:[0.28,0.50], atkP:0.35, guardP:0.12, shootP:0.07, retreat:0.30},
 {name:'普通', desc:'均衡的攻防节奏',           react:[0.15,0.32], atkP:0.55, guardP:0.35, shootP:0.14, retreat:0.25},
 {name:'困难', desc:'反应迅捷,攻防兼备',         react:[0.07,0.15], atkP:0.75, guardP:0.60, shootP:0.24, retreat:0.18},
];
