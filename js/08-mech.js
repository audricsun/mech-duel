/* =========================================================================
 * 机甲对决 MECH DUEL · 08-mech.js
 * 机甲实体(状态机)与像素绘制
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 6. 机甲实体与像素绘制 ---------------- */
class Mech{
  constructor(id,ch,ctrl){
    this.id=id; this.ch=ch; this.pal=ch.pal; this.ctrl=ctrl; this.wins=0;
    this.team=id===0?0:1;                 // 阵营:0=玩家方 1=敌方(故事模式多单位区分敌我)
    this.isMob=false; this.isBoss=false;  // 故事模式标记(绘制/结算用)
    this.invincible=false; this.passive=false;  // 训练模式靶机:不死 / 完全被动
    this.maxHp=ch.hp; this.spd=ch.spd; this.jumpV=ch.jump; this.atkMul=ch.atk;
    this.bulletDmg=ch.bullet; this.regen=ch.regen; this.size=ch.size; this.guardMul=ch.guardMul||0.15;
    this.pCount=ch.pCount||1; this.pSize=ch.pSize||1;   // 投射物数量/体积倍率(隐藏机体 >1)
    this.weapon=ch.weapon||'rifle'; this.canFly=!!ch.canFly;
    this.meleeW=ch.meleeW||'saber'; this.mw=MELEE_WEP[this.meleeW]||MELEE_WEP.saber;  // 近战兵装
    this.atkDur=this.mw.atkT;                        // 当前挥砍时长(结算用)
    // 技能槽列表(按 HUD 显示顺序)与冷却表
    this.skillSlots=['nJ','fJ','bJ','nK','fK','bK'].filter(s=>ch.skills&&ch.skills[s]).map(s=>({slot:s,id:ch.skills[s]}));
    this.reset(0,1);
  }
  reset(x,facing){
    this.x=x; this.y=GROUND; this.vx=0; this.vy=0; this.facing=facing;
    this.hp=this.maxHp; this.chipHp=this.maxHp; this.energy=100;
    this.onGround=true; this.guarding=false; this.dead=false;
    this.atkT=0; this.atkCd=0; this.hitDone=true; this.shootCd=0; this.muzzleT=0;
    this.stunT=0; this.stunCd=0; this.flash=0; this.walkT=0; this.moving=false; this.smokeT=0; this.slowT=0;
    // 技能与飞行状态
    this.cds={}; this.comboT=0; this.comboDir=0;                 // 技能冷却表 + 防御输入窗口
    this.siege=false; this.siegeT=0; this.overT=0; this.cloakT=0; this.cloakAtk=false;
    this.fortifyT=0; this.burstT=0; this.shieldT=0; this.roarT=0; this.speedBoostT=0;
    this.dashT=0; this.dashHit=false; this.spinT=0; this.spinHit=false;
    this.dashDir=1; this.dashSpd=520; this.dashDmgMul=1.2; this.dashKb=150;
    this.inBuf=null;                         // 人类玩家输入缓冲(硬直期间的边沿输入暂存)
    this.burstN=0; this.burstGap=0; this.burstGap0=0.15;
    this.flying=false; this.flyFuel=2.5; this.flyMax=2.5; this.lastUpT=-9;
    this.regenDelay=0;                       // 靶机:触底后的回血延迟计时
    this.ai={t:0,move:0,guardT:0};           // 每机体独立 AI 记忆(避免多单位互相污染)
  }
  get inAction(){ return this.atkT>0; }
  update(dt,game){
    const opp=game.other(this);
    // 定时器
    this.flash=Math.max(0,this.flash-dt); this.atkCd=Math.max(0,this.atkCd-dt);
    this.shootCd=Math.max(0,this.shootCd-dt); this.muzzleT=Math.max(0,this.muzzleT-dt);
    this.stunT=Math.max(0,this.stunT-dt); this.stunCd=Math.max(0,this.stunCd-dt); this.slowT=Math.max(0,this.slowT-dt);
    for(const k in this.cds) if(this.cds[k]>0) this.cds[k]=Math.max(0,this.cds[k]-dt);
    this.comboT=Math.max(0,this.comboT-dt);
    this.speedBoostT=Math.max(0,this.speedBoostT-dt); this.roarT=Math.max(0,this.roarT-dt);
    this.overT=Math.max(0,this.overT-dt); this.cloakT=Math.max(0,this.cloakT-dt);
    this.fortifyT=Math.max(0,this.fortifyT-dt); this.burstT=Math.max(0,this.burstT-dt);
    this.shieldT=Math.max(0,this.shieldT-dt); this.spinT=Math.max(0,this.spinT-dt);
    if(this.atkT>0) this.atkT=Math.max(0,this.atkT-dt);
    if(this.dead){ // 残骸冒烟
      this.smokeT-=dt;
      if(this.smokeT<=0){ this.smokeT=0.14;
        particles.push({x:this.x+rnd(-14,10),y:this.y-rnd(2,10),vx:rnd(-8,8),vy:rnd(-40,-15),life:rnd(0.4,0.9),max:0.9,col:'#4a4f5e',sz:ri(2,3),g:-40});
      }
      this.physics(dt); return;
    }
    // 朝向对手(挥砍中不转向)
    if(opp && !(this.atkT>0.14)) this.facing = opp.x>=this.x?1:-1;
    // 获取输入:人类玩家即使处于受击硬直也持续采样键盘,并把边沿输入暂存到短时缓冲,
    // 硬直结束后的若干帧内补发 —— 避免被敌方连续弹幕的硬直锁死而"按键无响应"
    const isHuman=this.ctrl!=='cpu';
    let hu=null;
    if(isHuman && game.state==='fight'){
      hu=humanInput(MAP[this.ctrl]);
      const b=this.inBuf||(this.inBuf={jump:0,atk:0,shoot:0,upEdge:0,downEdge:0});
      // 缓冲寿命 0.4s,覆盖满硬直(0.3s)与硬直保护下的最短可操作窗口,确保硬直期间按键不丢
      if(hu.jump)     b.jump=0.4;
      if(hu.atk)      b.atk=0.4;
      if(hu.shoot)    b.shoot=0.4;
      if(hu.upEdge)   b.upEdge=0.4;
      if(hu.downEdge) b.downEdge=0.4;
      for(const k in b) if(b[k]>0) b[k]=Math.max(0,b[k]-dt);
    }
    let inp=NO_INP;
    if(game.state==='fight' && this.stunT<=0){
      if(isHuman){
        inp=hu;
        const b=this.inBuf;                  // 补发硬直期间缓存的边沿输入(消费后清零)
        if(b){
          if(b.jump>0){ inp.jump=true; b.jump=0; }
          if(b.atk>0){ inp.atk=true; b.atk=0; }
          if(b.shoot>0){ inp.shoot=true; b.shoot=0; }
          if(b.upEdge>0){ inp.upEdge=true; b.upEdge=0; }
          if(b.downEdge>0){ inp.downEdge=true; b.downEdge=0; }
        }
      }
      else inp=cpuInput(this,opp,game,dt);
    }
    // 技能输入窗口:按下防御瞬间开启 0.5s,窗口内 方向(无/前/后)+斩/射 组合施放技能槽
    if(inp.downEdge){ this.comboT=0.5; this.comboDir=0; }
    let justCast=false;
    if(this.comboT>0 && this.stunT<=0 && (inp.atk||inp.shoot)){
      const dir=inp.left&&!inp.right?-1:(inp.right&&!inp.left?1:0);
      if(dir) this.comboDir=dir;
      const d=this.comboDir;
      const slot=(d===0?'n':(d===this.facing?'f':'b'))+(inp.atk?'J':'K');
      const id=this.ch.skills&&this.ch.skills[slot];
      if(id && (this.cds[id]||0)<=0 && !(id==='vulcan'&&(!this.onGround||this.flying))){
        justCast=this.castSkill(slot,opp);
        this.comboT=0;                       // 消费输入窗口
      }
      // 槽位为空或冷却中:不消费,回退为普通攻击/射击
    }
    // 防御(仅地面、非攻击中、非攻城模式)
    this.guarding = inp.guard && this.onGround && this.atkT<=0 && !this.siege;
    if(this.stunT>0){                    // 受击硬直:击退滑行 + 摩擦
      this.vx*=Math.max(0,1-4*dt);
    }else if(this.guarding){
      this.vx=0;
    }else{
      this.moving=false;
      const spdMul=(this.speedBoostT>0?1.5:1)*(this.slowT>0?0.55:1);   // 战术翻滚增益 / 寒冰减速
      if(this.siege){ this.vx=0; }                    // 机炮形态:定身炮塔
      else if(inp.left){ this.vx=-this.spd*spdMul; this.moving=true; }
      else if(inp.right){ this.vx=this.spd*spdMul; this.moving=true; }
      else this.vx=0;
      if(this.moving) this.walkT+=dt*11;
      if(inp.jump && this.onGround && !this.siege){ this.vy=-this.jumpV; this.onGround=false; sfx.jump(); }
      if(inp.atk && !justCast && this.atkCd<=0 && (this.onGround||this.flying) && !this.siege){
        this.atkDur=this.mw.atkT; this.atkT=this.atkDur; this.atkCd=this.mw.cd; this.hitDone=false; sfx.swing();
      }
      if(inp.shoot && !justCast){
        if(this.flying && inp.down && this.ch.airW) this.fireAir(opp);   // 空中特化武装
        else this.fire(this.flying?lockAngle(this,opp):(this.facing>0?0:Math.PI));
      }
    }
    // 飞行:空中 0.3s 内双击上起飞(仅 canFly 机体)
    if(this.canFly && !this.dead){
      if(inp.upEdge){
        if(!this.onGround && !this.flying && T-this.lastUpT<0.3 && this.flyFuel>0.3){
          this.flying=true; this.vy=0; sfx.jump();
          for(let i=0;i<8;i++) particles.push({x:this.x+rnd(-10,10),y:this.y,vx:rnd(-30,30),vy:rnd(30,80),life:0.3,max:0.3,col:'#7df9ff',sz:2,g:0});
        }
        this.lastUpT=T;
      }
      if(this.flying){
        this.flyFuel-=dt;
        if(this.flyFuel<=0){ this.flyFuel=0; this.flying=false; }
        else if(T%0.1<dt) particles.push({x:this.x-this.facing*8,y:this.y-4,vx:rnd(-10,10),vy:rnd(40,80),life:0.25,max:0.25,col:'#7df9ff',sz:1,g:0});
      }else if(this.onGround){
        this.flyFuel=Math.min(this.flyMax,this.flyFuel+dt*1.6);
      }
    }
    // 冲刺类技能:位移 + 冲撞判定(参数化:方向/速度/伤害倍率/击退)
    if(this.dashT>0){
      this.dashT-=dt; this.vx=this.dashDir*this.facing*this.dashSpd;
      for(let i=0;i<2;i++) particles.push({x:this.x+this.facing*rnd(-6,10),y:this.y-rnd(6,40),vx:-this.dashDir*this.facing*rnd(30,90),vy:rnd(-25,25),life:0.24,max:0.24,col:this.pal.saber,sz:ri(1,2),g:0});
      if(opp&&!opp.dead&&!this.dashHit&&this.dashDmgMul>0&&Math.abs(opp.x-this.x)<34&&Math.abs(opp.y-this.y)<40){
        this.dashHit=true; hitMech(opp,Math.round(MELEE_DMG*this.dashDmgMul*this.atkMul*this.mw.dmg*roleMeleeMul(this)),this.facing*this.dashKb,true);
      }
    }
    // 回旋斩:旋转光剑周身一次判定
    if(this.spinT>0){
      particles.push({x:this.x+rnd(-26,26),y:this.y-rnd(6,34),vx:0,vy:0,life:0.12,max:0.12,col:this.pal.saber,sz:2,g:0});
      if(!this.spinHit&&opp&&!opp.dead&&Math.abs(opp.x-this.x)<36&&Math.abs(opp.y-this.y)<40){
        this.spinHit=true; hitMech(opp,Math.round(MELEE_DMG*this.atkMul*this.mw.dmg*roleMeleeMul(this)),(Math.sign(opp.x-this.x)||1)*130,true);
      }
    }
    // 技能连发队列(速射三连/火箭齐射):不耗能快速打完剩余弹
    if(this.burstN>0){
      this.burstGap-=dt;
      if(this.burstGap<=0){
        this.shootCd=0;                     // 连发期间忽略常规射击间隔
        const ang=this.flying&&opp&&!opp.dead?lockAngle(this,opp):(this.facing>0?0:Math.PI);
        if(this.fire(ang)){ this.burstN--; this.burstGap=this.burstGap0; }
        else this.burstN=0;
      }
    }
    // 火神炮模式:定时解除;期间自动向对手方向倾泻 5 连发扇形弹幕(不耗能)
    if(this.siegeT>0){
      this.siegeT-=dt;
      if(this.siegeT<=0){ this.siegeT=0; this.siege=false; }
      else if(opp&&!opp.dead) this.fire(lockAngle(this,opp));
    }
    this.energy=Math.min(100,this.energy+this.regen*dt*(this.burstT>0?3:1));
    if(this.invincible){                         // 靶机:掉至下限后停留 1s,再快速回满(展示技能伤害)
      if(this.hp<=DUMMY_HP_FLOOR+0.5) this.regenDelay+=dt;
      if(this.regenDelay>=1) this.hp=Math.min(this.maxHp,this.hp+this.maxHp*3.2*dt);
      if(this.hp>=this.maxHp-0.5) this.regenDelay=0;   // 回满后复位,可再次受击体验
    }
    this.physics(dt,inp);
    this.x=clamp(this.x,16,W-16);
  }
  /* 统一射击入口:按专属武器生成子弹;火神炮模式强制 5 连发扇形机炮 */
  fire(ang){
    if(this.shootCd>0) return false;
    let wid=this.weapon, w=WEAPONS[wid], cdMul=1, fan=w.fan||1, fanArc=w.fanArc||0;
    if(this.overT>0) cdMul=0.64;                      // 过载射击:射速提升
    if(this.siege){ wid='vulcan'; w=WEAPONS.vulcan; fan=5; fanArc=0.14; }
    if(this.pCount>1&&(fan>=2||fanArc>0)) fan=Math.max(1,Math.round(fan*this.pCount));  // 隐藏机体:扇形弹幕更密
    const cost=(this.overT>0||this.siegeT>0||this.burstN>0)?0:w.cost;   // 过载/火神炮/技能连发:免能耗能
    if(this.energy<cost) return false;
    this.shootCd=this.siege?0.2:w.cd*cdMul;
    this.energy-=cost; this.muzzleT=0.09;
    const ox=this.x+this.facing*29*this.size, oy=this.y-24*this.size;
    let dmgMul=1;
    if(this.cloakAtk){ dmgMul=1.8; this.cloakAtk=false; this.cloakT=0; }  // 破隐一击
    for(let i=0;i<fan;i++){
      const a=ang+(i-(fan-1)/2)*fanArc;
      bullets.push({ x:ox, y:oy, baseY:oy,
        vx:Math.cos(a)*w.speed, vy:Math.sin(a)*w.speed,
        own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*w.dmg*dmgMul)),
        type:wid, aoe:w.aoe||0, pierce:!!w.pierce, wave:w.wave?0:undefined,
        t:0, ang:a, knock:w.knock||60, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6 });
    }
    sparks(this.x+this.facing*31*this.size,this.y-24*this.size,'#ffe27a',5,80);
    sfx.shoot();
    return true;
  }
  /* 空中特化武装:飞行中 下+射击 — 疾风=追踪飞弹×2 / 幽灵=追踪火箭 / 新星=迫击炮
   * 迫击炮按发射瞬间目标位置解算抛物线(固定飞行时长),落点范围爆炸 */
  fireAir(opp){
    if(this.shootCd>0) return false;
    const wid=this.ch.airW, w=WEAPONS[wid];
    if(!w||this.energy<w.cost) return false;
    this.shootCd=w.cd; this.energy-=w.cost; this.muzzleT=0.1;
    const ox=this.x, oy=this.y-30*this.size;
    if(wid==='mortar'){
      const tx=clamp(opp&&!opp.dead?opp.x:this.x+this.facing*130,20,W-20);
      const ty=(opp&&!opp.dead?opp.y:GROUND)-6;
      const T2=0.85, grav=560;
      bullets.push({x:ox,y:oy,vx:(tx-ox)/T2,vy:((ty-oy)-0.5*grav*T2*T2)/T2,grav,
        own:this.id,team:this.team,dmg:Math.max(1,Math.round(this.bulletDmg*w.dmg)),type:'mortar',
        aoe:w.aoe,knock:w.knock,t:0,ang:0,ty,hitSet:null,sc:this.pSize,r:(this.pSize-1)*6});
    }else{
      let n=wid==='homing'?2:1;
      if(this.pCount>1) n=Math.max(1,Math.round(n*this.pCount));   // 隐藏机体:空中多联装更多
      const txx=opp&&!opp.dead?opp.x:this.x+this.facing*120;
      const tyy=opp&&!opp.dead?opp.y-20*this.size:oy-20;
      for(let i=0;i<n;i++){
        const a=Math.atan2(tyy-oy,txx-ox)+(i-(n-1)/2)*0.4;
        bullets.push({x:ox,y:oy,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,
          own:this.id,team:this.team,dmg:Math.max(1,Math.round(this.bulletDmg*w.dmg)),type:wid,
          aoe:w.aoe||0,knock:w.knock||70,t:0,ang:a,turn:wid==='homing'?5.2:3.6,
          spd:w.speed,maxT:wid==='homing'?2.2:2.8,hitSet:null,sc:this.pSize,r:(this.pSize-1)*6});
      }
    }
    sparks(ox,oy,'#ffe27a',4,70);
    sfx.shoot();
    return true;
  }
  physics(dt,inp){
    this.x+=this.vx*dt;
    if(this.flying){                       // 飞行:无重力,上推/下压/悬浮
      if(inp&&inp.up) this.vy=-150;
      else if(inp&&inp.down) this.vy=110;
      else this.vy=Math.sin(T*5+this.id)*20;
      this.y+=this.vy*dt;
      if(this.y<44){ this.y=44; this.vy=0; }
      if(this.y>=GROUND){
        this.y=GROUND; this.flying=false;
        if(!this.onGround){ this.onGround=true; sparks(this.x,GROUND,'#6a7387',3,40); }
      }else this.onGround=false;
      return;
    }
    this.vy+=GRAV*dt; this.y+=this.vy*dt;
    if(this.y>=GROUND){
      this.y=GROUND; this.vy=0;
      if(!this.onGround){
        this.onGround=true; sparks(this.x,GROUND,'#6a7387',3,40);
      }
    }
    else this.onGround=false;
  }
  /* 技能连射:无视武器/冷却直接出弹(技能免能耗能),ySpread 上下分层 */
  volley(opp,wid,n,arc,dmgMul=1,ySpread=0){
    const w=WEAPONS[wid];
    if(this.pCount>1) n=Math.max(1,Math.round(n*this.pCount));   // 隐藏机体:齐射数量提升
    const ox=this.x+this.facing*29*this.size, oyc=this.y-24*this.size;
    for(let i=0;i<n;i++){
      const ang=(this.flying&&opp&&!opp.dead?lockAngle(this,opp):(this.facing>0?0:Math.PI))+(i-(n-1)/2)*arc;
      const oy=oyc+(n>1&&ySpread?((i%2?1:-1)*ySpread):0);
      bullets.push({ x:ox, y:oy, baseY:oy,
        vx:Math.cos(ang)*w.speed, vy:Math.sin(ang)*w.speed,
        own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*w.dmg*dmgMul)),
        type:wid, aoe:w.aoe||0, pierce:!!w.pierce, wave:w.wave?0:undefined,
        t:0, ang, knock:w.knock||60, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6 });
    }
    sparks(ox,oyc,wid==='laser'?'#5ff2ff':(wid==='arc'?'#64f0c8':'#ffe27a'),7,95); this.muzzleT=0.09; sfx.shoot();
  }
  /* 技能施放:slot='nJ'/'fJ'/'bJ'/'nK'/'fK'/'bK' → ch.skills 映射技能 id,成功返回 true */
  castSkill(slot,opp){
    const id=this.ch.skills&&this.ch.skills[slot], sk=SKILLS[id];
    if(!sk) return false;
    sfx.cast();                                   // 统一的技能施放音
    if(SKILL_SFX[id]) sfx[SKILL_SFX[id]]();       // 按技能类型叠加专属音色
    switch(id){
      case 'dash': this.dashT=0.18; this.dashHit=false; this.dashDir=1; this.dashSpd=520; this.dashDmgMul=1.35; this.dashKb=150;
        for(let i=0;i<9;i++) particles.push({x:this.x-this.facing*rnd(0,12),y:this.y-rnd(6,38),vx:-this.facing*rnd(50,150),vy:rnd(-35,35),life:0.28,max:0.28,col:this.pal.saber,sz:ri(1,2),g:0});
        sfx.swing(); break;
      case 'shadowdash': this.dashT=0.2; this.dashHit=false; this.dashDir=1; this.dashSpd=560; this.dashDmgMul=1.5; this.dashKb=170;
        for(let i=0;i<12;i++) particles.push({x:this.x-this.facing*rnd(0,16),y:this.y-rnd(4,40),vx:-this.facing*rnd(60,180),vy:rnd(-40,40),life:0.32,max:0.32,col:i%2?this.pal.saber:this.pal.dark,sz:ri(1,2),g:0});
        sfx.swing(); break;
      case 'shieldbash': this.dashT=0.22; this.dashHit=false; this.dashDir=1; this.dashSpd=460; this.dashDmgMul=1.1; this.dashKb=230;
        sparks(this.x+this.facing*14,this.y-22,'#9adcff',12,110); sfx.guard(); sfx.swing(); break;
      case 'trample': this.dashT=0.3; this.dashHit=false; this.dashDir=1; this.dashSpd=400; this.dashDmgMul=1.6; this.dashKb=210;
        game.shake=Math.max(game.shake,5);
        for(let i=0;i<16;i++) particles.push({x:this.x+rnd(-14,14),y:GROUND-rnd(0,10),vx:rnd(-160,160),vy:rnd(-90,-10),life:0.4,max:0.4,col:i%2?'#caa06a':'#8a94a8',sz:ri(1,3),g:220});
        sfx.boom(); break;
      case 'tumble': this.dashT=0.16; this.dashHit=true; this.dashDir=-1; this.dashSpd=560; this.dashDmgMul=0; this.dashKb=0; this.speedBoostT=2.5;
        for(let i=0;i<8;i++) particles.push({x:this.x-this.facing*rnd(0,10),y:this.y-rnd(2,30),vx:this.facing*rnd(30,110),vy:rnd(-40,20),life:0.26,max:0.26,col:'#cfe6ff',sz:1,g:0});
        sfx.jump(); break;
      case 'triple': this.burstN=3; this.burstGap=0; this.burstGap0=0.14;
        sparks(this.x+this.facing*13,this.y-20,'#ffe27a',6,80); sfx.shoot(); break;
      /* 火箭齐射:一次齐射 6 枚火箭弹(不耗能) */
      case 'rocketsalvo': this.volley(opp,'rocket',6,0.17,0.44); break;
      case 'blinkF': case 'blinkB': {
        const d=id==='blinkB'?-1:1;
        for(let i=0;i<6;i++) particles.push({x:this.x-d*this.facing*i*6,y:this.y-22,vx:0,vy:0,life:0.3,max:0.3,col:this.pal.light,sz:2,g:0});
        this.x=clamp(this.x+d*this.facing*70,16,W-16); sfx.jump(); break; }
      case 'fortify': this.fortifyT=3; sparks(this.x,this.y-20,'#9adcff',10,80); sfx.guard(); break;
      case 'vulcan': this.siegeT=2.8; this.siege=true; this.vx=0;
        sparks(this.x,this.y-6,'#d8ff5e',10,70); sfx.round(); break;
      case 'overcharge': this.overT=4.5;
        for(let i=0;i<16;i++) particles.push({x:this.x+rnd(-16,16),y:this.y-rnd(0,34),vx:rnd(-40,40),vy:rnd(-150,-60),life:0.5,max:0.5,col:i%2?'#ff8c2a':'#ffd166',sz:ri(1,3),g:-60});
        sfx.round(); break;
      case 'cloak': this.cloakT=2.5; this.cloakAtk=true;
        for(let i=0;i<14;i++) particles.push({x:this.x+rnd(-18,18),y:this.y-rnd(2,36),vx:rnd(-30,30),vy:rnd(-50,-10),life:0.45,max:0.45,col:'#b0f0ff',sz:1,g:-20});
        sfx.ui(); break;
      /* 多发迫击炮:一次抛射 5 枚,抛物线弹道散落目标区域(复用空中迫击炮弹道参数) */
      case 'mortarBarrage': {
        const base=clamp(opp&&!opp.dead?opp.x:this.x+this.facing*160,20,W-20);
        const grav=560, n=Math.max(1,Math.round(5*this.pCount));
        for(let i=0;i<n;i++){
          const txx=clamp(base+rnd(-58,58),20,W-20);
          const T2=rnd(0.78,1.0);
          const oy=this.y-30*this.size-rnd(0,8);
          bullets.push({ x:this.x+rnd(-6,6), y:oy, vx:(txx-this.x)/T2,
            vy:((GROUND-6-oy)-0.5*grav*T2*T2)/T2, grav,
            own:this.id, team:this.team,
            dmg:Math.max(1,Math.round(this.bulletDmg*WEAPONS.mortar.dmg*0.70)),
            type:'mortar', aoe:WEAPONS.mortar.aoe, knock:WEAPONS.mortar.knock,
            t:0, ang:0, ty:GROUND-6, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6 });
        }
        this.muzzleT=0.14;
        for(let i=0;i<12;i++) particles.push({x:this.x+rnd(-12,12),y:this.y-28*this.size,vx:rnd(-70,70),vy:rnd(-120,-30),life:0.4,max:0.4,col:i%2?'#ff9a4d':'#8a94a8',sz:ri(1,2),g:160});
        sfx.shoot(); break; }
      case 'burst': this.energy=100; this.burstT=3; sparks(this.x,this.y-24,'#ffd6f0',12,90); sfx.round(); break;
      case 'spin': this.spinT=0.4; this.spinHit=false;
        for(let i=0;i<12;i++) particles.push({x:this.x+Math.cos(i/12*6.28)*20,y:this.y-22+Math.sin(i/12*6.28)*20,vx:Math.cos(i/12*6.28)*90,vy:Math.sin(i/12*6.28)*90,life:0.3,max:0.3,col:this.pal.saber,sz:ri(1,2),g:0});
        sfx.swing(); break;
      case 'roar': this.roarT=2.5; game.shake=Math.max(game.shake,5); sfx.boom();
        for(let i=0;i<14;i++) particles.push({x:this.x+rnd(-20,20),y:this.y-rnd(0,30),vx:rnd(-90,90),vy:rnd(-60,10),life:0.35,max:0.35,col:'#ffb066',sz:2,g:120});
        for(const e of game.enemiesOf(this)){
          if(Math.abs(e.x-this.x)<95&&Math.abs(e.y-this.y)<50){
            hitMech(e,8,(Math.sign(e.x-this.x)||this.facing)*240,true); e.vy=-140;
          }
        } break;
      case 'leapblast': this.vy=-250; this.onGround=false;
        this.dashT=0.2; this.dashHit=true; this.dashDir=-1; this.dashSpd=300; this.dashDmgMul=0; this.dashKb=0;
        this.volley(opp,this.weapon,3,0.18,1.1); break;
      case 'twinlaser': this.volley(opp,'laser',2,0.06,1.15,7); break;
      case 'arcburst': this.volley(opp,'arc',6,0.18,0.58); break;
      /* 多联装追踪导弹:一次齐射 8 枚追踪弹(不耗能) */
      case 'missileSalvo': {
        const n=Math.max(1,Math.round(8*this.pCount)), spd=WEAPONS.homing.speed*0.92;
        for(let i=0;i<n;i++){
          const a=-Math.PI/2+(i-(n-1)/2)*0.34;
          bullets.push({ x:this.x+(i-(n-1)/2)*7, y:this.y-24*this.size,
            vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
            own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*0.43)),
            type:'homing', aoe:0, knock:70, t:0, ang:a,
            turn:5.0, spd:245, maxT:2.8, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6 });
        }
        this.muzzleT=0.1;
        for(let i=0;i<10;i++) particles.push({x:this.x+rnd(-10,10),y:this.y-20*this.size,vx:rnd(-60,60),vy:rnd(-100,-30),life:0.35,max:0.35,col:'#7df9ff',sz:ri(1,2),g:150});
        sfx.shoot(); break; }
      /* 多联装火箭弹:扇形连射 6 枚火箭弹 */
      case 'rocketBarrage': this.volley(opp,'rocket',6,0.2,0.48,6); break;
      case 'shadow':
        if(opp&&!opp.dead){
          this.x=clamp(opp.x-opp.facing*26,16,W-16); this.facing=opp.facing;
          this.atkDur=this.mw.atkT; this.atkT=this.atkDur; this.atkCd=this.mw.cd*0.8; this.hitDone=false;
        }
        sfx.swing(); break;
      case 'eshield': this.shieldT=2; sparks(this.x,this.y-22,'#ffffff',8,60); sfx.guard(); break;
      case 'judgement': {                    // 天罚审判:周身环形激光弹幕
        const n=Math.max(1,Math.round(8*this.pCount)), spd=WEAPONS.laser.speed*0.6;
        for(let i=0;i<n;i++){
          const a=i/n*Math.PI*2;
          bullets.push({ x:this.x, y:this.y-22*this.size,
            vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
            own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.32)),
            type:'laser', aoe:0, pierce:true, t:0, ang:a, knock:50, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6 });
        }
        game.shake=Math.max(game.shake,6); sfx.round();
        for(let i=0;i<22;i++) particles.push({x:this.x+rnd(-20,20),y:this.y-22*this.size+rnd(-20,20),vx:rnd(-140,140),vy:rnd(-140,140),life:0.45,max:0.45,col:'#ffe27a',sz:2,g:0});
        break; }
      case 'oblivion': {                     // 湮灭冲击:大范围 AoE + 击飞
        const R=Math.round(95*this.pSize), dmg=Math.round(this.bulletDmg*1.25);
        game.shake=Math.max(game.shake,9); sfx.boom();
        for(let i=0;i<30;i++) particles.push({x:this.x+rnd(-40,40),y:this.y-rnd(0,40),vx:rnd(-230,230),vy:rnd(-230,60),life:0.5,max:0.5,col:i%2?'#ff3b5b':'#ffd166',sz:ri(2,3),g:120});
        for(const e of game.enemiesOf(this)){
          if(Math.abs(e.x-this.x)<R && Math.abs(e.y-this.y)<90){
            hitMech(e,dmg,(Math.sign(e.x-this.x)||this.facing)*280,true); e.vy=-180;
          }
        }
        break; }
      case 'hellfire': {                     // 地狱火导弹:原地垂直齐射 6 枚,划弧追踪爆炸
        const n=6, spd=WEAPONS.homing.speed*0.9;
        for(let i=0;i<n;i++){
          const a=-Math.PI/2+(i-(n-1)/2)*0.30;
          bullets.push({ x:this.x+(i-(n-1)/2)*9, y:this.y-26*this.size,
            vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
            own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*0.575)),
            type:'hellfire', aoe:30, knock:130, t:0, ang:a,
            turn:4.6, spd:235, maxT:3.2, hitSet:null });
        }
        this.muzzleT=0.12;
        for(let i=0;i<14;i++) particles.push({x:this.x+rnd(-10,10),y:this.y-20*this.size,vx:rnd(-70,70),vy:rnd(-120,-30),life:0.4,max:0.4,col:i%2?'#ff8c2a':'#ffd166',sz:ri(1,2),g:160});
        sfx.shoot(); break; }
      case 'incendiary': {                   // 凝固燃烧弹:一次抛射 3 枚,散落目标附近形成连片火海
        const base=clamp(opp&&!opp.dead?opp.x:this.x+this.facing*150,20,W-20);
        const oy=this.y-30*this.size, grav=520;
        for(let i=0;i<3;i++){
          const txx=clamp(base+rnd(-46,46),20,W-20);
          const T2=rnd(0.8,1.0);
          bullets.push({ x:this.x+(i-1)*6, y:oy, vx:(txx-this.x)/T2,
            vy:((GROUND-6-oy)-0.5*grav*T2*T2)/T2, grav,
            own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*0.8)),
            type:'incendiary', aoe:30, knock:70, t:0, ang:0, ty:GROUND-6, hitSet:null });
        }
        this.muzzleT=0.12; sfx.shoot();
        for(let i=0;i<10;i++) particles.push({x:this.x+rnd(-8,8),y:oy+rnd(-4,4),vx:rnd(-70,70),vy:rnd(-90,-20),life:0.34,max:0.34,col:i%2?'#ff7a2a':'#ffd166',sz:ri(1,2),g:180});
        break; }
      case 'drone': {                        // 浮游炮:召唤 10 秒自主浮游炮(隐藏机体可召唤多架)
        const cnt=Math.max(1,Math.round(this.pCount));
        for(let i=0;i<cnt;i++){
          drones.push({ x:this.x-this.facing*22+(i-(cnt-1)/2)*18, y:this.y-46*this.size-(i%2?9:0),
            team:this.team, own:this.id, t:10, cd:0.5+i*0.2, hover:rnd(0,6.28), ang:Math.PI/2, sz:this.pSize,
            dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.85)) });
        }
        sparks(this.x,this.y-40*this.size,'#7de3ff',12,90); sfx.round(); break; }
      case 'drone3': {                        // 三连装浮游炮:召唤 3 架无人机,3 连发点射(每轮随机 1~2s 冷却)
        for(let i=0;i<3;i++){
          drones.push({ x:this.x-this.facing*22+ (i-1)*16, y:this.y-46*this.size-(i===1?10:0),
            team:this.team, own:this.id, t:10, cd:rnd(0.2,0.8), hover:rnd(0,6.28), ang:Math.PI/2, sz:this.pSize,
            kind:'tri', off:(i-1)*30, offY:(i-1)*14, burst:0, burstT:0,
            dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.3)) });
        }
        sparks(this.x,this.y-40*this.size,'#7df9ff',14,90); sfx.round(); break; }
      case 'cover': {                         // 部署掩体:身前展开固定 HP 掩体,仅拦敌方弹药
        const cw=16, cpHP=70+Math.round(this.maxHp*0.15);
        const cx=clamp(this.x+this.facing*(22+cw/2),20,W-20);
        covers.push({ x:cx, y:GROUND, team:this.team, own:this.id,
          hp:cpHP, max:cpHP, t:12, w:cw, h:46 });
        sparks(cx,GROUND-24,'#9adcff',12,80); sfx.guard(); break; }
      case 'healDrone':                       // 修复无人机:跟随自身 8 秒,每 1s 充能回血
        drones.push({ x:this.x-this.facing*26, y:this.y-54*this.size, team:this.team, own:this.id,
          t:8, cd:1, hover:rnd(0,6.28), kind:'heal', heal:Math.max(4,Math.round(6+this.maxHp*0.03)) });
        sparks(this.x,this.y-48*this.size,'#8fffc0',12,90); sfx.round(); break;
      case 'lightning': {                     // 雷击锁定:锁定最近敌人,3 秒内每 0.2s 落雷(不硬直)
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const dd=Math.abs(e.x-this.x); if(dd<bd){bd=dd;tgt=e;} }
        if(!tgt) return false;                // 无目标:不进入冷却
        lightnings.push({ own:this.id, team:this.team, tgt:tgt.id, t:3, gap:0.2,
          dmg:Math.max(2,Math.round(this.bulletDmg*0.30)) });
        sparks(this.x,this.y-30*this.size,'#c9a6ff',10,80); sfx.round(); break; }
      case 'iceball':                         // 寒冰球:缓慢前飞,阻挡敌弹并对接触敌人造成伤害
        iceballs.push({ x:this.x+this.facing*24*this.size, y:this.y-24*this.size,
          vx:this.facing*46, vy:0, own:this.id, team:this.team, r:Math.round(15*this.pSize), hp:40, t:7,
          dmg:Math.max(3,Math.round(this.bulletDmg*1.45)) });
        sparks(this.x+this.facing*24*this.size,this.y-24*this.size,'#9fe8ff',12,80);
        sfx.shoot(); break;
      case 'emorb': {                         // 电磁球:向前放出 4 颗缓慢前飘的电磁球,拦弹+磁力干扰减速
        const n=Math.max(1,Math.round(4*this.pCount));
        for(let i=0;i<n;i++){
          emorbs.push({ x:this.x+this.facing*(20+i*7)*this.size, y:this.y-24*this.size-i*13,
            vx:this.facing*42, vy:0, own:this.id, team:this.team,
            r:Math.round(9*this.pSize), hp:Math.max(12,Math.round(26*this.pSize)), t:8,
            ph:rnd(0,6.28), dmg:Math.max(2,Math.round(this.bulletDmg*0.55)), hitSet:null });
        }
        sparks(this.x,this.y-28*this.size,'#b18cff',12,80); sfx.round(); break; }
    }
    this.cds[id]=sk.cd;                     // 施放成功才进入冷却
    return true;
  }
  updateHud(dt){
    this.chipHp=Math.max(this.hp,this.chipHp-26*dt);
  }
}

