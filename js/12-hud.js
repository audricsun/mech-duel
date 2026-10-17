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
  // 能量条 / 终结能量条
  bar(14,33,110,4, m1.energy/100, m1.energy>=ENERGY_COST?'#5ff2ff':'#4a5a66', undefined, false);
  bar(W-124,33,110,4, m2.energy/100, m2.energy>=ENERGY_COST?'#5ff2ff':'#4a5a66', undefined, true);
  bar(14,39,110,4, m1.ult/ULT_MAX, m1.ult>=ULT_MAX?'#ffe27a':'#ffd166', undefined, false);
  bar(W-124,39,110,4, m2.ult/ULT_MAX, m2.ult>=ULT_MAX?'#ffe27a':'#ffd166', undefined, true);
  text('终结',14,45,5.5,'#ffd166');
  text(m1.ult>=ULT_MAX?'J+K 就绪':Math.floor(m1.ult)+'%',128,45,5.5,m1.ult>=ULT_MAX?'#ffe27a':'#7a86a8','right');
  text('终结',W-14,45,5.5,'#ffd166','right');
  text(m2.ult>=ULT_MAX?'J+K 就绪':Math.floor(m2.ult)+'%',W-128,45,5.5,m2.ult>=ULT_MAX?'#ffe27a':'#7a86a8','left');
  // 技能冷却:纯秒数倒计时(不画进度条,名称与倒计时分列两端,避免重叠)
  for(const [m,x0,x1,mirror] of [[m1,14,128,false],[m2,W-128,W-14,true]]){
    let yy=52;
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
    const cs=game.spectateStreak||0;
    text('观赏模式 · 电脑自动对战 · [ESC] 胜率天梯'+(cs>0?'   ·   擂主 '+cs+' 连胜,再守 '+(SPECTATE_STREAK_CAP-cs)+' 场封入名人堂':''),240,H-9,7,'#7df9ff','center');
  }else if(game.mode===2){
    text('训练模式 · 靶机受击掉血,触底回满 · 双击方向冲刺',12,H-9,7,'#8affa0');
    text('P/ESC暂停  R返回标题',W-12,H-9,7,'#8a94b8','right');
  }else{
    text('P1  A/D移动 W跳 S防 J斩 K射 · 防御+方向+J/K=技能',12,H-9,7,'#8a94b8');
    text('P2  ←/→ ↑跳 ↓防 ,斩 .射 · 防御+方向+,/.=技能' + (game.mode===1?'  (电脑)':''),W-12,H-9,7,'#8a94b8','right');
    text('双击方向冲刺 · P/ESC暂停 R重开',240,H-9,7,'#5a648a','center');
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
  // 主标题:仅中文
  shadowText('机 甲 对 决',240,42,27,'#ffd166','center');
  px(132,88,216,20,'#070a14');
  text('像素机甲 · 14 台机体 · 7 张地图',240,92,7.5,'#8a94b8','center');
  // 菜单:街机作为第一项(无背景面板,直接叠在战场画面上)
  shadowText('[1] 街机',240,118,11.5,'#5ff2ff','center');
  shadowText('[2] 对战',240,140,11.5,'#7dff6a','center');
  shadowText('[3] 故事',240,162,11.5,'#ffd166','center');
  shadowText('[4] 训练',240,184,11.5,'#b6ff7a','center');
  shadowText('[5] 观赏',240,206,11.5,'#ff9ad1','center');
  shadowText('也可用鼠标点击选项',240,226,6.5,'#5a648a','center');
  // 左下角:全局难度选项(鼠标点击 / T 切换)
  px(8,238,140,28,'#070a14');
  px(8,238,140,1,'#2a3a66'); px(8,265,140,1,'#2a3a66');
  px(8,238,1,28,'#2a3a66'); px(147,238,1,28,'#2a3a66');
  text('难度',12,242,6.5,'#8a94b8');
  text('[T]',44,242,6.5,'#5a648a');
  for(let i=0;i<DIFFS.length;i++){
    const bx=DIFFSEL_X+i*(DIFFSEL_W+DIFFSEL_GAP), on=game.diffObj===DIFFS[i];
    px(bx,DIFFSEL_Y,DIFFSEL_W,DIFFSEL_H,on?'#1a3348':'#0d1424');
    px(bx,DIFFSEL_Y,DIFFSEL_W,1,on?'#5ff2ff':'#1c2646');
    px(bx,DIFFSEL_Y+DIFFSEL_H-1,DIFFSEL_W,1,on?'#5ff2ff':'#1c2646');
    px(bx,DIFFSEL_Y,1,DIFFSEL_H,on?'#5ff2ff':'#1c2646');
    px(bx+DIFFSEL_W-1,DIFFSEL_Y,1,DIFFSEL_H,on?'#5ff2ff':'#1c2646');
    text(DIFFS[i].name,bx+DIFFSEL_W/2,DIFFSEL_Y+2,6,on?'#7dff6a':'#6a749a','center');
  }
  // 右下角:BGM 曲目 / 下一首 / 音乐开关
  if(titleBgmIdx<0||titleBgmIdx>=MAPS.length) titleBgmIdx=ri(0,MAPS.length-1);
  const track=MAPS[titleBgmIdx]||MAPS[0];
  px(286,240,186,26,'#070a14');
  px(286,240,186,1,'#2a3a66'); px(286,265,186,1,'#2a3a66');
  px(286,240,1,26,'#2a3a66'); px(471,240,1,26,'#2a3a66');
  text('♪ 曲目 '+(titleBgmIdx+1)+' / '+MAPS.length+' · '+track.name,292,242,6,'#8a94b8','left');
  text('按 M 下一首',292,253,5.5,'#5a648a','left');
  px(MUSICBTN_X,MUSICBTN_Y,MUSICBTN_W,MUSICBTN_H,musicMuted?'#3a1e22':'#12302a');
  px(MUSICBTN_X,MUSICBTN_Y,MUSICBTN_W,1,musicMuted?'#ff9a9a':'#7dffcf');
  px(MUSICBTN_X,MUSICBTN_Y+MUSICBTN_H-1,MUSICBTN_W,1,musicMuted?'#ff9a9a':'#7dffcf');
  px(MUSICBTN_X,MUSICBTN_Y,1,MUSICBTN_H,musicMuted?'#ff9a9a':'#7dffcf');
  px(MUSICBTN_X+MUSICBTN_W-1,MUSICBTN_Y,1,MUSICBTN_H,musicMuted?'#ff9a9a':'#7dffcf');
  text(musicMuted?'开启音乐':'关闭音乐',MUSICBTN_X+MUSICBTN_W/2,MUSICBTN_Y+2,6,
       musicMuted?'#ff9a9a':'#7dffcf','center');
}
/* 故事模式 — 选择出击机师(先选角色,再用该机师走完整条故事线) */
function drawStoryCharSelect(t){
  const S=game.storyPick; if(!S) return;
  const cur=CHARS[S.cursor];
  let boss=null, bossLabel='下一关 首领';
  if(typeof STORY!=='undefined'&&STORY.length&&typeof bossChar==='function'){
    const idx=clamp(storyProg.cleared,0,STORY.length-1), lv=STORY[idx];
    const b=bossChar(lv), src=CHARS[lv.bossIdx!==undefined?lv.bossIdx:lv.hero];
    boss=Object.assign({},b,{tag:'首领 · '+(src?src.tag:''),lore:src?src.lore:''});
    bossLabel='第 '+(idx+1)+' 关 首领';
  }
  drawCharSelectLayout(t,{
    title:'故事',
    subtitle:'选定出击机师后挑战全部 10 关 · 击败第 9/10 关 首领 解锁隐藏机体',
    leftCh:Object.assign({},cur,{tag:cur.tag+(charUnlocked(S.cursor)?'':' · 未解锁')}),
    leftLabel:'出击机师',leftPlaceholder:'',
    rightCh:boss,rightLabel:bossLabel,rightPlaceholder:'下一关 首领',
    cursorCol:'#ffd166',allowRandom:false,select:S,
    hint:'A/D 移动 · W/S 换行 · J 确认 · R 返回标题'
  });
}
/* 故事模式选关 */
function drawStorySelect(t){
  const S=game.storySel; if(!S) return;
  const hero=CHARS[game.storyHero];
  g.fillStyle='rgba(5,6,13,.6)'; g.fillRect(0,0,W,H);
  shadowText('故 事',240,20,15,'#8dfff0','center');
  text('出击机师:'+hero.name+' ('+hero.tag+')   通关第 9 / 第 10 关解锁隐藏机体',240,37,7,'#8a94b8','center');
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
    text('第'+(i+1)+'关',cx+52,cy+8,7.5,'#ffe27a','center');
    text(lv.title.replace(/^第.关 · /,''),cx+52,cy+19,6.5,'#cfd6ea','center');
    text(CHARS[artIdx].name,cx+52,cy+58,6.5,lv.bossIdx!==undefined?'#ff9a9a':'#5ff2ff','center');
    g.globalAlpha=1;
    if(!open){ text('LOCK',cx+cw/2,cy+chh/2-6,11,'#8a94b8','center'); }
    else if(done){ text('CLEAR',cx+cw-6,cy+4,6.5,'#7dff6a','right'); }
    if(lv.bossIdx!==undefined) text('首领',cx+5,cy+chh-11,6.5,'#ff5b5b');
  }
  const lv=STORY[S.cursor], open=storyLevelOpen(S.cursor), bc=bossChar(lv);
  px(10,232,W-20,26,'rgba(10,14,30,.88)');
  text(lv.title+(open?'':'   [未解锁]'),14,235,8,open?'#ffe27a':'#8a94b8');
  text(open?('出击: '+hero.name+' ('+hero.tag+')   杂兵 x'+lv.count+'   首领: '+bc.name+' (HP '+bc.hp+')')
           :('通关第 '+S.cursor+' 关后解锁'),14,248,6.5,'#8a94b8');
  text('A/D 移动   W/S 换行   J 进入   C 更换机师   ·   R 返回标题',240,H-6,6,'#5a648a','center');
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
  bar(14,39,110,4, m1.ult/ULT_MAX, m1.ult>=ULT_MAX?'#ffe27a':'#ffd166', undefined, false);
  text('终结',14,45,5.5,'#ffd166');
  text(m1.ult>=ULT_MAX?'J+K 就绪':Math.floor(m1.ult)+'%',128,45,5.5,m1.ult>=ULT_MAX?'#ffe27a':'#7a86a8','right');
  let yy=52;
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
  // 首领血条(顶部右侧)
  const boss=game.mechs.find(x=>x.isBoss&&!x.dead);
  if(boss){
    const bx=W-166;
    text('首领 '+boss.ch.name,bx,9,7.5,'#ff5b5b');
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
          meleeW:ch.meleeW||'saber',guarding:false,dead:false,atkT:0,walkT:0,moving:false,flash:0,muzzleT:0};
}
/* ---- 统一选人界面:左右立绘 + 中间方形头像格 ---- */
function wrapText(str,x,y,maxW,lineH,size,col,align){
  if(!str) return y;
  g.font='bold '+size+'px "Courier New",monospace';
  let line='', yy=y;
  for(const ch of str){
    const test=line+ch;
    if(line && g.measureText(test).width>maxW){
      text(line,x,yy,size,col,align); line=ch; yy+=lineH;
    }else line=test;
  }
  if(line){ text(line,x,yy,size,col,align); yy+=lineH; }
  return yy;
}
function drawCharPanel(x,y,w,h,ch,label,mirror,t,placeholder){
  const accent=mirror?'#ffc24d':'#5ff2ff';
  px(x,y,w,h,'#0a0f1e');
  px(x,y,w,1,accent); px(x,y+h-1,w,1,'#1c2646'); px(x,y,1,h,'#1c2646'); px(x+w-1,y,1,h,'#1c2646');
  text(label,mirror?x+w-6:x+6,y+6,6.5,accent,mirror?'right':'left');
  g.save(); g.beginPath(); g.rect(x+1,y+16,w-2,84); g.clip();
  if(ch){
    g.globalAlpha=0.10+0.04*Math.sin(t*2+(mirror?1.7:0)); g.fillStyle=ch.pal.light;
    g.beginPath(); g.arc(x+w/2,y+58,36,0,Math.PI*2); g.fill(); g.globalAlpha=1;
    const sc=1.2/Math.max(1,ch.size||1);
    drawMech(fakeMech(ch,x+w/2,y+98,mirror?-1:1,sc));
  }else{
    text('?',x+w/2,y+50,30,'#2a3341','center');
  }
  g.restore();
  px(x+8,y+102,w-16,1,'#1c2646');
  if(ch){
    text(ch.name,x+w/2,y+108,9,ch.pal.light||'#cfd6ea','center');
    text(ch.tag||'',x+w/2,y+121,6,'#8a94b8','center');
    let yy=wrapText(ch.lore||'',x+8,y+131,w-16,7.6,5.8,'#8a94b8','left');
    // 简介下方:技能列表(仅操作方式 + 技能名,不显示冷却/描述/数值)
    const slots=['nJ','fJ','bJ','nK','fK','bK'];
    const rows=slots.filter(slot=>ch.skills&&ch.skills[slot]&&SKILLS[ch.skills[slot]]);
    if(rows.length){
      yy+=1; px(x+8,yy,w-16,1,'#1c2646'); yy+=2;
      text('技能',x+8,yy,5.2,'#5a648a'); yy+=7;
      for(const slot of rows){
        text(SLOT_LABELS[slot]+' '+SKILLS[ch.skills[slot]].name,x+8,yy,5.6,'#7d9ab8','left');
        yy+=7;
      }
      if(ch.ult&&ULTIMATES[ch.ult]){
        text('终结 J+K '+ULTIMATES[ch.ult].name,x+8,yy,5.6,'#ffd166','left');
        yy+=7;
      }
    }
  }else{
    text(placeholder||'等待选择',x+w/2,y+132,6.5,'#5a648a','center');
    text('—',x+w/2,y+146,6,'#39466a','center');
  }
}
function drawCharSelectLayout(t,opts){
  g.fillStyle='rgba(5,6,13,.55)'; g.fillRect(0,0,W,H);
  shadowText(opts.title||'选择机甲',240,16,12.5,'#5ff2ff','center');
  if(opts.subtitle) text(opts.subtitle,240,32,7,'#8a94b8','center');
  const S=opts.select, total=opts.allowRandom?CHARS.length+1:CHARS.length;
  for(let i=0;i<total;i++){
    const isRnd=opts.allowRandom&&i>=CHARS.length;
    const col=i%SEL_COLS, row=(i/SEL_COLS)|0;
    const cx=SEL_CX+col*SEL_GX, cy=SEL_CY+row*SEL_GY;
    const open=isRnd||charUnlocked(i);
    px(cx,cy,SEL_CW,SEL_CH,isRnd?'#141027':(open?'#0d1120':'#0a0c14'));
    px(cx,cy,SEL_CW,1,'#1c2646'); px(cx,cy+SEL_CH-1,SEL_CW,1,'#1c2646');
    px(cx,cy,1,SEL_CH,'#1c2646'); px(cx+SEL_CW-1,cy,1,SEL_CH,'#1c2646');
    if(i===S.cursor&&Math.sin(t*6)>-0.4){
      const cc=opts.cursorCol||'#5ff2ff';
      px(cx-2,cy-2,SEL_CW+4,2,cc); px(cx-2,cy+SEL_CH,SEL_CW+4,2,cc);
      px(cx-2,cy-2,2,SEL_CH+4,cc); px(cx+SEL_CW,cy-2,2,SEL_CH+4,cc);
    }
    if(i===S.idx1){ px(cx+SEL_CW-10,cy+2,8,2,'#5ff2ff'); }
    if(i===S.idx2){ px(cx+SEL_CW-10,cy+SEL_CH-4,8,2,'#ffc24d'); }
    if(isRnd){ text('?',cx+SEL_CW/2,cy+SEL_CH/2-10,18,'#b18aff','center'); }
    else{
      g.globalAlpha=open?1:0.30;
      const sc=0.82/Math.max(1,CHARS[i].size||1);
      drawMech(fakeMech(CHARS[i],cx+SEL_CW/2,cy+SEL_CH-4,1,sc));
      g.globalAlpha=1;
      if(!open){
        px(cx+1,cy+1,SEL_CW-2,SEL_CH-2,'rgba(6,8,16,.55)');
        text('LOCK',cx+SEL_CW/2,cy+SEL_CH/2-4,6.5,'#8a94b8','center');
      }
    }
  }
  drawCharPanel(8,40,112,204,opts.leftCh,opts.leftLabel,false,t,opts.leftPlaceholder);
  drawCharPanel(360,40,112,204,opts.rightCh,opts.rightLabel,true,t,opts.rightPlaceholder);
  text(opts.hint||'',240,H-8,6.2,'#5a648a','center');
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
  const curChar = S.cursor>=CHARS.length ? null : CHARS[S.cursor];
  let leftCh=null,rightCh=null,leftLabel='',rightLabel='',leftPh='随机抽取',rightPh='等待选择';
  let title='选择机甲', subtitle='', cursorCol='#5ff2ff';
  if(game.mode===2){                         // 训练
    title='训练';
    subtitle='选择练习机体 · 对手为受击掉血、触底回满的靶机';
    leftCh=curChar; leftLabel='练习机体';
    rightCh=Object.assign({},TRAIN_DUMMY,{lore:'受击掉血、血量触底后回满,用于直观观察技能伤害。'});
    rightLabel='训练靶机';
  }else if(game.mode===1){                   // 街机
    title='街机';
    if(S.phase==='cpuPick'){
      leftCh=CHARS[S.idx1]; leftLabel='玩家';
      rightCh=curChar; rightLabel='电脑对手'; cursorCol='#ffc24d';
      subtitle='电脑选择中...';
    }else{
      leftCh=curChar; leftLabel='玩家预览';
      rightCh=null; rightLabel='电脑对手'; rightPh='确认后随机抽取';
      subtitle='难度:'+game.diffObj.name+' · 选择你的机甲';
    }
  }else{                                      // 对战
    title='对战';
    if(S.phase==='p2'){
      leftCh=CHARS[S.idx1]; leftLabel='P1 已选';
      rightCh=curChar; rightLabel='P2 预览'; cursorCol='#ffc24d';
      subtitle='P2 选择机甲';
    }else{
      leftCh=curChar; leftLabel='P1 预览';
      rightCh=null; rightLabel='P2'; rightPh='等待 P2 选择';
      subtitle='P1 选择机甲';
    }
  }
  const hint = S.phase==='p2'
    ? '←/→ 移动 · ↑/↓ 换行 · , 确认 · R 返回标题'
    : 'A/D 移动 · W/S 换行 · J 确认 · R 返回标题';
  drawCharSelectLayout(t,{title,subtitle,leftCh,rightCh,leftLabel,rightLabel,
    leftPlaceholder:leftPh,rightPlaceholder:rightPh,cursorCol,allowRandom:true,select:S,hint});
}
/* 选地图界面:7 张地图实时预览 + 随机 */
function drawMapSelect(t){
  const S=game.select; if(!S) return;
  g.fillStyle='rgba(5,6,13,.45)'; g.fillRect(0,0,W,H);
  shadowText('选择战场',240,22,16,'#ffe27a','center');
  text(CHARS[S.idx1].name,186,48,9,'#5ff2ff','right');
  text('VS',240,48,9,'#ff5b5b','center');
  text(CHARS[S.idx2].name,294,48,9,'#ffc24d','left');
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
      text('随机地图',x+cw/2,y+chh-10,7.5,'#b18aff','center');
    }
    px(x,y,cw,1,'#1c2646'); px(x,y+chh-1,cw,1,'#1c2646'); px(x,y,1,chh,'#1c2646'); px(x+cw-1,y,1,chh,'#1c2646');
    if(cur&&Math.sin(t*6)>-0.4){
      px(x-2,y-2,cw+4,2,'#ffe27a'); px(x-2,y+chh,cw+4,2,'#ffe27a'); px(x-2,y-2,2,chh+4,'#ffe27a'); px(x+cw,y-2,2,chh+4,'#ffe27a');
    }
    text(isRnd?'随机':MAPS[i].name,x+cw/2,y+chh+9,7.5,cur?'#ffe27a':'#8a94b8','center');
    text(String(i+1),x+4,y+9,6.5,cur?'#ffe27a':'#4a5a66');
  }
  const cur=S.cursor<MAPS.length?MAPS[S.cursor]:null;
  shadowText(cur?cur.name:'随机地图',240,234,12,'#ffe27a','center');
  text(cur?cur.tag:'从 '+MAPS.length+' 张地图中随机抽取一张',240,250,8,'#8a94b8','center');
  text('A/D 或 ←/→ 移动 · W/S 或 ↑/↓ 换行 · J / , 确认 · 也可按 1-'+total+' 或点击',240,263,7,'#5a648a','center');
}
function drawEnd(){
  g.fillStyle='rgba(5,6,13,.55)'; g.fillRect(0,0,W,H);
  const wnr=game.mechs[0].wins>=2?game.mechs[0]:game.mechs[1];
  if(game.mode===3){
    const w3=game.spectateWinner||wnr;
    shadowText('胜 者 守 擂',240,86,24,'#7df9ff','center');
    shadowText(mechLabel(w3)+' '+w3.ch.name+' 获胜 · 守擂 '+(game.spectateStreak||1)+' 连胜',240,124,13,w3.pal.light,'center');
    text('负者随机换新机体上场续战 · 擂主连守满 '+SPECTATE_STREAK_CAP+' 场即封入名人堂重抽 · [J] 立即下一场 · [ESC] 胜率天梯',240,158,9,'#8a94b8','center');
  }else if(game.mode===1){                          // 街机:走到这里只可能是玩家落败
    shadowText('街机挑战结束',240,82,24,'#ff5b5b','center');
    shadowText('街机连胜 '+game.challengeStreak+' 场',240,118,16,'#ffe27a','center');
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
