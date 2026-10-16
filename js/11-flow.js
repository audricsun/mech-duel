/* =========================================================================
 * 机甲对决 MECH DUEL · 11-flow.js
 * 比赛流程:游戏状态、回合与主更新
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 9. 比赛流程 ---------------- */
const game={
  state:'title',        // title | diff | select | cpuPick | map | vs | intro | fight | ko | end
  mode:0,               // 0=双人 1=人机
  diffObj:DIFFS[1], select:null, mapIdx:0,
  round:1, timer:ROUND_TIME, koT:0, koWinner:null,
  shake:0, ann:null, pause:false, t:0,
  mechs:[],
  storyMode:false, storyIdx:0, storySel:{cursor:0}, storyWave:0, storyWaves:[], storyScenT:0,
  storyHero:0, storyPick:{cursor:0},
  storyWin:false, storyResT:0, storyUnlockMsg:null, storyMode0:false,
  challengeStreak:0,   // 挑战 AI 模式:当前连胜场数(玩家取胜后自动换对手继续)
  spectateNextT:0,     // 观赏模式:当前场结束后自动换人续场的倒计时
  spectateWinner:null, // 观赏模式:上一场获胜方(结算界面用)
  spectateStreak:0,    // 观赏模式:当前擂主连续守擂场数
  spectateLastSlot:-1, // 观赏模式:上一场胜者槽位(0=左 1=右),用于判定是否同一擂主
  spectateLadder:null, // 观赏模式:本会话 14×14 胜率矩阵(行角色 vs 列角色,单元格 {w,n})
  ladderOpen:false,    // 观赏模式:ESC 唤出的胜率天梯面板(不暂停对战)
  ladderData(){        // 惰性建立胜率矩阵(行=胜方角色,列=负方角色)
    if(!this.spectateLadder){
      const N=CHARS.length; this.spectateLadder=[];
      for(let i=0;i<N;i++){ const row=[]; for(let j=0;j<N;j++) row.push({w:0,n:0}); this.spectateLadder.push(row); }
    }
    return this.spectateLadder;
  },
  recordSpectate(winner){   // 记入一场观赏对战结果(胜方行记胜、负方行记负;同型对局不入表)
    if(!winner||!this.select) return;
    const S=this.select, L=this.ladderData();
    const wi=winner.id===0?S.idx1:S.idx2, li=winner.id===0?S.idx2:S.idx1;
    if(wi<0||li<0||wi===li) return;                          // 行=列(同型机体)不记录
    L[wi][li].n++; L[wi][li].w++;                            // 胜者视角:记一场胜
    L[li][wi].n++;                                           // 负者视角:只累加场次(胜率视作 0)
  },
  enemiesOf(m){ return this.mechs.filter(o=>o!==m && o.team!==m.team && !o.dead); },
  other(m){                                 // 最近的敌对单位(1v1 与故事模式多单位通用)
    const e=this.enemiesOf(m); if(!e.length) return null;
    let best=e[0], bd=Math.abs(e[0].x-m.x);
    for(const o of e){ const d=Math.abs(o.x-m.x); if(d<bd){ bd=d; best=o; } }
    return best;
  },
  setAnn(text,size,dur,col){ this.ann={text,size,dur,t:dur,col:col||'#ffffff'}; },
  beginFlow(mode){        // 标题进入:0 双人 → 直接选人;1 人机 → 先选难度
    this.mode=mode;
    this.storyMode=false;
    this.mechs=[]; bullets=[]; particles=[];
    fireZones=[]; drones=[]; covers=[]; iceballs=[]; emorbs=[]; lightnings=[];
    this.select={cursor:0,idx1:-1,idx2:-1,phase:'p1',t:0,pickT:0};
    this.mapIdx=0;
    this.challengeStreak=0;
    this.state = mode===1?'diff':'select';
    sfx.ui();
  },
  setupMatch(){           // 双方机体确定后开赛
    const S=this.select;
    const c1=CHARS[S.idx1], base=CHARS[S.idx2];
    // 同型机体对战时,P2 使用 B 涂装(主/亮色互换)
    const ch2 = S.idx1===S.idx2
      ? Object.assign({},base,{pal:Object.assign({},base.pal,{main:base.pal.light,light:base.pal.main})})
      : base;
    this.mechs=[ new Mech(0,c1,this.mode===3?'cpu':'p1'),
                 new Mech(1,ch2,(this.mode===1||this.mode===3)?'cpu':'p2') ];
    this.mechs[0].wins=0; this.mechs[1].wins=0;
    this.round=1; this.startRound();
  },
  startRound(){
    this.mechs[0].reset(120,1); this.mechs[1].reset(360,-1);
    bullets=[]; particles=[]; dmgTexts=[]; resetHazards();
    fireZones=[]; drones=[]; covers=[]; iceballs=[]; emorbs=[]; lightnings=[];
    this.timer=ROUND_TIME; this.koWinner=null;
    this.state='intro'; this.introT=1.7;
    this.setAnn('ROUND '+this.round,24,1.1,'#ffe27a');
    sfx.round();
  },
  endRound(winner){
    if(winner) winner.wins++;
    if(this.mode===2){                          // 训练模式:靶机不死,玩家阵亡则原地重开
      this.startRound();
      this.setAnn('机体损毁 — 重新开始训练',18,1.6,'#ff9a9a');
      return;
    }
    if(this.mode===3 && winner){              // 观赏模式:单场定胜负,结束后自动换人续场
      this.recordSpectate(winner);            // 记入本会话胜率天梯
      this.state='end'; this.spectateNextT=3.4;
      this.spectateWinner=winner;
      this.setAnn(mechLabel(winner)+' '+winner.ch.name+' 获胜!',20,99,'#7df9ff');
      return;
    }
    if(winner && winner.wins>=2){
      if(this.mode===1){                       // 挑战 AI:玩家取胜 → 换对手续战;AI 取胜 → 挑战结束
        if(winner===this.mechs[0]){ this.challengeStreak++; this.nextChallenger(); return; }
        this.state='end';
        this.setAnn(mechLabel(winner)+' '+winner.ch.name+' 获胜!',20,99,'#ffe27a');
        return;
      }
      this.state='end';
      this.setAnn(mechLabel(winner)+' '+winner.ch.name+' 获胜!',20,99,'#ffe27a');
    }else{
      if(winner===null){ /* 平局重赛同一回合 */ }
      else this.round++;
      this.startRound();
    }
  },
  nextChallenger(){        // 挑战 AI:随机抽一位新对手,直接展开下一场
    const S=this.select, c1=CHARS[S.idx1];
    const pool=[];
    for(let i=0;i<CHARS.length;i++) if(i!==S.idx2 && charUnlocked(i)) pool.push(i);
    if(pool.length) S.idx2=pool[ri(0,pool.length-1)];
    const base=CHARS[S.idx2];
    const ch2 = S.idx1===S.idx2
      ? Object.assign({},base,{pal:Object.assign({},base.pal,{main:base.pal.light,light:base.pal.main})})
      : base;
    this.mechs=[ new Mech(0,c1,'p1'), new Mech(1,ch2,'cpu') ];
    this.round=1;
    this.startRound();
    this.setAnn('下一位挑战者  '+ch2.name+'   ·   连胜 '+this.challengeStreak,18,1.7,'#ff8a5b');
  },
  /* ---- 训练模式:与不死靶机自由练习 ---- */
  beginTraining(){         // 标题进入:选择练习用机体
    this.mode=2; this.storyMode=false;
    this.mechs=[]; bullets=[]; particles=[]; dmgTexts=[];
    fireZones=[]; drones=[]; covers=[]; iceballs=[]; emorbs=[]; lightnings=[];
    this.select={cursor:0,idx1:-1,idx2:-1,phase:'p1',t:0,pickT:0};
    this.mapIdx=ri(0,MAPS.length-1);
    this.state='select'; sfx.ui();
  },
  startTraining(){         // 选定机体 → 与不死靶机对峙
    const S=this.select;
    this.mechs=[ new Mech(0,CHARS[S.idx1],'p1'), new Mech(1,TRAIN_DUMMY,'cpu') ];
    const d=this.mechs[1]; d.invincible=true; d.passive=true; d.isDummy=true;
    bullets=[]; particles=[]; dmgTexts=[]; resetHazards();
    fireZones=[]; drones=[]; covers=[]; iceballs=[]; emorbs=[]; lightnings=[];
    this.mechs[0].reset(120,1); d.reset(360,-1);
    this.timer=0; this.koWinner=null; this.round=1;
    this.state='intro'; this.introT=1.2;
    this.setAnn('训练开始 — 靶机受击掉血,血量触底后回满',17,1.7,'#7dff9a'); sfx.round();
  },
  /* ---- 观赏模式:随机两位电脑角色自动对战 ---- */
  beginSpectate(){         // 标题进入:随机抽两位已解锁机体对峙
    this.mode=3; this.storyMode=false;
    this.mechs=[]; bullets=[]; particles=[]; dmgTexts=[];
    fireZones=[]; drones=[]; covers=[]; iceballs=[]; emorbs=[]; lightnings=[];
    this.select={cursor:0,idx1:-1,idx2:-1,phase:'vs',t:0,pickT:0};
    this.pickSpectators(); this.mapIdx=ri(0,MAPS.length-1);
    this.spectateStreak=0; this.spectateLastSlot=-1;
    this.ladderOpen=false;                      // 面板默认收起(ESC 唤出)
    this.select.t=1.2; this.state='vs'; sfx.ui();
  },
  pickSpectators(){        // 从已解锁机体中随机取两位(尽量不同)
    const pool=CHARS.map((c,i)=>i).filter(charUnlocked);
    let a=pool[ri(0,pool.length-1)], b=pool[ri(0,pool.length-1)];
    if(pool.length>1) while(b===a) b=pool[ri(0,pool.length-1)];
    this.select.idx1=a; this.select.idx2=b;
  },
  nextSpectators(){        // 胜者留场守擂,负者随机换一位新机体,立即展开下一场
    const S=this.select, w=this.spectateWinner;
    const pool=CHARS.map((c,i)=>i).filter(charUnlocked);
    const champSlot = w ? w.id : 0;                            // 胜者槽位:0=左,1=右
    if(champSlot!==this.spectateLastSlot) this.spectateStreak=0;   // 挑战者夺擂 → 连胜重新计
    this.spectateStreak++; this.spectateLastSlot=champSlot;
    const keepIdx = champSlot===0 ? S.idx1 : S.idx2;           // 擂主保留原机体
    let n; do{ n=pool[ri(0,pool.length-1)]; }while(pool.length>1 && n===keepIdx);
    if(champSlot===0) S.idx2=n; else S.idx1=n;                 // 只替换负者一侧
    this.mapIdx=ri(0,MAPS.length-1); this.setupMatch();
    this.setAnn('擂主 '+CHARS[keepIdx].name+'  '+this.spectateStreak+' 连胜   VS   挑战者 '+CHARS[n].name,15,1.7,'#7df9ff');
  },
  /* ---- 故事模式 ---- */
  beginStory(){           // 标题 / 更换机师 → 选择出击机师
    this.mode=0; this.storyMode=false; this.mechs=[]; bullets=[]; particles=[]; dmgTexts=[];
    fireZones=[]; drones=[]; covers=[]; iceballs=[]; emorbs=[]; lightnings=[];
    this.storyPick={cursor:clamp(this.storyHero,0,CHARS.length-1)};
    this.state='storyChar';
    sfx.ui();
  },
  confirmStoryHero(i){    // 选人 → 选关:以该机师挑战全部 10 关
    if(!charUnlocked(i)){ sfx.hit(); this.setAnn('该机体尚未解锁',14,1.0,'#ff6a7a'); return; }
    this.storyHero=i;
    this.enterStorySelect();
  },
  enterStorySelect(){     // 进入选关界面(光标停在待攻关卡)
    this.storySel={cursor:clamp(storyProg.cleared,0,STORY.length-1)};
    this.mapIdx=STORY[this.storySel.cursor].map;
    this.state='story';
    sfx.ui();
  },
  enterStoryLevel(i){     // 选关 → 剧情
    if(!storyLevelOpen(i)){ sfx.hit(); this.setAnn('关卡未解锁',14,1.0,'#ff6a7a'); return; }
    this.storyIdx=i;
    this.storyScenT=0;
    this.mapIdx=STORY[i].map;
    this.state='scenario';
    sfx.ui();
  },
  startStoryFight(){      // 剧情 → 战斗(第 1 波)
    const lv=STORY[this.storyIdx];
    this.storyMode=true;
    bullets=[]; particles=[]; dmgTexts=[]; resetHazards();
    fireZones=[]; drones=[]; covers=[]; iceballs=[]; emorbs=[]; lightnings=[];
    this.mechs=[ new Mech(0, CHARS[this.storyHero], 'p1') ];
    this.mechs[0].reset(70,1);
    const half=Math.ceil(lv.count/2);
    // 波次结构:第 0 波 = 清剿杂兵(数量取半数),第 1 波 = Boss 单独登场。
    // 刻意不给 Boss 配护卫:实测「1 打 N」的人数劣势远大于任何数值系数,
    // 一旦 Boss 波带杂兵,高阶关卡会在数学上变成无法通关的死关。
    this.storyWaves=[ {mobs:half,boss:false}, {mobs:STORY_BOSS.bossWaveAdds,boss:true} ];
    this.storyWave=-1;
    this.spawnStoryWave();
    this.koWinner=null; this.storyWin=false;
    this.state='intro'; this.introT=1.7;
    this.setAnn(lv.title,18,1.6,'#ffe27a');
    sfx.round();
  },
  spawnStoryWave(){
    this.storyWave++;
    const w=this.storyWaves[this.storyWave];
    if(!w) return;
    // 清理上一波残骸(保留玩家)
    this.mechs=this.mechs.filter(m=>m.team===0||!m.dead);
    const lv=STORY[this.storyIdx];
    const defs=[];
    for(let i=0;i<w.mobs;i++){
      const t=lv.mobs[i%lv.mobs.length];
      defs.push({ ch:mobChar(t), mob:true, boss:false });
    }
    if(w.boss){
      defs.push({ ch:bossChar(lv, this.storyHero), mob:false, boss:true });
    }
    let nid=this.mechs.reduce((a,m)=>Math.max(a,m.id),0)+1;
    const N=defs.length;
    for(let i=0;i<N;i++){
      const d=defs[i];
      const m=new Mech(nid++, d.ch, 'cpu');
      const x=250+(N===1?100:i/(N-1)*190);   // 世界逻辑宽度仅 480,x∈[250,440]
      m.team=1; m.isMob=d.mob; m.isBoss=d.boss;
      m.reset(x,-1);
      if(d.boss) m.hp=m.maxHp=Math.round(d.ch.hp||320);
      this.mechs.push(m);
    }
    if(w.boss){
      const b=this.mechs[this.mechs.length-1];
      this.setAnn('BOSS 出现 — '+b.ch.name,20,2.0,'#ff5b5b');
      sfx.round();
    }
  },
  onStoryKill(def){
    if(def.team===0){ this.storyDefeat(); return; }
    const pl=this.mechs[0];
    if(!pl||pl.dead){ this.storyDefeat(); return; }
    if(this.enemiesOf(pl).length>0) return;
    if(this.storyWave < this.storyWaves.length-1){
      // 波间补给:纳米修复,避免连续消耗导致后续波次必败
      const heal=Math.round(pl.maxHp*WAVE_HEAL.healK);
      if(heal>0&&pl.hp<pl.maxHp){
        pl.hp=Math.min(pl.maxHp, pl.hp+heal);
        this.setAnn('波次清剿 — 纳米修复 +'+heal,15,1.4,'#7dffa0');
        sfx.ui();
      }
      this.spawnStoryWave();
    }else{
      this.storyVictory();
    }
  },
  storyVictory(){
    const idx=this.storyIdx;
    const firstClear = storyProg.cleared < idx+1;
    if(firstClear){ storyProg.cleared=idx+1; saveStory(); }
    this.storyWin=true; this.storyUnlockMsg=null;
    // 第 9 / 第 10 关的 BOSS 即隐藏机体(由 bossIdx 指定),首通即解锁
    const bossIdx = STORY[idx] ? STORY[idx].bossIdx : undefined;
    if(firstClear && bossIdx!==undefined && CHARS[bossIdx] && CHARS[bossIdx].locked)
      this.storyUnlockMsg='隐藏机体「'+CHARS[bossIdx].name+'」已解锁!可在选人界面选择使用';
    this.storyResT=0;
    this.state='sresult';
    this.setAnn('关卡达成',22,1.6,'#7df9ff');
    sfx.round();
  },
  storyDefeat(){
    this.storyWin=false; this.storyUnlockMsg=null;
    this.storyResT=0;
    this.state='sresult';
    this.setAnn('机体损毁',22,1.6,'#ff5b5b');
  },
  exitStory(){
    this.storyMode=false;
    this.mechs=[]; bullets=[]; particles=[]; dmgTexts=[];
    fireZones=[]; drones=[]; covers=[]; iceballs=[]; emorbs=[]; lightnings=[];
    this.storySel={cursor:this.storyIdx};
    this.mapIdx=STORY[this.storyIdx].map;
    this.state='story';
    sfx.ui();
  }
};