/* 像素绘制:机甲由矩形部件拼装,1 单位 = 1 像素 */
function drawMech(m){
  const c=m.pal, t=T;
  g.save();
  g.translate(Math.round(m.x),Math.round(m.y));
  const sz=m.size||1;                       // 体型缩放(绘制/碰撞/斩击范围同步)
  g.scale(m.facing*sz,sz);
  const P=(x,y,w,h,col)=>{ g.fillStyle=(m.flash>0)?'#ffffff':col; g.fillRect(x,y,w,h); };
  if(m.dead){ drawWreck(P,c); g.restore(); return; }

  if(m.siege){                            // 火神炮/机炮形态:坐地炮台 + 蓄光呼吸
    const gl=0.20+0.12*Math.sin(t*9)+(m.muzzleT>0?0.15:0);
    g.globalAlpha=gl; g.fillStyle=c.visor;
    g.beginPath(); g.arc(0,-16,30,0,Math.PI*2); g.fill();
    g.globalAlpha=Math.min(0.8,gl*1.6);
    g.beginPath(); g.arc(0,-16,19,0,Math.PI*2); g.fill();
    g.globalAlpha=1;
    const rec=m.muzzleT>0?2:0;            // 开火后坐
    P(-13,-6,9,6,c.dark); P(4,-6,9,6,c.dark);            // 展开支撑腿
    P(-11,-3,22,3,c.joint);                              // 底盘
    P(-9,-20,18,14,c.main);                              // 低矮躯干
    P(1,-18,8,9,c.light);                                // 胸甲
    P(-6,-16,5,1,c.dark); P(-6,-13,5,1,c.dark);          // 散热格栅
    P(-3,-27,11,7,c.joint); P(3,-25,5,2,c.visor);        // 头部+目镜
    P(7,-20,3,7,c.main);                                 // 肩部
    P(9,-19+rec,17,5,c.gun); P(24,-21+rec,3,9,c.gun);    // 机炮身管+制退器
    if(m.muzzleT>0){ P(27,-20+rec,7,7,'#fff2c0'); P(33,-19+rec,4,5,'#ffd166'); }
    g.restore(); return;
  }

  // 待机呼吸(2 帧) / 行走摆腿
  let bob = (m.onGround && m.atkT<=0) ? (Math.sin(t*5+m.id*2)>0?0:1) : 0;
  if(m.guarding) bob=2;
  const swing = (m.onGround&&m.moving) ? Math.round(Math.sin(m.walkT)*3) : 0;

  if(m.onGround){
    P(-7-swing,-13+bob,5,13,c.dark);  P(-8-swing,-2+bob,7,2,c.joint);   // 后腿+脚
    P( 2+swing,-13+bob,5,13,c.main);  P( 1+swing,-2+bob,7,2,c.joint);   // 前腿+脚
  }else{
    P(-7,-9,5,9,c.dark);  P(-8,-2,7,2,c.joint);                         // 收腿
    P( 2,-7,5,7,c.main);  P( 1,-2,7,2,c.joint);
    const fh=3+((t*30|0)%4);                                            // 跳跃喷焰
    P(-3,0,6,fh,(t*20%2<1)?'#ffd166':'#ff8c42'); P(-1,fh,2,2,'#fff2c0');
  }
  P(-8,-17+bob,16,5,c.dark);                                            // 腰胯
  P(-9,-30+bob,18,13,c.main);                                           // 躯干
  P(1,-28+bob,8,9,c.light);                                             // 胸甲
  P(-6,-26+bob,5,1,c.dark); P(-6,-23+bob,5,1,c.dark); P(-6,-20+bob,5,1,c.dark); // 散热格栅
  P(-2,-18+bob,6,1,c.visor);                                            // 腰部指示灯
  P(7,-31+bob,6,7,c.joint); P(8,-30+bob,4,5,c.light);                   // 前肩甲
  P(-4,-38+bob,12,8,c.joint);                                           // 头盔
  P(2,-36+bob,6,3,c.visor);                                             // 目镜
  P(-3,-42+bob,1,4,c.dark); P(-3,-43+bob,1,1,c.visor);                  // 天线

  // 后臂(持近战兵装,攻击时挥出):不同机师使用匕首/长枪/战锤/大剑/光刃,造型与弧线各异
  P(-13,-29+bob,5,9,c.dark);
  const wep=m.meleeW||'saber';
  if(m.atkT>0){
    const p=1-m.atkT/(m.atkDur||ATK_TIME);
    const ang=-1.9+p*2.6;
    const drawWep=(alpha,off)=>{
      g.globalAlpha=alpha; g.save();
      g.translate(-11,-27+bob); g.rotate(ang+off);
      if(wep==='dagger'){                      // 匕首:短刃急刺
        g.fillStyle=c.joint; g.fillRect(-3,-1,5,2);
        g.fillStyle=c.saber||'#dfe6f2'; g.fillRect(2,-1,10,2);
        g.fillStyle='#ffffff'; g.fillRect(2,0,10,1);
      }else if(wep==='spear'){                 // 长枪:长杆+枪尖(直刺)
        g.fillStyle='#6a5a44'; g.fillRect(-6,-1,34,3);
        g.fillStyle=c.joint; g.fillRect(-4,-2,6,4);
        g.fillStyle=c.light; g.beginPath(); g.moveTo(28,-3); g.lineTo(38,0); g.lineTo(28,3); g.closePath(); g.fill();
      }else if(wep==='hammer'){                // 战锤:短柄+重型锤头
        g.fillStyle='#5a4a34'; g.fillRect(-3,-1,16,3);
        g.fillStyle=c.dark; g.fillRect(13,-6,9,12);
        g.fillStyle=c.light; g.fillRect(13,-6,9,3);
        g.fillStyle=c.joint; g.fillRect(13,3,9,3);
      }else if(wep==='greatsword'){            // 大剑:宽厚巨刃
        g.fillStyle=c.joint; g.fillRect(-3,-2,6,4);
        g.fillStyle=c.light; g.fillRect(3,-3,30,6);
        g.fillStyle=c.saber; g.fillRect(3,-1,30,2);
        g.fillStyle='#ffffff'; g.fillRect(3,0,30,1);
      }else{                                    // 光刃(默认)
        g.fillStyle=c.joint; g.fillRect(-3,-1,5,2);
        g.fillStyle=c.saber; g.fillRect(2,-2,24,4);
        g.fillStyle='#ffffff'; g.fillRect(2,-1,24,2);
      }
      g.restore(); g.globalAlpha=1;
    };
    drawWep(0.35,-0.3); drawWep(1,0);
  }else{
    if(wep==='dagger'){ P(-14,-22+bob,3,5,c.joint); P(-15,-26+bob,2,4,c.light); }
    else if(wep==='spear'){ P(-19,-20+bob,14,3,'#6a5a44'); P(5,-21+bob,4,4,c.light); }
    else if(wep==='hammer'){ P(-16,-21+bob,3,7,'#5a4a34'); P(-19,-27+bob,8,7,c.dark); }
    else if(wep==='greatsword'){ P(-13,-22+bob,4,9,c.joint); P(-16,-32+bob,5,14,c.light); }
    else P(-14,-21+bob,3,4,c.joint);            // 光刃刀柄
  }
  // 前臂 + 步枪
  P(9,-27+bob,5,7,c.main);
  P(11,-25+bob,15,3,c.gun); P(16,-28+bob,2,3,c.gun); P(12,-22+bob,2,3,c.gun);
  if(m.muzzleT>0){
    P(26,-26+bob,6,5,'#fff2c0'); P(32,-25+bob,3,3,'#ffd166');
  }
  // 护盾
  if(m.guarding){
    P(11,-36+bob,5,27,c.light);
    P(11,-36+bob,5,2,c.dark); P(11,-11+bob,5,2,c.dark);
    P(13,-27+bob,2,6,c.visor);
    P(9,-27+bob,3,7,c.dark);
  }
  g.restore();
}
/* 损毁残骸 */
function drawWreck(P,c){
  P(-24,-4,7,2,c.gun);                                  // 掉落的枪
  P(-20,-6,15,6,c.dark);                                // 腿部
  P(-6,-11,16,11,c.main);                               // 躯干
  P(2,-13,7,2,c.light);
  P(10,-9,8,8,c.joint);                                 // 头
  P(13,-7,3,2,'#3a3f4a');                               // 熄灭的目镜
  P(-4,-3,12,3,'rgba(15,12,10,.6)');                    // 焦痕
}

