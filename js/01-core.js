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
const SPECTATE_STREAK_CAP = 5;     // 观赏模式:擂主连守达到此场数即强制退位,双方重新抽签(避免强机体无限守擂)

/* 动态相机:zoom 按战场单位包围盒连续平滑追踪(不再量化,避免阶梯跳变) */
const CAM={ zoom:1, zEff:1, cx:W/2, cy:H/2 };
const ZMIN=0.6, ZMAX=1.5;          // 可缩放范围:拉远看全局战场 / 拉近看贴身缠斗
const ULT_MAX=100, ULT_GAIN=0.8;   // 终结技能量:造成伤害积累,满 100 后 J+K 施放

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
  dash:      {name:'冲刺斩',   cd:4,   desc:'向前猛冲,路径造成 1.35× 斩击'},
  triple:    {name:'速射三连', cd:5,   desc:'瞬间连射 3 发主武器弹药(不耗能)'},
  tumble:    {name:'战术翻滚', cd:6,   desc:'向后翻滚拉开距离,2.5 秒移速 +50%'},
  fortify:   {name:'震荡壁垒', cd:9,   desc:'3 秒受伤减半且免疫击退'},
  rocketsalvo:{name:'火箭齐射',cd:8,   desc:'不耗能快速齐射 6 枚火箭'},
  mortarBarrage:{name:'多发迫击炮',cd:9, desc:'一次抛射 5 枚迫击炮弹,散落目标区域并范围爆炸'},
  blinkF:    {name:'瞬步突进', cd:3.5, desc:'向面朝方向瞬移 70px'},
  blinkB:    {name:'残影回撤', cd:3.5, desc:'向身后瞬移 70px,瞬间拉开距离'},
  spin:      {name:'回旋斩',   cd:5,   desc:'旋转光剑,周身范围斩击'},
  eshield:   {name:'能量护盾', cd:8,   desc:'2.8 秒完全格挡所有伤害'},
  shieldbash:{name:'盾击冲锋', cd:6,   desc:'举盾冲锋,将对手狠狠撞飞'},
  vulcan:    {name:'火神炮模式',cd:9,  desc:'坐地机炮形态:1.6 秒内自动向对手倾泻 5 连发扇形弹幕,期间受伤 -20%'},
  overcharge:{name:'过载射击', cd:12,  desc:'4.5 秒射击不耗能、射速提升'},
  twinlaser: {name:'双束狙击', cd:7,   desc:'上下双光束同时狙击,穿透一切'},
  leapblast: {name:'后跃齐射', cd:7,   desc:'向后跃起的同时向前散射 3 束火力'},
  cloak:     {name:'光学迷彩', cd:10,  desc:'2.5 秒隐身,下次攻击 1.8× 伤害'},
  shadow:    {name:'影袭',     cd:6,   desc:'瞬移到对手背后并斩击'},
  shadowdash:{name:'疾影斩',   cd:6,   desc:'化作残影突进,路径造成 1.5× 斩击'},
  trample:   {name:'巨兽冲撞', cd:7,   desc:'狂暴冲锋,撞击造成 1.6× 伤害并击飞'},
  roar:      {name:'战吼',     cd:9,   desc:'震退周围敌人,2.5 秒免疫击退硬直'},
  burst:     {name:'能量爆发', cd:11,  desc:'能量回满,3 秒回复 ×3'},
  arcburst:  {name:'星弧连射', cd:6,   desc:'扇形射出 6 道电弧弹'},
  judgement: {name:'天罚审判', cd:10,  desc:'周身爆发 8 道环形审判弹幕,全方位压制'},
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
  /* —— 签名技:每台机体专属,全游戏唯一(对应 nJ 槽) —— */
  magnetpull:{name:'磁力牵引',   cd:9,  desc:'展开强磁场,将附近敌人拽向自身并磁力干扰减速'},
  marklock:  {name:'标记锁定',   cd:11, desc:'锁定最近敌人一击命中并标记其弱点,4 秒内受创加重'},
  rebuildfield:{name:'重建立场', cd:18, desc:'展开重建立场,召唤修复无人机 8 秒持续为自身充能回血'},
  fullburst: {name:'全弹发射',   cd:12, desc:'展开全部光束兵装,向前倾泻 8 道贯穿光束'},
  judgementpillar:{name:'裁决光柱',cd:10,desc:'在敌人脚下降下裁决光柱,范围重创并击飞'},
  sonicdash: {name:'音爆冲刺',   cd:6,  desc:'突破音障的高速冲刺,路径造成 1.45× 斩击并重击退'},
  /* —— 近战/召唤/反制类技能(第 2 层机制扩展) —— */
  hammerorbit:{name:'环绕战锤',   cd:8,  desc:'召唤能量战锤绕身高速旋转 2.6 秒,触及敌人即重击并击退'},
  quakewave:  {name:'地震波',     cd:8,  desc:'锤击地面激起向前推进的地震波,击飞路径上的敌人'},
  groundburst:{name:'连环地裂',   cd:9,  desc:'向前连续引爆 4 段地面,逐段撕裂并重创接触的敌人'},
  mechbird:   {name:'机械隼',     cd:14, desc:'召唤机械隼悬停身侧,每 0.8~1.4 秒向敌人发射穿透性激光'},
  shieldbreak:{name:'破盾重击',   cd:9,  desc:'蓄力重击,击碎目标的护盾与壁垒并追加伤害(克制增益流)'},
  antidrone:  {name:'干扰脉冲',   cd:10, desc:'释放干扰脉冲,清除范围内敌方弹幕与浮游炮,并造成范围伤害与迟滞(克制召唤/弹幕流)'},
  reveal:     {name:'侦察脉冲',   cd:9,  desc:'扫描战场,解除敌方隐身并标记其弱点使其更易受创(克制隐身流)'},
  /* —— 第 4 层:每台机体专属技能(全游戏唯一,不含终结技) —— */
  suppressfire:{name:'压制火网', cd:7,  desc:'向前方倾泻 7 发压制弹,命中减速'},
  smokebomb:  {name:'烟幕脱离', cd:7,  desc:'向后撤离并展开烟幕,短暂隐身'},
  ironcharge: {name:'铁壁冲撞', cd:6,  desc:'举盾重装冲撞,撞飞并迟滞敌人'},
  bulwark:    {name:'钢壁架势', cd:9,  desc:'3 秒受伤减半、免疫击退,但移速下降'},
  ammodrop:   {name:'弹药补给', cd:12, desc:'展开补给箱,回复生命与能量并短暂提升射速'},
  railpiercer:{name:'疾光贯刺', cd:8,  desc:'发射一发高速贯穿光束,重创直线上的敌人'},
  afterimage: {name:'残像突进', cd:6,  desc:'高速前突并留下残像,短暂无敌'},
  windblade:  {name:'风刃回旋', cd:6,  desc:'扇形射出 5 道风刃,命中减速'},
  backflip:   {name:'空翻脱离', cd:5,  desc:'向后空翻撤离并短暂加速'},
  tailwind:   {name:'顺风',     cd:11, desc:'4 秒移速与射速提升'},
  siegecannon:{name:'要塞重炮', cd:9,  desc:'抛射 3 发大口径炮弹,范围爆炸'},
  aegis:      {name:'守护力场', cd:10, desc:'展开 2.6 秒守护力场,大幅减伤'},
  executionshot:{name:'处决射击',cd:9, desc:'狙击最近敌人,目标残血时伤害提高'},
  grapple:    {name:'钩索突进', cd:6,  desc:'钩索前突,命中造成伤害并减速'},
  clusterbomb:{name:'集束炸弹', cd:9,  desc:'抛射 5 枚集束炸弹,覆盖目标区域'},
  voidstab:   {name:'虚空刺',   cd:8,  desc:'瞬移至目标背后重刺,对被标记目标额外增伤'},
  nightfall:  {name:'夜幕领域', cd:11, desc:'在自身周围展开暗影领域,持续伤害并减速'},
  meteorcharge:{name:'陨石冲撞',cd:7, desc:'向前冲撞并击飞,落地产生范围冲击'},
  teslacoil:  {name:'电弧线圈', cd:12, desc:'部署电弧线圈,持续电击最近敌人'},
  rocketjump: {name:'火箭跃击', cd:7,  desc:'向后跃起并向前发射 2 枚火箭'},
  dive:       {name:'俯冲掠袭', cd:6,  desc:'向前俯冲,命中造成伤害并标记弱点'},
  flare:      {name:'干扰闪光', cd:7,  desc:'后撤并释放闪光,令附近敌人减速'},
  phasewings: {name:'相位翼',   cd:6,  desc:'相位前突,短暂无敌'},
  dronebarrage:{name:'浮游齐射',cd:11, desc:'召唤 2 架浮游炮协同点射'},
  prismwall:  {name:'棱镜屏障', cd:10, desc:'展开棱镜屏障,阻挡弹药并提供短暂护盾'},
  repairfield:{name:'纳米修复场',cd:12,desc:'召唤 2 架修复无人机持续回血'},
  divinebeam: {name:'神罚光束', cd:10, desc:'锁定敌人降下 8 道天罚光束'},
  seraphrush: {name:'炽翼突进', cd:6,  desc:'向前突进并标记路径上的敌人'},
  orbitaljudgement:{name:'轨道裁决',cd:10,desc:'在目标区域降下 3 道裁决光柱'},
  sanctuary:  {name:'圣域',     cd:11, desc:'展开圣域,减伤、免疫击退并回复少量生命'},
  grace:      {name:'恩泽',     cd:12, desc:'回复生命与能量,并短暂提升回复速度'},
  singularity:{name:'奇点坍缩', cd:10, desc:'在敌人位置生成奇点,吸附并持续伤害'},
  voidstep:   {name:'虚空步',   cd:6,  desc:'向前瞬移并留下爆炸残影'},
  entropyrain:{name:'熵能雨',   cd:10, desc:'在目标区域降下 6 枚熵能弹'},
  nullfield:  {name:'虚无领域', cd:11, desc:'展开虚无领域,持续伤害并大幅减速'},
  devour:     {name:'吞噬',     cd:9,  desc:'撕咬最近敌人并吸取生命'},
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
  spin:      {kind:'melee', n:1, mul:1.25,util:2, tags:['aoe','melee']},
  eshield:   {kind:'buff',  util:9, tags:['buff','defense']},
  shieldbash:{kind:'melee', n:1, mul:1.1, util:4, tags:['melee','mobility']},
  vulcan:    {kind:'ranged',n:40,mul:0.5, wep:'vulcan', util:3, tags:['ranged','buff']},
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
  judgement: {kind:'ranged',n:8, mul:0.6, wep:'laser', util:2, tags:['ranged','multi','pierce','aoe']},
  oblivion:  {kind:'melee', n:1, mul:2.4, util:2, tags:['aoe','melee']},
  hellfire:  {kind:'ranged',n:6, mul:0.575,wep:'homing', util:2, tags:['ranged','homing','multi','aoe']},
  missileSalvo:{kind:'ranged',n:8,mul:0.43,wep:'homing', util:1, tags:['ranged','homing','multi','aoe']},
  rocketBarrage:{kind:'ranged',n:6,mul:0.48,wep:'rocket', util:1, tags:['ranged','multi','aoe']},
  incendiary:{kind:'ranged',n:3, mul:0.65, wep:'rocket', util:2, tags:['ranged','multi','aoe','dot']},
  drone:     {kind:'summon',n:8, mul:0.85,wep:'laser', util:6, tags:['ranged','summon','pierce']},
  drone3:    {kind:'summon',n:9, mul:0.3, wep:'laser', util:5, tags:['ranged','summon','multi']},
  cover:     {kind:'util',  util:9, tags:['defense']},
  healDrone: {kind:'util',  util:10,tags:['summon','buff']},
  lightning: {kind:'ranged',n:15,mul:0.30,wep:'laser', util:3, tags:['ranged','homing','multi']},
  iceball:   {kind:'ranged',n:1, mul:1.45,wep:'main', util:5, tags:['ranged','defense']},
  emorb:     {kind:'ranged',n:4, mul:0.55,wep:'main', util:6, tags:['ranged','defense','multi']},
  magnetpull:{kind:'melee', n:1, mul:0.6, util:6, tags:['melee','aoe','mobility']},
  marklock:  {kind:'ranged',n:1, mul:1.5, wep:'laser', util:6, tags:['ranged','pierce','homing']},
  rebuildfield:{kind:'util',util:8, tags:['summon','buff','defense']},
  fullburst: {kind:'ranged',n:8, mul:0.45, wep:'laser', util:1, tags:['ranged','multi','pierce','aoe']},
  judgementpillar:{kind:'ranged',n:1, mul:3.2, wep:'laser', util:3, tags:['ranged','aoe','pierce']},
  sonicdash: {kind:'melee', n:1, mul:1.45,util:4, tags:['melee','mobility','aoe']},
  hammerorbit:{kind:'melee', n:1, mul:0.7, util:4, tags:['melee','aoe','dot']},
  quakewave:  {kind:'melee', n:1, mul:1.15,util:4, tags:['melee','aoe','mobility']},
  groundburst:{kind:'melee', n:4, mul:0.45, util:3, tags:['melee','aoe','multi']},
  mechbird:   {kind:'summon',n:6, mul:0.9, wep:'laser', util:6, tags:['ranged','summon','pierce']},
  shieldbreak:{kind:'melee', n:1, mul:1.20,util:5, tags:['melee','buff']},
  antidrone:  {kind:'ranged',n:1, mul:1.20,wep:'laser', util:6, tags:['ranged','aoe','summon','defense']},
  reveal:     {kind:'util',  util:6, tags:['buff','homing']},
  suppressfire:{kind:'ranged',n:7,mul:0.7,wep:'main',util:0,tags:['ranged','multi']},
  smokebomb:  {kind:'buff',  util:6, tags:['buff','mobility']},
  ironcharge: {kind:'melee', n:1, mul:0.72,util:3, tags:['melee','mobility']},
  bulwark:    {kind:'buff',  util:8, tags:['buff','defense']},
  ammodrop:   {kind:'util',  util:8, tags:['buff','summon']},
  railpiercer:{kind:'ranged',n:1, mul:3.2, wep:'laser', util:1, tags:['ranged','pierce']},
  afterimage: {kind:'melee', n:1, mul:1.1, util:4, tags:['melee','mobility']},
  windblade:  {kind:'ranged',n:5, mul:0.6, wep:'arc', util:0, tags:['ranged','multi']},
  backflip:   {kind:'buff',  util:5, tags:['buff','mobility']},
  tailwind:   {kind:'buff',  util:7, tags:['buff','mobility']},
  siegecannon:{kind:'ranged',n:3, mul:1.05,wep:'mortar', util:1, tags:['ranged','multi','aoe']},
  aegis:      {kind:'buff',  util:9, tags:['buff','defense']},
  executionshot:{kind:'ranged',n:1,mul:3.0,wep:'laser', util:2, tags:['ranged','pierce']},
  grapple:    {kind:'melee', n:1, mul:1.2, util:4, tags:['melee','mobility']},
  clusterbomb:{kind:'ranged',n:5, mul:0.6, wep:'rocket', util:1, tags:['ranged','multi','aoe']},
  voidstab:   {kind:'melee', n:1, mul:2.2, util:4, tags:['melee','mobility']},
  nightfall:  {kind:'ranged',n:6, mul:0.4, wep:'main', util:4, tags:['ranged','aoe','dot']},
  meteorcharge:{kind:'melee',n:1, mul:1.7, util:4, tags:['melee','aoe','mobility']},
  teslacoil:  {kind:'summon',n:10,mul:1.0, wep:'laser', util:5, tags:['summon','ranged']},
  rocketjump: {kind:'ranged',n:2, mul:0.9, wep:'rocket', util:3, tags:['ranged','mobility','multi']},
  dive:       {kind:'melee', n:1, mul:1.3, util:3, tags:['melee','mobility']},
  flare:      {kind:'buff',  util:5, tags:['buff','mobility']},
  phasewings: {kind:'melee', n:1, mul:0.6, util:4, tags:['melee','mobility','defense']},
  dronebarrage:{kind:'summon',n:6,mul:0.28,wep:'laser', util:4, tags:['summon','multi']},
  prismwall:  {kind:'util',  util:9, tags:['defense']},
  repairfield:{kind:'util',  util:10,tags:['summon','buff']},
  divinebeam: {kind:'ranged',n:8, mul:0.55,wep:'laser', util:2, tags:['ranged','aoe','multi']},
  seraphrush: {kind:'melee', n:1, mul:1.4, util:3, tags:['melee','mobility']},
  orbitaljudgement:{kind:'ranged',n:3,mul:1.2,wep:'mortar', util:1, tags:['ranged','aoe','multi']},
  sanctuary:  {kind:'buff',  util:8, tags:['buff','defense']},
  grace:      {kind:'util',  util:9, tags:['buff']},
  singularity:{kind:'ranged',n:6, mul:0.5, wep:'main', util:5, tags:['ranged','aoe','dot']},
  voidstep:   {kind:'melee', n:1, mul:1.5, util:4, tags:['melee','mobility']},
  entropyrain:{kind:'ranged',n:6, mul:0.65,wep:'mortar', util:1, tags:['ranged','multi','aoe']},
  nullfield:  {kind:'ranged',n:6, mul:0.4, wep:'main', util:5, tags:['ranged','aoe','dot']},
  devour:     {kind:'ranged',n:1, mul:1.8, wep:'main', util:5, tags:['ranged','buff']},
};
/* 新技能机制表:kind 决定通用实现,dash/volley/lob/buff/summon/zone/execute/teleportStrike/leap/beam/drain。
 * 参数与技能评分分开,便于后续单独调数值;aiR/aiP 供 AI 判断施放距离与概率。 */
