/* =========================================================================
 * 机甲对决 MECH DUEL · 13-main.js
 * 主循环与引导
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 主循环 ---------------- */
let T=0, last=0;
function render(){
  const shx=game.shake>0?ri(-game.shake,game.shake)*SC:0;
  const shy=game.shake>0?ri(-game.shake,game.shake)*SC:0;
  const z=CAM.zEff;
  const ox=SC*(W/2-CAM.cx*z)+shx, oy=SC*(H/2-CAM.cy*z)+shy;
  // 背景层:当前地图按 960×540 设计空间绘制(SC/2 × 相机缩放)
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,cv.width,cv.height);
  g.setTransform(SC*z/2,0,0,SC*z/2,ox,oy);
  drawBackground(T);
  // 世界层:逻辑坐标系 × SC × 相机缩放 —— 角色保持像素块风格
  g.setTransform(SC*z,0,0,SC*z,ox,oy);
  const list = game.state==='title' ? game.titleDuo : game.mechs;
  drawFireZones();
  drawBullets();
  drawBlasts();
  drawHazards();
  for(const m of list) drawMech(m);
  for(const m of list) drawMechEffects(m);
  drawDrones();
  drawCovers();
  drawIceballs();
  drawEmorbs();
  drawLightnings();
  // 杂兵/Boss 头顶血条(世界坐标)
  if(game.storyMode){
    for(const m of game.mechs){
      if(m.dead||m.team===0) continue;
      const w=m.isBoss?46:20, h=m.isBoss?4:3;
      const x=Math.round(m.x-w/2), y=Math.round(m.y-30*m.size-(m.isBoss?14:6));
      px(x-1,y-1,w+2,h+2,'rgba(0,0,0,.6)');
      px(x,y,w,h,'#2a3140');
      px(x,y,Math.round(w*clamp(m.hp/m.maxHp,0,1)),h,m.isBoss?'#ff5b5b':'#ff9a4d');
    }
  }
  drawParticles();
  drawDmgTexts();
  // 飞行锁定标记:红色脉冲框
  if(game.state==='fight'||game.state==='ko'){
    for(const m of game.mechs){
      if(!m.flying) continue;
      const opp=game.other(m);
      if(opp&&!opp.dead&&opp.cloakT<=0){
        const x=Math.round(opp.x), y=Math.round(opp.y-20*opp.size), r=Math.round(15*opp.size+2+Math.sin(T*8)*2);
        g.strokeStyle='#ff5b5b'; g.lineWidth=1;
        const c=6;
        g.beginPath();
        g.moveTo(x-r,y-r+c); g.lineTo(x-r,y-r); g.lineTo(x-r+c,y-r);
        g.moveTo(x+r-c,y-r); g.lineTo(x+r,y-r); g.lineTo(x+r,y-r+c);
        g.moveTo(x+r,y+r-c); g.lineTo(x+r,y+r); g.lineTo(x+r-c,y+r);
        g.moveTo(x-r+c,y+r); g.lineTo(x-r,y+r); g.lineTo(x-r,y+r-c);
        g.stroke();
      }
    }
  }
  // UI 层:逻辑坐标 × SC,不随相机移动(文字按实际分辨率渲染更清晰)
  g.setTransform(SC,0,0,SC,0,0);
  if(game.state==='title'){
    drawTitle(T);
  }else if(game.state==='map'){
    drawMapSelect(T);
  }else if(game.state==='select'||game.state==='cpuPick'||game.state==='vs'){
    drawSelect(T);
  }else if(game.state==='storyChar'){
    drawStoryCharSelect(T);
  }else if(game.state==='story'){
    drawStorySelect(T);
  }else if(game.state==='scenario'){
    drawScenario();
  }else{
    if(game.storyMode) drawStoryHUD();
    else drawHUD();
    drawAnnounce();
    if(game.state==='sresult') drawStoryResult();
    if(game.state==='end') drawEnd();
    if(game.pause){
      g.fillStyle='rgba(5,6,13,.72)'; g.fillRect(0,0,W,H);
      text('PAUSED',240,26,18,'#ffffff','center');
      // 双方武器与技能槽说明(压缩行距,避免内容溢出 270 逻辑高度)
      let y=48;
      for(const m of game.mechs){
        text(mechLabel(m)+' '+m.ch.name+'   武器:'+WEAPONS[m.weapon].name,240,y,8,m.pal.light,'center'); y+=12;
        for(const s of m.skillSlots){
          text(SLOT_LABELS[s.slot]+'  '+SKILLS[s.id].name+' — '+SKILLS[s.id].desc,240,y,6.5,'#8a94b8','center'); y+=9;
        }
        if(m.canFly){ text('双击跳跃键起飞,飞行中射击自动锁敌(燃料有限)',240,y,6.5,'#7df9ff','center'); y+=9; }
        if(m.ch.airW){ text('空中 下+射击:'+WEAPONS[m.ch.airW].name+(m.ch.airW==='mortar'?' — 按发射时目标位置解算抛物线,落点范围爆炸':' — 自动追踪目标'),240,y,6.5,'#c9a6ff','center'); y+=9; }
        y+=3;
      }
      text('双击方向冲刺 · 能量满 J+K 终结 · 防御后方向+斩/射 出招 · ESC/P 暂停 · R 重开',240,y+4,7,'#5a648a','center');
      if(Math.sin(T*4)>-0.3) text('按 [P] 继续',240,y+18,10,'#8a94b8','center');
    }
  }
  if(game.ladderOpen&&game.mode===3) drawLadder();   // 观赏模式:ESC 唤出的胜率天梯(叠于最上层,不暂停对战)
  g.setTransform(1,0,0,1,0,0);
}
function frame(ts){
  const dt=Math.min(0.033,(ts-last)/1000||0.016); last=ts;
  if(!game.pause) T+=dt;
  updateGame(game.pause?0:dt);
  render();
  requestAnimationFrame(frame);
}

/* 标题页展示机甲(静态摆设:默认两台样机) */
{
  const d1=new Mech(0,CHARS[0],'p1'); d1.reset(70,1);
  const d2=new Mech(1,CHARS[1],'p2'); d2.reset(410,-1);
  game.titleDuo=[d1,d2];
}
game.mechs=[];
loadStory();
fitCanvas();
requestAnimationFrame(frame);