/* 动态相机:双机近→放大(1.5),远→缩小(0.75),注视点=双机中点(限界内) */
function updateCamera(dt){
  let zT=1, fx=W/2, fy=H/2;
  if(game.state==='intro'||game.state==='fight'||game.state==='ko'||game.state==='sresult'){
    // 按全部存活单位的包围盒取景(1v1 与故事模式多单位通用)
    let list=game.mechs.filter(m=>!m.dead);
    if(!list.length) list=game.mechs;
    if(list.length){
      let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
      for(const m of list){
        if(m.x<x0)x0=m.x; if(m.x>x1)x1=m.x;
        if(m.y<y0)y0=m.y; if(m.y>y1)y1=m.y;
      }
      const d=Math.max(x1-x0,(y1-y0)*0.8);
      zT=clamp(1.55-d/460*0.95, ZMIN, ZMAX);   // 连续缩放,无量化阶梯
      fx=(x0+x1)/2; fy=(y0+y1)/2-24;
    }
  }
  const k=Math.min(1,dt*6);
  CAM.zoom+=(zT-CAM.zoom)*k; CAM.cx+=(fx-CAM.cx)*k; CAM.cy+=(fy-CAM.cy)*k;
  CAM.zEff=clamp(CAM.zoom,ZMIN,ZMAX);
  const hw=W/2/CAM.zEff, hh=H/2/CAM.zEff;
  CAM.cx = hw>=W/2 ? W/2 : clamp(CAM.cx,hw,W-hw);
  CAM.cy = hh>=H/2 ? H/2 : clamp(CAM.cy,hh,H-hh);
}