const SKILL_VARIANTS={
  suppressfire:{kind:'volley',wep:'rifle',n:7,arc:0.22,dmgMul:0.7,slow:1.2,aiR:[70,260],aiP:0.55},
  smokebomb:{kind:'dash',dir:-1,spd:620,dur:0.18,dmgMul:0,cloak:1.6,speed:1.5,aiR:[0,90],aiP:0.5},
  ironcharge:{kind:'dash',dir:1,spd:560,dur:0.22,dmgMul:0.72,kb:260,shield:0.22,slow:0.8,aiR:[70,200],aiP:0.6},
  bulwark:{kind:'buff',fortify:3,castSlow:1.4,aiR:[0,150],aiP:0.4},
  ammodrop:{kind:'buff',heal:20,energy:100,over:1.8,aiR:[0,999],aiP:0.45},
  railpiercer:{kind:'volley',wep:'laser',n:1,arc:0,dmgMul:3.2,pierce:true,speedMul:1.35,aiR:[120,420],aiP:0.55},
  afterimage:{kind:'dash',dir:1,spd:700,dur:0.2,dmgMul:1.1,kb:150,shield:0.24,aiR:[80,220],aiP:0.6},
  windblade:{kind:'volley',wep:'arc',n:5,arc:0.16,dmgMul:0.6,slow:0.7,kb:100,aiR:[60,240],aiP:0.55},
  backflip:{kind:'dash',dir:-1,spd:560,dur:0.18,dmgMul:0,speed:1.3,aiR:[0,90],aiP:0.5},
  tailwind:{kind:'buff',speed:4,over:4,aiR:[0,999],aiP:0.45},
  siegecannon:{kind:'lob',n:3,wep:'mortar',dmgMul:1.05,aoe:44,spread:46,aiR:[100,360],aiP:0.55},
  aegis:{kind:'buff',shield:2.6,fortify:2.6,aiR:[0,160],aiP:0.5},
  executionshot:{kind:'execute',dmgMul:3.0,executeBonus:1.8,aiR:[150,420],aiP:0.6},
  grapple:{kind:'dash',dir:1,spd:640,dur:0.2,dmgMul:1.2,kb:140,slow:1.0,aiR:[100,260],aiP:0.55},
  clusterbomb:{kind:'lob',n:5,wep:'rocket',dmgMul:0.6,aoe:30,spread:70,aiR:[100,340],aiP:0.55},
  voidstab:{kind:'teleportStrike',dmgMul:2.2,markBonus:1.5,aiR:[0,260],aiP:0.6},
  nightfall:{kind:'zone',zoneKind:'void',r:90,t:3,dmg:6,tick:0.35,slow:1.5,aiR:[0,140],aiP:0.5},
  meteorcharge:{kind:'dash',dir:1,spd:520,dur:0.28,dmgMul:1.7,kb:300,aoe:40,aiR:[90,220],aiP:0.55},
  teslacoil:{kind:'summon',droneKind:'coil',n:1,t:11,dmgMul:1.0,aiR:[0,999],aiP:0.5},
  rocketjump:{kind:'leap',wep:'rocket',n:2,arc:0.2,dmgMul:0.9,aiR:[80,260],aiP:0.5},
  dive:{kind:'dash',dir:1,spd:600,dur:0.2,dmgMul:1.3,kb:120,mark:2.5,aiR:[100,260],aiP:0.55},
  flare:{kind:'dash',dir:-1,spd:520,dur:0.16,dmgMul:0,auraSlow:1.6,aiR:[0,120],aiP:0.5},
  phasewings:{kind:'dash',dir:1,spd:680,dur:0.2,dmgMul:0.6,kb:100,shield:0.15,aiR:[80,240],aiP:0.55},
  dronebarrage:{kind:'summon',droneKind:'tri',n:2,t:4,dmgMul:0.28,aiR:[0,999],aiP:0.5},
  prismwall:{kind:'buff',shield:2,cover:true,aiR:[0,160],aiP:0.5},
  repairfield:{kind:'summon',droneKind:'heal',n:2,t:8,heal:8,aiR:[0,999],aiP:0.5},
  divinebeam:{kind:'beam',n:8,gap:0.18,dmgMul:0.55,aiR:[100,420],aiP:0.55},
  seraphrush:{kind:'dash',dir:1,spd:620,dur:0.22,dmgMul:1.4,kb:180,mark:2,aiR:[90,240],aiP:0.55},
  orbitaljudgement:{kind:'lob',n:3,wep:'mortar',dmgMul:1.2,aoe:50,spread:60,aiR:[100,360],aiP:0.55},
  sanctuary:{kind:'buff',shield:1.6,fortify:2.5,heal:12,aiR:[0,160],aiP:0.5},
  grace:{kind:'buff',heal:38,energy:60,regen:2.5,aiR:[0,999],aiP:0.5},
  singularity:{kind:'zone',zoneKind:'gravity',r:80,t:1.8,dmg:5,tick:0.25,pull:true,slow:1.5,aiR:[80,300],aiP:0.55},
  voidstep:{kind:'dash',dir:1,spd:700,dur:0.18,dmgMul:1.5,kb:160,aiR:[90,240],aiP:0.55},
  entropyrain:{kind:'lob',n:6,wep:'mortar',dmgMul:0.65,aoe:34,spread:90,aiR:[100,380],aiP:0.55},
  nullfield:{kind:'zone',zoneKind:'void',r:95,t:2.5,dmg:4,tick:0.4,slow:2,aiR:[0,160],aiP:0.5},
  devour:{kind:'drain',dmgMul:1.8,healRatio:0.65,aiR:[0,180],aiP:0.55},
};
/* 终结技:J+K 施放,能量满 100 后可用,施放后清零。每个角色唯一。 */
const ULTIMATES={
  ultBarrage:    {name:'苍穹隼群', desc:'召唤 3 架强化机械隼,以远超普通召唤的频率与数量倾泻穿透激光'},
  ultEarthbreaker:{name:'湮地锤阵',desc:'展开双锤风暴,能量战锤环绕自身持续重击并击飞敌人'},
  ultSonicStorm: {name:'音速风暴', desc:'连续音爆突进,穿越路径并多次重创敌人'},
  ultFortress:   {name:'绝对要塞', desc:'盾击冲阵并展开要塞火力,召唤 3 架浮游炮协同轰击'},
  ultDeadeye:    {name:'双星贯日', desc:'释放强化双束狙击阵列,贯穿并标记目标'},
  ultAssassinate:{name:'暗影降临', desc:'隐入暗影,瞬移处决目标并留下夜幕领域'},
  ultCataclysm:  {name:'地脉崩解', desc:'向前后释放多重地震波,撕裂整片地面'},
  ultSupernova:  {name:'超新星',   desc:'能量爆发强化:持续释放环形能量脉冲并回复能量'},
  ultSingularity:{name:'磁暴奇点', desc:'制造强化奇点,吸附敌人并引发连锁雷击'},
  ultWorkshop:   {name:'战争工坊', desc:'展开工坊,召唤电弧线圈、浮游炮与修复无人机'},
  ultSkyfall:    {name:'天穹标记', desc:'标记全场敌人,连续降下强化狙击光束'},
  ultFullBurst:  {name:'全弹解放', desc:'全弹发射强化:连续多轮倾泻贯穿光束与导弹'},
  ultJudgement:  {name:'终焉审判', desc:'连续降下多重裁决光柱,裁定战场'},
  ultZero:       {name:'归零',     desc:'展开湮灭领域,吸附并持续撕裂周围一切'},
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

/* 选人 / 选图界面布局(机体 5×3 正方形头像格、地图 4×2 格,末格均为"随机") */
const SEL_COLS=5, SEL_ROWS=3, SEL_CX=125, SEL_CY=72, SEL_GX=46, SEL_GY=46, SEL_CW=42, SEL_CH=42;
/* 主界面左下角难度选择 / 右下角 BGM 面板(绘制与点击命中共用) */
const DIFFSEL_X=12, DIFFSEL_Y=250, DIFFSEL_W=36, DIFFSEL_H=12, DIFFSEL_GAP=5;
const MUSICBTN_X=400, MUSICBTN_Y=248, MUSICBTN_W=68, MUSICBTN_H=12;
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
 {name:'突击者',tag:'均衡型', role:'balanced', pal:PAL.p1, hp:156, spd:93.3, jump:250, atk:1.0,  bullet:12.0, regen:34, size:1.0,  weapon:'rifle', meleeW:'saber',
  lore:'前联邦侦察队长,因抗命救下小队被除役,如今以佣兵身份追寻当年被掩盖的真相。',
  ult:'ultBarrage',
  skills:{nJ:'triple', nK:'rocketsalvo', fJ:'dash', fK:'suppressfire', bJ:'smokebomb', bK:'mechbird'}},
 {name:'重装兵',tag:'重装型', role:'melee', pal:PAL.p2, hp:130, spd:77.9, jump:230, atk:1.25, bullet:9.0, regen:20, size:1.15, weapon:'vulcan', meleeW:'hammer',
  lore:'拆迁部队出身的重炮手,信条是"一炮解决不了就三炮",弹药与义气一样充足。',
  ult:'ultEarthbreaker',
  skills:{nJ:'hammerorbit', nK:'vulcan', fJ:'ironcharge', fK:'groundburst', bJ:'bulwark', bK:'ammodrop'}},
 {name:'疾风',  tag:'高速型', role:'melee', pal:{main:'#7a4fc9',dark:'#4a2f7a',light:'#b18cf0',joint:'#2e2a44',visor:'#7df9ff',gun:'#3c3652',saber:'#c9a6ff'},
   hp:220, spd:149.5, jump:290, atk:0.9, bullet:16.6, regen:46, size:0.88, weapon:'vulcan', meleeW:'dagger', canFly:true, airW:'homing',
  lore:'天空竞速三连冠,厌倦了永远独跑的赛道,转而追逐刀光与音障之间的极限。',
  ult:'ultSonicStorm',
  skills:{nJ:'sonicdash', nK:'railpiercer', fJ:'afterimage', fK:'windblade', bJ:'backflip', bK:'tailwind'}},
 {name:'堡垒',  tag:'防卫型', role:'melee', pal:{main:'#5a7a4a',dark:'#38512e',light:'#8fb37a',joint:'#2f3829',visor:'#d8ff5e',gun:'#3e4438',saber:'#d8ff5e'},
   hp:220, spd:70, jump:220, atk:0.9,  bullet:8.8, regen:37, size:1.22, guardMul:0.10, weapon:'spread', meleeW:'greatsword',
  lore:'旧战争纪元的要塞守卫机,核心深处仍执行着数百年前最后一道守卫指令。',
  ult:'ultFortress',
  skills:{nJ:'shieldbash', nK:'siegecannon', fJ:'blinkF', fK:'mortarBarrage', bJ:'aegis', bK:'shieldbreak'}},
 {name:'猎手',  tag:'火力型', role:'ranged', pal:{main:'#c98436',dark:'#7a4f1f',light:'#f0b466',joint:'#43301f',visor:'#ffe27a',gun:'#4a4038',saber:'#ffd166'},
   hp:126, spd:88.9, jump:250, atk:0.85, bullet:11.3, regen:34.2, size:0.95, weapon:'laser', meleeW:'spear',
  lore:'赏金公会头号猎人,只为配得上价的猎物出枪,从不失手,也从不留情。',
  ult:'ultDeadeye',
  skills:{nJ:'twinlaser', nK:'executionshot', fJ:'grapple', fK:'clusterbomb', bJ:'leapblast', bK:'drone'}},
 {name:'幽灵',  tag:'刺客型', role:'melee', pal:{main:'#3f4a5f',dark:'#262e40',light:'#7a8aa8',joint:'#1d222e',visor:'#64f0c8',gun:'#2e3644',saber:'#64f0c8'},
   hp:130, spd:145, jump:265, atk:1.28, bullet:13.2, regen:37, size:0.85, weapon:'arc', meleeW:'dagger', canFly:true, airW:'seeker',
  lore:'暗影局最年轻的特工,全部档案已被抹消,没人见过他面具下的样子。',
  ult:'ultAssassinate',
  skills:{nJ:'cloak', nK:'voidstab', fJ:'shadowdash', fK:'nightfall', bJ:'blinkB', bK:'shadow'}},
 {name:'巨兽',  tag:'巨体型', role:'melee', pal:{main:'#8a5f3a',dark:'#57391f',light:'#c99a66',joint:'#382a1d',visor:'#ff9a4d',gun:'#443528',saber:'#ffb066'},
   hp:202, spd:59, jump:215, atk:1.35, bullet:9.8, regen:34, size:1.38, weapon:'rocket', meleeW:'hammer',
  lore:'远古战争机甲的最后一台,在废土下沉眠千年,苏醒后仍记得战争的味道。',
  ult:'ultCataclysm',
  skills:{nJ:'quakewave', nK:'hellfire', fJ:'meteorcharge', fK:'incendiary', bJ:'fortify', bK:'roar'}},
 {name:'新星',  tag:'能量型', role:'balanced', pal:{main:'#d86fa8',dark:'#8a3f6a',light:'#f0b4d0',joint:'#3d2a35',visor:'#ffffff',gun:'#46303c',saber:'#ffd6f0'},
   hp:220, spd:106, jump:260, atk:0.9,  bullet:17.0, regen:78, size:0.92, weapon:'vulcan', meleeW:'saber', canFly:true, airW:'mortar',
  lore:'天才能量学者,为验证自己的无限能源理论,亲手改装了这台失控边缘的实验机。',
  ult:'ultSupernova',
   skills:{nJ:'burst', nK:'judgement', fJ:'spin', fK:'arcburst', bJ:'eshield', bK:'healDrone'}},
 {name:'磁暴',  tag:'电磁型', role:'melee', pal:{main:'#2f8f9e',dark:'#1a5560',light:'#7fe0ee',joint:'#173034',visor:'#eaffff',gun:'#22383d',saber:'#7df9ff'},
   hp:134, spd:80, jump:234, atk:1.0, bullet:8.2, regen:20, size:1.05, weapon:'arc', meleeW:'spear',
  lore:'电磁兵器试验体,以磁场为盾、以电弧为矛。它坚称自己是被"唤醒"而非被"制造"的。',
  ult:'ultSingularity',
  skills:{nJ:'magnetpull', nK:'lightning', fJ:'trample', fK:'emorb', bJ:'tumble', bK:'drone3'}},
 {name:'工匠',  tag:'工程型', role:'balanced', pal:{main:'#4a6a8a',dark:'#2c4055',light:'#8fb0cf',joint:'#22303d',visor:'#ffd166',gun:'#2f3f4f',saber:'#ffd166'},
   hp:158, spd:75, jump:240, atk:0.95, bullet:8.4, regen:27, size:1.1, weapon:'rifle', meleeW:'greatsword',
  lore:'废土第一机械师,能把一堆废铁修成堡垒。她拒绝造兵器,只造"能让人活下来的东西"。',
  ult:'ultWorkshop',
  skills:{nJ:'rebuildfield', nK:'teslacoil', fJ:'rocketjump', fK:'rocketBarrage', bJ:'cover', bK:'antidrone'}},
 {name:'游隼',  tag:'狙击型', role:'ranged', pal:{main:'#b8c0cc',dark:'#7a828f',light:'#f0f4fa',joint:'#5a6068',visor:'#ff5b5b',gun:'#8a929e',saber:'#ff5b5b'},
   hp:142, spd:92, jump:252, atk:0.9, bullet:12.4, regen:25, size:0.92, weapon:'laser', meleeW:'spear',
  lore:'废土游荡的独行狙击手,信奉"一枪一命,一命一价"。他的瞄准镜里,从没有目标出现过第二次。',
  ult:'ultSkyfall',
  skills:{nJ:'marklock', nK:'missileSalvo', fJ:'dive', fK:'iceball', bJ:'flare', bK:'reveal'}},
/* —— 泛用型验证机「自由」:参考《高达 SEED》泛用机设计,肩背翼展密布光束兵装 —— */
 {name:'自由',  tag:'泛用型', role:'ranged', pal:{main:'#e6ecf5',dark:'#2b4a8f',light:'#ff7a7a',joint:'#39415a',visor:'#ffd166',gun:'#4a5568',saber:'#ff5b7f'},
   hp:170, spd:99, jump:268, atk:0.95, bullet:10.0, regen:38, size:0.95, weapon:'laser', meleeW:'saber', canFly:true, airW:'seeker',
  lore:'「种」计划遗留的泛用型验证机,肩背翼展间密布着数门光束兵装。当它张开全弹发射的瞬间,那便是自由意志最后的宣言。',
  ult:'ultFullBurst',
  skills:{nJ:'fullburst', nK:'overcharge', fJ:'phasewings', fK:'dronebarrage', bJ:'prismwall', bK:'repairfield'}},
/* —— 以下两台为隐藏机体:通关故事模式第 9/10 关后解锁 —— */
 {name:'天罚',  tag:'审判型', role:'ranged', locked:true, unlock:9,
   pal:{main:'#c9a227',dark:'#7d6413',light:'#ffe89a',joint:'#3a3220',visor:'#fffbdc',gun:'#4a4130',saber:'#fff3b8'},
   hp:194, spd:96.9, jump:286, atk:1.32, bullet:6.6, regen:72, size:1.02, weapon:'laser', meleeW:'greatsword', canFly:true, airW:'seeker',
   pCount:1.5, pSize:1.5,   // 隐藏机体:投射物数量 ×1.5、体积 ×1.5
   lore:'自苍穹降下的审判者,以雷火裁定战场。它的每一次降临,都意味着某一方已被宣判。',
   ult:'ultJudgement',
   skills:{nJ:'judgementpillar', nK:'divinebeam', fJ:'seraphrush', fK:'orbitaljudgement', bJ:'sanctuary', bK:'grace'}},
 {name:'湮灭',  tag:'终焉型', role:'balanced', locked:true, unlock:10,
   pal:{main:'#5b2a7a',dark:'#2f1540',light:'#a86ee0',joint:'#241432',visor:'#ff3b6b',gun:'#33203f',saber:'#e0a6ff'},
   hp:180, spd:84.9, jump:262, atk:1.52, bullet:7.9, regen:45, size:1.16, weapon:'rocket', meleeW:'hammer', guardMul:0.08,
   pCount:1.5, pSize:1.5,   // 隐藏机体:投射物数量 ×1.5、体积 ×1.5
   lore:'灾厄的具现,传闻它能将一切存在抹为虚无。当它睁开猩红的目镜,战场便不再有明天。',
   ult:'ultZero',
   skills:{nJ:'oblivion', nK:'singularity', fJ:'voidstep', fK:'entropyrain', bJ:'nullfield', bK:'devour'}},
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
 {name:'简单', desc:'AI 反应较慢,但会主动射击与进攻', react:[0.23,0.40], atkP:0.52, guardP:0.22, shootP:0.13, retreat:0.26},
 {name:'普通', desc:'均衡的攻防节奏',           react:[0.15,0.32], atkP:0.55, guardP:0.35, shootP:0.14, retreat:0.25},
 {name:'困难', desc:'反应迅捷,攻防兼备',         react:[0.07,0.15], atkP:0.75, guardP:0.60, shootP:0.24, retreat:0.18},
];
