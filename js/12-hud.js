/* =========================================================================
 * 机甲对决 MECH DUEL · 12-hud.js
 * HUD 与各界面绘制
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 10. HUD 与界面 ---------------- */
function text(str,x,y,size,col,align='left',base='top'){
  g.font='bold '+size+'px "Courier New",monospace';
  g.textAlign=align; g.textBaseline=base;
  g.fillStyle=col; g.fillText(str,x,y);
}
function shadowText(str,x,y,size,col,align='left'){
  text(str,x+2,y+2,size,'rgba(0,0,0,.7)',align);
  text(str,x,y,size,col,align);
}
function bar(x,y,w,h,pct,fill,fillChip,anchorRight){
  px(x-1,y-1,w+2,h+2,'#0a0c14');
  g.fillStyle='#3a4152'; g.fillRect(x,y,w,h);
  const cw=Math.round(w*clamp(pct,0,1));
  if(fillChip!==undefined){
    const chw=Math.round(w*clamp(fillChip,0,1));
    g.fillStyle='#ffe08a';
    g.fillRect(anchorRight?x+w-chw:x, y, chw, h);
  }
  g.fillStyle=fill;
  g.fillRect(anchorRight?x+w-cw:x, y, cw, h);
  px(x,y,w,1,'rgba(255,255,255,.25)');
}
function hpColor(p){ return p>0.5?'#7dff6a':(p>0.25?'#ffd94d':'#ff5b5b'); }

/* 技能行:名称贴外侧、倒计时贴内侧,同一行两端对齐;名称过长时自动截断防重叠 */
function hudSkillRow(name,timer,x0,x1,yy,col,tcol,mirror){
  g.font='bold 6.5px "Courier New",monospace';
  const tw=timer?g.measureText(timer).width+4:0;
  let s=name, nameW=(x1-x0)-tw;
  while(s.length>1 && g.measureText(s).width>nameW) s=s.slice(0,-1);
  if(mirror){
    if(timer) text(timer,x0,yy,6.5,tcol,'left');
    text(s,x1,yy,6.5,col,'right');
  }else{
    text(s,x0,yy,6.5,col,'left');
    if(timer) text(timer,x1,yy,6.5,tcol,'right');
  }
}