function updateGame(dt){
  game.t+=dt;
  if(game.ann){ game.ann.t-=dt; if(game.ann.t<=0) game.ann=null; }
  game.shake=Math.max(0,game.shake-14*dt);
  musicSet(desiredMusic());          // 依据当前状态切换背景音轨(AC 未就绪时静默记录)

  // 全局按键
  if(pressed['KeyR']&&game.state!=='title'){ game.storyMode=false; game.state='title'; game.ladderOpen=false; game.pause=false; sfx.ui(); }
  if(pressed['Escape']&&game.mode===3&&game.state!=='title'){ game.ladderOpen=!game.ladderOpen; sfx.ui(); }   // 观赏模式:ESC 唤出/收起胜率天梯,不暂停对战
  else if((pressed['KeyP']||pressed['Escape'])&&(game.state==='fight'||game.state==='intro')){ game.pause=!game.pause; sfx.ui(); }

  switch(game.state){
    case 'title':
      if(pressed['Digit1']||pressed['Numpad1']){ game.beginFlow(0); break; }
      if(pressed['Digit2']||pressed['Numpad2']){ game.beginFlow(1); break; }
      if(pressed['Digit3']||pressed['Numpad3']){ game.beginStory(); break; }
      if(pressed['Digit4']||pressed['Numpad4']){ game.beginTraining(); break; }
      if(pressed['Digit5']||pressed['Numpad5']){ game.beginSpectate(); break; }
      break;
    case 'storyChar':{
      const S=game.storyPick, N=CHARS.length;
      if(pressed['KeyA']||pressed['ArrowLeft']) S.cursor=(S.cursor+N-1)%N;
      else if(pressed['KeyD']||pressed['ArrowRight']) S.cursor=(S.cursor+1)%N;
      else if(pressed['KeyW']||pressed['ArrowUp']||pressed['KeyS']||pressed['ArrowDown']) S.cursor=(S.cursor+7)%N;
      else if(pressed['KeyJ']||pressed['Comma']||pressed['Enter']||pressed['Space']) game.confirmStoryHero(S.cursor);
      else for(let i=0;i<9;i++) if(pressed['Digit'+(i+1)]||pressed['Numpad'+(i+1)]){ S.cursor=i; game.confirmStoryHero(i); break; }
      break;}
    case 'story':{
      const S=game.storySel, N=STORY.length, COLS=5;
      game.mapIdx=STORY[S.cursor].map;         // 背景随选中关卡切换
      if(pressed['KeyA']||pressed['ArrowLeft']) S.cursor=(S.cursor+N-1)%N;
      else if(pressed['KeyD']||pressed['ArrowRight']) S.cursor=(S.cursor+1)%N;
      else if(pressed['KeyW']||pressed['ArrowUp']||pressed['KeyS']||pressed['ArrowDown']) S.cursor=(S.cursor+COLS)%N;
      else if(pressed['KeyC']) game.beginStory();              // 返回更换出击机师
      else if(pressed['KeyJ']||pressed['Comma']||pressed['Enter']) game.enterStoryLevel(S.cursor);
      else for(let i=0;i<9;i++) if(pressed['Digit'+(i+1)]||pressed['Numpad'+(i+1)]){ S.cursor=i; game.enterStoryLevel(i); break; }
      break;}
    case 'scenario':
      game.storyScenT+=dt;
      if(game.storyScenT>0.25&&(pressed['KeyJ']||pressed['Comma']||pressed['Enter']||pressed['Space'])) game.startStoryFight();
      break;
    case 'diff':{
      let d=-1;
      if(pressed['Digit1']||pressed['Numpad1']) d=0;
      else if(pressed['Digit2']||pressed['Numpad2']) d=1;
      else if(pressed['Digit3']||pressed['Numpad3']) d=2;
      if(d>=0){ game.diffObj=DIFFS[d]; game.state='select'; sfx.ui(); }
      break;}
    case 'select':{
      const S=game.select, N=CHARS.length+1;      // 15 格:14 机体 + 随机
      if(S.phase==='p1'||S.phase==='p2'){
        const p1=S.phase==='p1';
        if(pressed[p1?'KeyA':'ArrowLeft']) S.cursor=(S.cursor+N-1)%N;
        else if(pressed[p1?'KeyD':'ArrowRight']) S.cursor=(S.cursor+1)%N;
        else if(pressed[p1?'KeyW':'ArrowUp']) S.cursor=(S.cursor+N-SEL_COLS)%N;
        else if(pressed[p1?'KeyS':'ArrowDown']) S.cursor=(S.cursor+SEL_COLS)%N;
        else if(pressed[p1?'KeyJ':'Comma']||pressed['Enter']) confirmSelect();
      }
      break;}
    case 'cpuPick':{
      const S=game.select;
      S.t-=dt; S.pickT-=dt;
      if(S.pickT<=0){ S.pickT=0.08; const pool=CHARS.map((c,i)=>i).filter(charUnlocked); S.cursor=pool[ri(0,pool.length-1)]; }   // 随机高亮滚动(仅已解锁机体)
      if(S.t<=0){ const pool=CHARS.map((c,i)=>i).filter(charUnlocked); S.idx2=pool[ri(0,pool.length-1)]; S.cursor=0; S.phase='map'; game.state='map'; sfx.ui(); }
      break;}
    case 'map':{
      const S=game.select, N=MAPS.length+1;       // 8 格:7 地图 + 随机
      if(pressed['KeyA']||pressed['ArrowLeft']) S.cursor=(S.cursor+N-1)%N;
      else if(pressed['KeyD']||pressed['ArrowRight']) S.cursor=(S.cursor+1)%N;
      else if(pressed['KeyW']||pressed['ArrowUp']) S.cursor=(S.cursor+N-4)%N;
      else if(pressed['KeyS']||pressed['ArrowDown']) S.cursor=(S.cursor+4)%N;
      else if(pressed['KeyJ']||pressed['Comma']||pressed['Enter']) confirmMap();
      else{
        for(let i=0;i<N;i++)
          if(pressed['Digit'+(i+1)]||pressed['Numpad'+(i+1)]){ S.cursor=i; confirmMap(); break; }
      }
      break;}
    case 'vs':
      game.select.t-=dt;
      if(game.select.t<=0) game.setupMatch();
      break;
    case 'intro':
      game.introT-=dt;
      if(game.introT<=0.7&&game.introT+dt>0.7) game.setAnn('FIGHT!',26,0.7,'#7dff6a');
      if(game.introT<=0){ game.state='fight'; }
      for(const m of game.mechs) m.update(dt,game);
      break;
    case 'fight':
      for(const m of game.mechs) m.update(dt,game);
      // 近战判定:所有敌对配对
      for(const a of game.mechs)
        for(const d of game.mechs)
          if(a!==d && a.team!==d.team) meleeCheck(a,d);
      // 身体推挤,防止重叠(通用 N 单位两两分离)
      for(let i=0;i<game.mechs.length;i++){
        const a=game.mechs[i]; if(a.dead) continue;
        for(let j=i+1;j<game.mechs.length;j++){
          const b=game.mechs[j]; if(b.dead) continue;
          const ov=(a.size+b.size)*13-Math.abs(a.x-b.x);
          if(ov>0&&Math.abs(a.y-b.y)<32){ const s=Math.sign(a.x-b.x)||1; a.x+=s*ov/2; b.x-=s*ov/2; }
        }
      }
      updateBullets(dt,game.mechs);
      updateFireZones(dt,game.mechs);
      updateDrones(dt,game.mechs);
      updateCovers(dt,game.mechs);
      updateIceballs(dt,game.mechs);
      updateEmorbs(dt,game.mechs);
      updateLightnings(dt,game.mechs);
      if(!game.storyMode && game.mode<2){    // 训练/观赏模式不计时、不触发地图机关
        updateHazards(dt);
        game.timer-=dt;
        if(game.timer<=0){                    // 超时按血量判负
          game.timer=0;
          const [a,b]=game.mechs;
          let w=null;
          if(a.hp>b.hp) w=a; else if(b.hp>a.hp) w=b;
          game.state='ko'; game.koT=1.6; game.koWinner=w;
          game.setAnn('TIME UP',22,1.4,'#ffe27a');
          sfx.round();
        }
      }
      break;
    case 'ko':
      for(const m of game.mechs) m.update(dt,game);
      updateBullets(dt,game.mechs);
      updateFireZones(dt,game.mechs);
      updateDrones(dt,game.mechs);
      updateCovers(dt,game.mechs);
      updateIceballs(dt,game.mechs);
      updateEmorbs(dt,game.mechs);
      updateLightnings(dt,game.mechs);
      game.koT-=dt;
      if(game.koT<=0) game.endRound(game.koWinner);
      break;
    case 'sresult':
      game.storyResT+=dt;
      for(const m of game.mechs) m.update(dt,game);
      updateBullets(dt,game.mechs);
      updateFireZones(dt,game.mechs);
      updateDrones(dt,game.mechs);
      updateCovers(dt,game.mechs);
      updateIceballs(dt,game.mechs);
      updateEmorbs(dt,game.mechs);
      updateLightnings(dt,game.mechs);
      if(game.storyResT>0.8&&(pressed['KeyJ']||pressed['Comma']||pressed['Enter']||pressed['Space'])) game.exitStory();
      break;
    case 'end':
      if(game.mode===3){                       // 观赏模式:自动换人续场,或按键立即下一场
        game.spectateNextT-=dt;
        if(game.spectateNextT<=0||pressed['KeyJ']||pressed['Comma']||pressed['Enter']||pressed['Space']) game.nextSpectators();
      }
      break;
  }
  updateParticles(dt);
  updateDmgTexts(dt);
  for(const m of game.mechs) m.updateHud(dt);
  updateCamera(dt);
  pressed={};                               // 清空边沿触发
}
