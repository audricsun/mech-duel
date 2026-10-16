/* =========================================================================
 * 机甲对决 MECH DUEL · 04-input.js
 * 输入系统:键盘/指针事件与按键状态
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 3. 输入系统 ---------------- */
const keys = {};          // 按住
let pressed = {};         // 本帧按下(边沿触发)
const PREVENT = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space']);
const MAP = {
  p1:{ left:'KeyA', right:'KeyD', jump:'KeyW', guard:'KeyS', atk:'KeyJ', shoot:'KeyK' },
  p2:{ left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', guard:'ArrowDown', atk:'Comma', shoot:'Period' }
};
addEventListener('keydown',e=>{
  initAudio(); if(AC&&AC.state==='suspended') AC.resume();
  if(PREVENT.has(e.code)) e.preventDefault();
  if(!e.repeat){
    pressed[e.code]=true;
    for(let i=1;i<=8;i++) if(e.key===String(i)) pressed['Digit'+i]=true;  // e.key 兜底(兼容部分自动化/布局)
  }
  keys[e.code]=true;
});
addEventListener('keyup',e=>{ keys[e.code]=false; });

/* 选人确认(P1 确定 → P2/AI;双方确定 → 选地图) */
function selRandomChar(){                    // 随机机体(仅在已解锁机体中抽取)
  const pool=CHARS.map((c,i)=>i).filter(charUnlocked);
  return pool.length?pool[ri(0,pool.length-1)]:0;
}
function confirmSelect(){
  const S=game.select;
  const pick = S.cursor>=CHARS.length ? selRandomChar() : S.cursor;   // 末格为"随机"
  if((S.phase==='p1'||S.phase==='p2')&&!charUnlocked(pick)){ sfx.hit(); return; }
  sfx.ui();
  if(S.phase==='p1'){
    S.idx1=pick;
    if(game.mode===1){ S.phase='cpuPick'; S.t=0.9; S.pickT=0; game.state='cpuPick'; }
    else if(game.mode===2){ game.startTraining(); }
    else S.phase='p2';
  }else if(S.phase==='p2'){
    S.idx2=pick; S.cursor=0; S.phase='map'; game.state='map';
  }
}
/* 选图确认(末项为随机)→ VS 过场 */
function confirmMap(){
  const S=game.select;
  game.mapIdx = S.cursor>=MAPS.length ? ri(0,MAPS.length-1) : S.cursor;
  S.phase='vs'; S.t=1.1; game.state='vs';
  sfx.ui();
}
/* 标题页/菜单点击开始(兼容触屏与自动化测试) */
cv.addEventListener('pointerdown',e=>{
  initAudio(); if(AC&&AC.state==='suspended') AC.resume();
  const r=cv.getBoundingClientRect();
  const x=(e.clientX-r.left)/r.width*W, y=(e.clientY-r.top)/r.height*H;
  if(game.state==='title'){
    if(y>=110&&y<200){
      const i=clamp(Math.floor((y-110)/18),0,4);
      if(i===0) game.beginFlow(0);
      else if(i===1) game.beginFlow(1);
      else if(i===2) game.beginStory();
      else if(i===3) game.beginTraining();
      else game.beginSpectate();
    }
  }else if(game.state==='diff'){
    if(y>=100&&y<=200){ game.diffObj=DIFFS[clamp(Math.floor((y-100)/32),0,2)]; game.state='select'; sfx.ui(); }
  }else if(game.state==='select'){
    const S=game.select;
    if((S.phase==='p1'||S.phase==='p2')&&x>=SEL_CX&&x<SEL_CX+SEL_COLS*SEL_GX&&y>=SEL_CY&&y<SEL_CY+3*SEL_GY){
      const col=clamp(Math.floor((x-SEL_CX)/SEL_GX),0,SEL_COLS-1);
      const row=clamp(Math.floor((y-SEL_CY)/SEL_GY),0,2);
      S.cursor=row*SEL_COLS+col;
      confirmSelect();
    }
  }else if(game.state==='map'){
    const S=game.select;
    if(x>=MAPSEL_CX&&x<MAPSEL_CX+MAPSEL_COLS*MAPSEL_GX&&y>=MAPSEL_CY&&y<MAPSEL_CY+2*MAPSEL_GY){
      const col=clamp(Math.floor((x-MAPSEL_CX)/MAPSEL_GX),0,MAPSEL_COLS-1);
      const row=clamp(Math.floor((y-MAPSEL_CY)/MAPSEL_GY),0,1);
      S.cursor=row*MAPSEL_COLS+col;
      confirmMap();
    }
  }else if(game.state==='storyChar'){
    if(x>=14&&x<474&&y>=52&&y<224){
      const i=clamp(Math.floor((y-52)/86),0,1)*5+clamp(Math.floor((x-14)/92),0,4);
      game.storyPick.cursor=i; game.confirmStoryHero(i);
    }
  }else if(game.state==='story'){
    if(x>=14&&x<474&&y>=52&&y<224){
      const i=clamp(Math.floor((y-52)/86),0,1)*5+clamp(Math.floor((x-14)/92),0,4);
      game.storySel.cursor=i; game.enterStoryLevel(i);
    }
  }else if(game.state==='scenario'){
    if(game.storyScenT>0.25) game.startStoryFight();
  }else if(game.state==='sresult'){
    if(game.storyResT>0.8) game.exitStory();
  }
});

function humanInput(map){
  return { left:!!keys[map.left], right:!!keys[map.right], guard:!!keys[map.guard],
           up:!!keys[map.jump], down:!!keys[map.guard],
           upEdge:!!pressed[map.jump], downEdge:!!pressed[map.guard],
           jump:!!pressed[map.jump], atk:!!pressed[map.atk], shoot:!!pressed[map.shoot] };
}
const NO_INP = { left:false,right:false,guard:false,up:false,down:false,upEdge:false,downEdge:false,jump:false,atk:false,shoot:false };