/* 机体光环特效:能量护盾=圆形护罩 / 强化技能=火焰形光圈 */
function drawMechEffects(m){
  if(!m||m.dead) return;
  const sz=m.size||1;
  const cx=Math.round(m.x), cy=Math.round(m.y-22*sz);
  // 能量护盾:圆形护罩(脉动 + 六边形网格)
  if(m.shieldT>0){
    const r=Math.round(27*sz), a=clamp(m.shieldT/2,0,1), pulse=0.5+0.5*Math.sin(T*10);
    g.save();
    g.globalAlpha=(0.16+0.10*pulse)*a;
    g.fillStyle='#8fe6ff'; g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.fill();
    g.globalAlpha=0.9*a; g.strokeStyle='#cdefff'; g.lineWidth=2;
    g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.stroke();
    g.globalAlpha=0.45*a; g.strokeStyle='#7de3ff'; g.lineWidth=1;
    g.beginPath();
    for(let i=0;i<6;i++){ const an=T*0.7+i*Math.PI/3; const rx=cx+Math.cos(an)*r, ry=cy+Math.sin(an)*r;
      if(i===0) g.moveTo(rx,ry); else g.lineTo(rx,ry); }
    g.closePath(); g.stroke();
    g.restore();
  }
  // 强化技能:火焰形光圈(壁垒/过载/爆发/战吼/翻滚/攻城)
  if(m.fortifyT>0||m.overT>0||m.burstT>0||m.roarT>0||m.speedBoostT>0||m.siegeT>0){
    const baseR=Math.round(25*sz), flames=11;
    g.globalAlpha=0.22; g.fillStyle='#ff8c2a';
    g.beginPath(); g.arc(cx,cy,baseR,0,Math.PI*2); g.fill();
    for(let i=0;i<flames;i++){
      const an=(i/flames)*Math.PI*2 + T*2.4;
      const fr=baseR+3+Math.sin(T*12+i*1.7)*3;
      const fx=Math.round(cx+Math.cos(an)*fr), fy=Math.round(cy+Math.sin(an)*fr*0.85);
      const hh=3+2*Math.sin(T*14+i*2.1);
      g.globalAlpha=0.9; px(fx-1,Math.round(fy-hh),2,Math.round(hh+4),(i%2)?'#ff8c2a':'#ffd166');
      g.globalAlpha=0.65; px(fx,Math.round(fy-hh-2),1,3,'#fff2c0');
    }
    g.globalAlpha=1;
  }
}