function drawHUD(){
  if(!game.mechs.length) return;
  const m1=game.mechs[0], m2=game.mechs[1];
  // 血条(P1 左、P2 右,白色创伤条延迟衰减)
  bar(14,9,180,10, m1.hp/m1.maxHp, hpColor(m1.hp/m1.maxHp), m1.chipHp/m1.maxHp, false);
  bar(W-194,9,180,10, m2.hp/m2.maxHp, hpColor(m2.hp/m2.maxHp), m2.chipHp/m2.maxHp, true);
  text(mechLabel(m1)+' '+m1.ch.name,14,22,9,m1.pal.light);
  text(mechLabel(m2)+' '+m2.ch.name,W-14,22,9,m2.pal.light,'right');
  // 能量条
  bar(14,33,110,4, m1.energy/100, m1.energy>=ENERGY_COST?'#5ff2ff':'#4a5a66', undefined, false);
  bar(W-124,33,110,4, m2.energy/100, m2.energy>=ENERGY_COST?'#5ff2ff':'#4a5a66', undefined, true);
  // 技能冷却:纯秒数倒计时(不画进度条,名称与倒计时分列两端,避免重叠)
  for(const [m,x0,x1,mirror] of [[m1,14,128,false],[m2,W-128,W-14,true]]){
    let yy=40;
    for(const s of m.skillSlots){
      const sk=SKILLS[s.id], cd=m.cds[s.id]||0, ready=cd<=0;
      const col=ready?(s.slot[1]==='J'?'#ffe27a':'#c9a6ff'):'#525d78';
      hudSkillRow(SLOT_LABELS[s.slot]+' '+sk.name, ready?'':cd.toFixed(1)+'s', x0,x1,yy, col, ready?'#7dff6a':'#ff9a5b', mirror);
      yy+=9;
    }
    if(m.canFly&&(m.flying||m.flyFuel<m.flyMax-0.01)){
      hudSkillRow('燃料', Math.ceil(m.flyFuel)+'%', x0,x1,yy, '#7df9ff', '#7df9ff', mirror);
    }
  }
  // 计时器(训练/观赏模式不计时)
  if(game.mode<2){
    px(222,4,36,17,'#0a0c14'); px(224,6,32,13,'#141a33');
    text(String(Math.ceil(game.timer)).padStart(2,'0'),240,12,12,'#ffffff','center','middle');
  }
  // 当前地图
  text(MAPS[game.mapIdx].name,240,26,8,'#6a749a','center');
  // 挑战 AI:连胜徽标(连胜时高亮脉动,便于随时关注连战场数)
  if(game.mode===1){
    const s=game.challengeStreak, txt='连胜 '+s;
    const w=Math.max(58,40+String(s).length*7), x=240-w/2, y=29, h=16, hot=s>0;
    px(x,y,w,h,'rgba(8,10,18,.86)');
    if(hot){ g.globalAlpha=0.30+0.30*(0.5+0.5*Math.sin(T*5)); px(x+1,y+1,w-2,h-2,'rgba(255,140,60,.30)'); g.globalAlpha=1; }
    const bd=hot?'#ffb347':'#39466a';
    px(x,y,w,1,bd); px(x,y+h-1,w,1,bd); px(x,y,1,h,bd); px(x+w-1,y,1,h,bd);
    text(txt,240,y+h/2+1,hot?11:10,hot?'#ffd166':'#8a94b8','center','middle');
  }
  // 胜场标记(训练/观赏模式无三局两胜,不显示)
  if(game.mode<2){
    for(let i=0;i<2;i++){
      const on1=m1.wins>i, on2=m2.wins>i;
      px(206-((i+1)*9),8,6,6,on1?'#ffd166':'#2a3341');
      px(266+(i*9)-6,8,6,6,on2?'#ffd166':'#2a3341');
    }
  }
  // 底部操作提示
  g.globalAlpha=0.55;
  if(game.mode===3){
    text('观赏模式 · 双方皆由电脑操控自动对战 · [ESC] 胜率天梯',240,H-9,7,'#7df9ff','center');
  }else if(game.mode===2){
    text('训练模式 · 靶机受击掉血,血量触底后回满,便于观察技能伤害',12,H-9,7,'#8affa0');
    text('P/ESC暂停  R返回标题',W-12,H-9,7,'#8a94b8','right');
  }else{
    text('P1  A/D移动 W跳 S防 J斩 K射 · 防御+方向+J/K=技能',12,H-9,7,'#8a94b8');
    text('P2  ←/→ ↑跳 ↓防 ,斩 .射 · 防御+方向+,/.=技能' + (game.mode===1?'  (AI)':''),W-12,H-9,7,'#8a94b8','right');
    text('P/ESC暂停 R重开',240,H-9,7,'#5a648a','center');
  }
  g.globalAlpha=1;
}
function drawAnnounce(){
  const a=game.ann; if(!a) return;
  const alpha=clamp(a.t/0.3,0,1);
  g.globalAlpha=alpha;
  text(a.text,242,112,a.size+2,'rgba(0,0,0,.8)','center');
  text(a.text,240,110,a.size,a.col,'center');
  g.globalAlpha=1;
}
function drawTitle(t){
  // 标题双层描边
  text('MECH DUEL',242,52,30,'rgba(0,0,0,.85)','center');
  text('MECH DUEL',240,50,30,'#8df6ff','center');
  text('MECH DUEL',240,48,30,'#ffffff','center');
  text('机 甲 对 决',240,84,20,'#ffd166','center');
  text('- 像素机甲 · 14 台机体 · 3 档难度 · 7 张地图 · 故事模式 -',240,100,8,'#8a94b8','center');
  // 菜单
  const blink=Math.sin(t*4)>-0.3;
  if(blink){
    text('按 [1] 双人对战',240,119,12,'#7dff6a','center');
    text('按 [2] 挑战 AI',240,137,12,'#5ff2ff','center');
    text('按 [3] 故事模式',240,155,12,'#ffd166','center');
    text('按 [4] 训练模式',240,173,12,'#b6ff7a','center');
    text('按 [5] 观赏模式',240,191,12,'#ff9ad1','center');
  }
  text('(也可用鼠标点击选项开始)',240,204,7.5,'#5a648a','center');
  // 操作说明
  text('P1: A/D移动  W跳  S防御  J斩击  K射击    ·    P2: ←/→移动  ↑跳  ↓防御  ,斩击  .射击',240,214,7.5,'#8a94b8','center');
  text('技能:先按防御,0.5秒内 方向+斩/射 组合出招(每机体3式) · 疾风/幽灵/新星可双击跳飞行锁敌',240,224,7,'#5a648a','center');
  text('训练模式:对阵受击掉血、触底回满的靶机,直观查看技能伤害 · 观赏模式:电脑自动对战,ESC 查看胜率天梯',240,234,7,'#5a648a','center');
  text('故事模式:先选出击机师,再用该机师顺 10 关推进;击败第 9/10 关 BOSS 解锁隐藏机体「天罚」「湮灭」',240,244,7,'#5a648a','center');
}
/* 故事模式 — 选择出击机师(先选角色,再用该机师走完整条故事线) */
function drawStoryCharSelect(t){
  const S=game.storyPick; if(!S) return;
  g.fillStyle='rgba(5,6,13,.72)'; g.fillRect(0,0,W,H);
  shadowText('选 择 出 击 机 师',240,20,16,'#ffd166','center');
  text('选定后以该机师挑战全部 10 关 · 击败第 9 / 第 10 关 BOSS 解锁隐藏机体',240,38,8,'#8a94b8','center');
  for(let i=0;i<CHARS.length;i++){
    const cx=14+(i%7)*65, cy=52+((i/7)|0)*82, cw=60, chh=74;
    const open=charUnlocked(i);
    px(cx,cy,cw,chh,open?'#0d1120':'#0a0c14');
    px(cx,cy,cw,1,'#1c2646'); px(cx,cy+chh-1,cw,1,'#1c2646');
    px(cx,cy,1,chh,'#1c2646'); px(cx+cw-1,cy,1,chh,'#1c2646');
    if(i===S.cursor&&Math.sin(t*6)>-0.4){
      px(cx-2,cy-2,cw+4,2,'#ffd166'); px(cx-2,cy+chh,cw+4,2,'#ffd166');
      px(cx-2,cy-2,2,chh+4,'#ffd166'); px(cx+cw,cy-2,2,chh+4,'#ffd166');
    }
    g.globalAlpha=open?1:0.32;
    drawMech(fakeMech(CHARS[i],cx+30,cy+58,1,0.55));
    text(CHARS[i].name,cx+cw/2,cy+64,8,'#cfd6ea','center');
    g.globalAlpha=1;
    if(!open){
      px(cx+2,cy+2,cw-4,chh-4,'rgba(6,8,16,.55)');
      text('LOCK',cx+cw/2,cy+chh/2-9,11,'#8a94b8','center');
      text('击败第 '+CHARS[i].unlock+' 关 BOSS 解锁',cx+cw/2,cy+chh/2+3,6,'#5a648a','center');
    }
  }
  const cur=CHARS[S.cursor];
  text(cur.name+' · '+cur.tag+(charUnlocked(S.cursor)?'':'   [未解锁]'),240,218,9,'#ffe27a','center');
  text('「'+cur.lore+'」',240,230,7.5,'#8a94b8','center');
  text('HP '+cur.hp+'   攻击 x'+cur.atk+'   速度 '+cur.spd+'   体型 x'+cur.size+'   蓄能 '+cur.regen+'/s',240,242,7.5,'#8a94b8','center');
  text('武器:'+WEAPONS[cur.weapon].name+'   技能:'+skillBrief(cur)+(cur.canFly?'   双击跳可飞行':'')+(cur.airW?'   空中:'+WEAPONS[cur.airW].name:''),
       240,254,7.5,'#5ff2ff','center');
  text('A/D 移动   W/S 换行   J 确认   ·   R 返回标题',240,H-6,6.5,'#5a648a','center');
}
/* 故事模式选关 */
function drawStorySelect(t){
  const S=game.storySel; if(!S) return;
  const hero=CHARS[game.storyHero];
  g.fillStyle='rgba(5,6,13,.6)'; g.fillRect(0,0,W,H);
  shadowText('故 事 模 式',240,20,17,'#8dfff0','center');
  text('出击机师:'+hero.name+' ('+hero.tag+')   通关第 9 / 第 10 关解锁隐藏机体',240,37,7.5,'#8a94b8','center');
  for(let i=0;i<STORY.length;i++){
    const lv=STORY[i];
    const cx=14+(i%5)*92, cy=52+((i/5)|0)*86, cw=84, chh=76;
    const open=storyLevelOpen(i), done=storyProg.cleared>i;
    // 卡片代表机体:第 9/10 关展示其隐藏机体 BOSS,其余展示该关的章节机师
    const artIdx = lv.bossIdx!==undefined ? lv.bossIdx : lv.hero;
    px(cx,cy,cw,chh,open?'#0d1120':'#0a0c14');
    px(cx,cy,cw,1,'#1c2646'); px(cx,cy+chh-1,cw,1,'#1c2646');
    px(cx,cy,1,chh,'#1c2646'); px(cx+cw-1,cy,1,chh,'#1c2646');
    if(i===S.cursor&&Math.sin(t*6)>-0.4)
      { px(cx-2,cy-2,cw+4,2,'#8dfff0'); px(cx-2,cy+chh,cw+4,2,'#8dfff0'); px(cx-2,cy-2,2,chh+4,'#8dfff0'); px(cx+cw,cy-2,2,chh+4,'#8dfff0'); }
    g.globalAlpha=open?1:0.3;
    drawMech(fakeMech(CHARS[artIdx],cx+26,cy+52,1,0.5));
    text('第'+(i+1)+'关',cx+52,cy+8,8,'#ffe27a','center');
    text(lv.title.replace(/^第.关 · /,''),cx+52,cy+19,7,'#cfd6ea','center');
    text(CHARS[artIdx].name,cx+52,cy+58,7,lv.bossIdx!==undefined?'#ff9a9a':'#5ff2ff','center');
    g.globalAlpha=1;
    if(!open){ text('LOCK',cx+cw/2,cy+chh/2-6,13,'#8a94b8','center'); }
    else if(done){ text('CLEAR',cx+cw-6,cy+4,7,'#7dff6a','right'); }
    if(lv.bossIdx!==undefined) text('BOSS',cx+5,cy+chh-11,7,'#ff5b5b');
  }
  const lv=STORY[S.cursor], open=storyLevelOpen(S.cursor), bc=bossChar(lv, game.storyHero);
  px(10,232,W-20,26,'rgba(10,14,30,.88)');
  text(lv.title+(open?'':'   [未解锁]'),14,235,9,open?'#ffe27a':'#8a94b8');
  text(open?('出击: '+hero.name+' ('+hero.tag+')   杂兵 x'+lv.count+'   BOSS: '+bc.name+' (HP '+bc.hp+')')
           :('通关第 '+S.cursor+' 关后解锁'),14,248,7,'#8a94b8');
  text('A/D 移动   W/S 换行   J 进入   C 更换机师   ·   R 返回标题',240,H-6,6.5,'#5a648a','center');
}
/* 故事模式剧情过场 */
function drawScenario(){
  const lv=STORY[game.storyIdx]; if(!lv) return;
  g.fillStyle='rgba(5,6,13,.82)'; g.fillRect(0,0,W,H);
  const t=game.storyScenT;
  shadowText(lv.title,240,30,17,'#ffe27a','center');
  const bob=Math.sin(t*2)*1.4;
  const hero=CHARS[game.storyHero];
  drawMech(fakeMech(hero,84,168+bob,1,1.5));
  text(hero.name+' · '+hero.tag,84,192,9,'#5ff2ff','center');
  for(let i=0;i<lv.intro.length;i++){
    const a=clamp((t-0.15*(i+1))/0.3,0,1);
    if(a<=0) continue;
    g.globalAlpha=a;
    text(lv.intro[i],206,80+i*21,10,'#cfd6ea','left');
    g.globalAlpha=1;
  }
  if(t>0.25&&Math.sin(T*4)>-0.3) text('按 [J] / [空格] 出击',240,H-30,10,'#7dff6a','center');
  text('R 返回标题',240,H-16,7,'#5a648a','center');
}
/* 故事模式战斗 HUD */
function drawStoryHUD(){
  const m1=game.mechs[0]; if(!m1) return;
  const lv=STORY[game.storyIdx];
  bar(14,9,180,10, m1.hp/m1.maxHp, hpColor(m1.hp/m1.maxHp), m1.chipHp/m1.maxHp, false);
  text(m1.ch.name,14,22,9,m1.pal.light);
  bar(14,33,110,4, m1.energy/100, m1.energy>=ENERGY_COST?'#5ff2ff':'#4a5a66', undefined, false);
  let yy=40;
  for(const s of m1.skillSlots){
    const sk=SKILLS[s.id], cd=m1.cds[s.id]||0, ready=cd<=0;
    const col=ready?(s.slot[1]==='J'?'#ffe27a':'#c9a6ff'):'#525d78';
    hudSkillRow(SLOT_LABELS[s.slot]+' '+sk.name, ready?'':cd.toFixed(1)+'s', 14,128, yy, col, ready?'#7dff6a':'#ff9a5b', false);
    yy+=9;
  }
  if(m1.canFly) hudSkillRow('燃料', Math.ceil(m1.flyFuel)+'%', 14,128, yy, '#7df9ff', '#7df9ff', false);
  // 顶部中央:关卡标题 + 残敌 / 波次
  text(lv.title,240,9,10,'#ffe27a','center');
  text('残敌 '+game.enemiesOf(m1).length+'   波次 '+(game.storyWave+1)+'/'+game.storyWaves.length,240,21,7.5,'#8a94b8','center');
  // BOSS 血条(顶部右侧)
  const boss=game.mechs.find(x=>x.isBoss&&!x.dead);
  if(boss){
    const bx=W-166;
    text('BOSS '+boss.ch.name,bx,9,7.5,'#ff5b5b');
    bar(bx,20,152,9, boss.hp/boss.maxHp, '#ff5b5b', boss.chipHp/boss.maxHp, true);
  }
  g.globalAlpha=0.55;
  text('P1  A/D移动 W跳 S防 J斩 K射 · 防御+方向+J/K=技能',12,H-9,7,'#8a94b8');
  g.globalAlpha=1;
}
/* 故事模式结算 */
function drawStoryResult(){
  const lv=STORY[game.storyIdx]; if(!lv) return;
  g.fillStyle='rgba(5,6,13,.68)'; g.fillRect(0,0,W,H);
  if(game.storyWin){
    shadowText('关 卡 达 成',240,86,24,'#7df9ff','center');
    shadowText(lv.title+' 完成',240,122,13,'#ffe27a','center');
    if(game.storyUnlockMsg) shadowText(game.storyUnlockMsg,240,150,12,'#ffd166','center');
  }else{
    shadowText('机 体 损 毁',240,86,24,'#ff5b5b','center');
    text(lv.title+' 挑战失败',240,122,12,'#8a94b8','center');
    text('强化操作,再来一次!',240,144,10,'#8a94b8','center');
  }
  if(game.storyResT>0.8&&Math.sin(T*4)>-0.3) text('按 [J] / [空格] 返回选关',240,184,10,'#8a94b8','center');
}
/* 选人用静态展示机体 */
function fakeMech(ch,x,y,facing,scale){
  return {id:0,ch,pal:ch.pal,facing,size:(ch.size||1)*scale,x,y,vx:0,vy:0,onGround:true,
          guarding:false,dead:false,atkT:0,walkT:0,moving:false,flash:0,muzzleT:0};
}
function drawDiff(){
  shadowText('选择难度',240,54,20,'#8df6ff','center');
  DIFFS.forEach((d,i)=>{
    const y=104+i*32;
    text('【'+(i+1)+'】 '+d.name,224,y,14,'#ffe27a','right');
    text(d.desc,256,y+3,9,'#8a94b8','left');
  });
  text('按 1/2/3 或点击选项 · [R] 返回标题',240,214,9,'#8a94b8','center');
}
function drawSelect(t){
  const S=game.select; if(!S) return;
  if(S.phase==='vs'){ // VS 过场
    if(S.idx1<0||S.idx2<0) return;
    g.fillStyle='rgba(5,6,13,.6)'; g.fillRect(0,0,W,H);
    const c1=CHARS[S.idx1], base=CHARS[S.idx2];
    const c2 = S.idx1===S.idx2
      ? Object.assign({},base,{pal:Object.assign({},base.pal,{main:base.pal.light,light:base.pal.main})}) : base;
    drawMech(fakeMech(c1,112,212,1,1.6));
    drawMech(fakeMech(c2,368,212,-1,1.6));
    text(c1.name+' ('+c1.tag+')',112,222,9,'#5ff2ff','center');
    text(c2.name+' ('+c2.tag+')',368,222,9,'#ffc24d','center');
    shadowText('VS',240,92,34,'#ff5b5b','center');
    text(game.mode===3?'观赏模式 · 电脑自动对战':(S.idx1===S.idx2?'同型机体:P2 使用 B 涂装':'准备战斗...'),240,140,10,'#8a94b8','center');
    text('战场:'+MAPS[game.mapIdx].name,240,158,9,'#ffe27a','center');
    return;
  }
  const head = S.phase==='p1' ? (game.mode===1?'选择你的机甲 — A/D 移动 W/S 换行 J 确认'
                                  : game.mode===2?'选择练习机体 — A/D 移动 W/S 换行 J 确认'
                                  :'P1 选择机甲 — A/D 移动 W/S 换行 J 确认')
             : S.phase==='p2' ? 'P2 选择机甲 — ←/→ 移动 ↑/↓ 换行 , 确认'
             : 'AI 选择中 ...';
  shadowText(head,240,18,12, S.phase==='p2'?'#ffc24d':'#5ff2ff','center');
  if(game.mode===1) text('难度:'+game.diffObj.name,240,32,8,'#8a94b8','center');
  else if(game.mode===2) text('对手是受击掉血、血量触底后回满的训练靶机',240,32,8,'#8affa0','center');
  // 5×3 机体网格(14 台机体 + 随机;含 2 台隐藏机体,未解锁显示锁定)
  const total=CHARS.length+1;
  for(let i=0;i<total;i++){
    const isRnd=i>=CHARS.length;
    const cx=SEL_CX+(i%SEL_COLS)*SEL_GX, cy=SEL_CY+((i/SEL_COLS)|0)*SEL_GY, cw=SEL_CW, chh=SEL_CH;
    const open=isRnd||charUnlocked(i);
    px(cx,cy,cw,chh,isRnd?'#141027':(open?'#0d1120':'#0a0c14'));
    px(cx,cy,cw,1,'#1c2646'); px(cx,cy+chh-1,cw,1,'#1c2646');
    px(cx,cy,1,chh,'#1c2646'); px(cx+cw-1,cy,1,chh,'#1c2646');
    const showCur=(S.phase==='p1'||S.phase==='p2'||S.phase==='cpuPick')&&i===S.cursor;
    if(showCur&&Math.sin(t*6)>-0.4){           // 光标闪烁边框
      const col=S.phase==='p2'?'#ffc24d':'#5ff2ff';
      px(cx-2,cy-2,cw+4,2,col); px(cx-2,cy+chh,cw+4,2,col); px(cx-2,cy-2,2,chh+4,col); px(cx+cw,cy-2,2,chh+4,col);
    }
    if(i===S.idx1){ px(cx+3,cy+2,cw-6,1,'#5ff2ff'); text('P1',cx+5,cy+10,7,'#5ff2ff'); }
    if(i===S.idx2){ px(cx+3,cy+chh-3,cw-6,1,'#ffc24d'); text(mechLabel({id:1,ctrl:game.mode===1?'cpu':'p2'}),cx+cw-5,cy+10,7,'#ffc24d','right'); }
    if(isRnd){                                 // 随机格
      text('?',cx+cw/2,cy+24,20,'#b18aff','center');
      text('随机',cx+cw/2,cy+chh-6,8,'#b18aff','center');
    }else{
      g.globalAlpha=open?1:0.32;
      drawMech(fakeMech(CHARS[i],cx+cw/2,cy+chh-15,1,0.5));
      text(CHARS[i].name,cx+cw/2,cy+chh-6,7.5,'#cfd6ea','center');
      g.globalAlpha=1;
      if(!open){
        px(cx+1,cy+1,cw-2,chh-2,'rgba(6,8,16,.55)');
        text('LOCK',cx+cw/2,cy+22,11,'#8a94b8','center');
        text('击败第 '+CHARS[i].unlock+' 关 BOSS 解锁',cx+cw/2,cy+34,6,'#5a648a','center');
      }
    }
  }
  const cur=S.cursor>=CHARS.length?null:CHARS[S.cursor];
  if(cur){
    text(cur.name+' · '+cur.tag+(charUnlocked(S.cursor)?'':'   [未解锁]'),240,214,9,'#ffe27a','center');
    text('HP '+cur.hp+'   攻击 x'+cur.atk+'   速度 '+cur.spd+'   体型 x'+cur.size+'   蓄能 '+cur.regen+'/s',240,226,7.5,'#8a94b8','center');
    text('武器:'+WEAPONS[cur.weapon].name+'   技能:'+skillBrief(cur)+(cur.canFly?'   双击跳可飞行':'')+(cur.airW?'   空中:'+WEAPONS[cur.airW].name:''),
         240,238,7.5,'#5ff2ff','center');
    text('「'+cur.lore+'」',240,250,7.5,'#8a94b8','center');
  }else{
    text('随机机体 · 由系统从已解锁机甲中抽取',240,222,11,'#b18aff','center');
    text('已解锁 '+CHARS.filter((c,i)=>charUnlocked(i)).length+' / '+CHARS.length+' 台 · 击败 BOSS 解锁隐藏机体',240,238,8,'#8a94b8','center');
    text('A/D 或 ←/→ 移动 · W/S 或 ↑/↓ 换行 · J / , 确认',240,252,7.5,'#5a648a','center');
  }
}
/* 选地图界面:7 张地图实时预览 + 随机 */
function drawMapSelect(t){
  const S=game.select; if(!S) return;
  g.fillStyle='rgba(5,6,13,.45)'; g.fillRect(0,0,W,H);
  shadowText('选择战场',240,22,18,'#ffe27a','center');
  text(CHARS[S.idx1].name,186,48,10,'#5ff2ff','right');
  text('VS',240,48,10,'#ff5b5b','center');
  text(CHARS[S.idx2].name,294,48,10,'#ffc24d','left');
  const total=MAPS.length+1;                   // 8 格:7 地图 + 随机
  for(let i=0;i<total;i++){
    const isRnd=i>=MAPS.length;
    const x=MAPSEL_CX+(i%MAPSEL_COLS)*MAPSEL_GX, y=MAPSEL_CY+((i/MAPSEL_COLS)|0)*MAPSEL_GY;
    const cw=MAPSEL_CW, chh=MAPSEL_CH, cur=i===S.cursor;
    if(!isRnd){
      g.save();
      g.beginPath(); g.rect(x,y,cw,chh); g.clip();
      g.setTransform(SC*cw/MW,0,0,SC*cw/MW,x*SC,y*SC);
      MAPS[i].draw(t);
      g.restore();
    }else{
      px(x,y,cw,chh,'#141027');
      text('?',x+cw/2,y+12,24,'#b18aff','center');
      text('随机地图',x+cw/2,y+chh-10,8,'#b18aff','center');
    }
    px(x,y,cw,1,'#1c2646'); px(x,y+chh-1,cw,1,'#1c2646'); px(x,y,1,chh,'#1c2646'); px(x+cw-1,y,1,chh,'#1c2646');
    if(cur&&Math.sin(t*6)>-0.4){
      px(x-2,y-2,cw+4,2,'#ffe27a'); px(x-2,y+chh,cw+4,2,'#ffe27a'); px(x-2,y-2,2,chh+4,'#ffe27a'); px(x+cw,y-2,2,chh+4,'#ffe27a');
    }
    text(isRnd?'随机':MAPS[i].name,x+cw/2,y+chh+9,8,cur?'#ffe27a':'#8a94b8','center');
    text(String(i+1),x+4,y+9,7,cur?'#ffe27a':'#4a5a66');
  }
  const cur=S.cursor<MAPS.length?MAPS[S.cursor]:null;
  shadowText(cur?cur.name:'随机地图',240,234,13,'#ffe27a','center');
  text(cur?cur.tag:'从 '+MAPS.length+' 张地图中随机抽取一张',240,250,9,'#8a94b8','center');
  text('A/D 或 ←/→ 移动 · W/S 或 ↑/↓ 换行 · J / , 确认 · 也可按 1-'+total+' 或点击',240,263,7.5,'#5a648a','center');
}
function drawEnd(){
  g.fillStyle='rgba(5,6,13,.55)'; g.fillRect(0,0,W,H);
  const wnr=game.mechs[0].wins>=2?game.mechs[0]:game.mechs[1];
  if(game.mode===3){
    const w3=game.spectateWinner||wnr;
    shadowText('胜 者 守 擂',240,86,24,'#7df9ff','center');
    shadowText(mechLabel(w3)+' '+w3.ch.name+' 获胜 · 守擂 '+(game.spectateStreak||1)+' 连胜',240,124,13,w3.pal.light,'center');
    text('负者随机换新机体上场续战 · [J] 立即下一场 · [ESC] 胜率天梯',240,158,9,'#8a94b8','center');
  }else if(game.mode===1){                          // 挑战 AI:走到这里只可能是玩家落败
    shadowText('CHALLENGE OVER',240,82,24,'#ff5b5b','center');
    shadowText('连胜 '+game.challengeStreak+' 场',240,118,16,'#ffe27a','center');
    text('击败你的对手:'+mechLabel(wnr)+' '+wnr.ch.name,240,146,10,wnr.pal.light,'center');
  }else{
    shadowText('VICTORY!',240,86,26,'#ffe27a','center');
    shadowText(mechLabel(wnr)+' '+wnr.ch.name+' 获得胜利',240,124,14,wnr.pal.light,'center');
  }
  if(Math.sin(T*4)>-0.3) text('按 [R] 返回标题',240,176,10,'#8a94b8','center');
}

/* 观赏模式 · 胜率天梯(ESC 唤出,不暂停对战):行机甲 对阵 列机甲 的胜率矩阵。
   采用半透明浮动窗口,四周留白,让玩家仍能看见底层的电脑对战。 */
function drawLadder(){
  const L=game.ladderData(), N=CHARS.length;
  let sumN=0; for(let i=0;i<N;i++) for(let j=0;j<N;j++) sumN+=L[i][j].n;
  const total=Math.round(sumN/2);                       // 每场对局在对称两格各计一次
  // 各机体总战绩(其余格已同时含该机体的胜场与负场),按总胜率实时排序行列顺序
  const ord=[]; for(let i=0;i<N;i++){ let rw=0, rn=0; for(let j=0;j<N;j++){ rw+=L[i][j].w; rn+=L[i][j].n; } ord.push({i,rw,rn,r:rn>0?rw/rn:-1}); }
  ord.sort((a,b)=>b.r-a.r||b.rn-a.rn||a.i-b.i);         // 胜率高者在前;同率按场次多者优先;无战绩者置末尾
  const RI=k=>ord[k].i;                                 // 第 k 行/列对应的机体下标
  const pw=400, ph=230, x0=(W-pw)/2, y0=(H-ph)/2;
  px(x0,y0,pw,ph,'rgba(8,10,20,.46)');                  // 半透明面板:不遮挡对战
  const bd='rgba(125,249,255,.5)';
  px(x0,y0,pw,1,bd); px(x0,y0+ph-1,pw,1,bd); px(x0,y0,1,ph,bd); px(x0+pw-1,y0,1,ph,bd);
  shadowText('对 战 天 梯 · 胜 率 矩 阵',240,y0+5,10,'#7df9ff','center');
  text('本会话共 '+total+' 场 · 行列按总胜率实时排序 · [ESC] 收起(对战继续)',240,y0+18,6.5,'#a8b8dd','center');
  const gx=x0+8, hw=22, cw=(pw-16-hw)/N, gy=y0+30, hh=20, rh=(ph-56-hh)/N;
  // 左上角:标注 行=胜方 / 列=负方
  text('行=胜',gx+hw/2,gy+6,5,'#9dff9d','center','middle');
  text('列=负',gx+hw/2,gy+14,5,'#ff9a9a','center','middle');
  for(let j=0;j<N;j++) text(CHARS[RI(j)].name,gx+hw+j*cw+cw/2,gy+hh/2,5.5,'#93a3c8','center','middle');   // 列头:角色名(负方)
  for(let i=0;i<N;i++){
    const ry=gy+hh+i*rh, st=ord[i], rr=st.rn>0?st.r:0;
    text(CHARS[st.i].name,gx+hw/2,ry+rh/2-2.7,5.5,'#c3cfec','center','middle');                     // 行头:角色名(胜方)
    text(st.rn>0?Math.round(rr*100)+'%':'-',gx+hw/2,ry+rh/2+3,4.8,
      st.rn>0?'hsl('+Math.round(120*rr)+',70%,72%)':'#4a5678','center','middle');                   // 行头:该机体总胜率
    for(let j=0;j<N;j++){
      const cx=gx+hw+j*cw, rec=L[st.i][RI(j)];
      let bg='rgba(18,22,34,.62)', fg='#4a5678', lab='-';
      if(i!==j&&rec.n>0){                               // 行=列(同型对局)不展示数据
        const r=clamp(rec.w/rec.n,0,1), hue=Math.round(120*r);
        bg='hsla('+hue+',62%,'+(25+7*r)+'%,.72)';
        fg=r>0.55?'#eafff0':'#ffecec';
        lab=String(Math.round(r*100));
      }
      px(cx,ry,cw-1,rh-1,bg);
      if(lab!=='-') text(lab,cx+(cw-1)/2,ry+(rh-1)/2+0.5,6,'rgba(0,0,0,.55)','center','middle');   // 半透明底上的暗描边
      text(lab,cx+(cw-1)/2,ry+(rh-1)/2,6,fg,'center','middle');
    }
  }
  const lw=110, lx=240-lw/2, ly=y0+ph-22;
  for(let k=0;k<lw;k++) px(lx+k,ly,1,6,'hsla('+Math.round(120*k/(lw-1))+',62%,32%,.85)');
  text('低 0%',lx-6,ly+3,6,'#ff9a9a','right','middle');
  text('100% 高',lx+lw+6,ly+3,6,'#9dff9d','left','middle');
  text('格=行(胜)击败列(负)胜率 · 行名下方=该机体总胜率 · 斜向格不入表',240,y0+ph-11,6,'#7d8cb0','center');
}
