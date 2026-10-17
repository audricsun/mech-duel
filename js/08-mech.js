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
    this.markT=0;                            // 弱点标记(标记锁定):受创加重计时
    this.castSlowT=0;                        // 功能技施放代价:短暂降移速计时
    this.ult=0; this.ultLockT=0;             // 终结技能量 / 施放后禁止立刻回充
    this.ultT=0; this.ultKind=''; this.ultTick=0; this.ultDir=1;   // 持续型终结技状态
    this.orbitT=0; this.orbitAng=0; this.orbitCd={}; this.orbitUlt=false;   // 环绕战锤:持续时间/角度/逐敌命中冷却
    this.gbN=0; this.gbGap=0; this.gbX=0; this.gbDir=1;  // 连环地裂:剩余段数/间隔/推进坐标/方向
    // 技能与飞行状态
    this.cds={}; this.comboT=0; this.comboDir=0;                 // 技能冷却表 + 防御输入窗口
    this.siege=false; this.siegeT=0; this.overT=0; this.cloakT=0; this.cloakAtk=false;
    this.fortifyT=0; this.burstT=0; this.shieldT=0; this.roarT=0; this.speedBoostT=0;
    this.dashT=0; this.dashHit=false; this.spinT=0; this.spinHit=false;
    this.dashDir=1; this.dashSpd=520; this.dashDmgMul=1.2; this.dashKb=150;
    this.dashSlow=0; this.dashMark=0; this.dashAoe=0;   // 通用冲刺附带效果
    this.dashSkill=null; this.spinSkill=null; this.orbitSkill=null; this.gbSkill=null;   // 伤害归属:当前动作来源技能
    this.tapDashT=0; this.tapDashCd=0; this.tapDashDir=0; this.tapDashSpd=0;   // 双击方向冲刺
    this.lastTapDir=0; this.lastTapT=-9;
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
    this.markT=Math.max(0,this.markT-dt);
    this.castSlowT=Math.max(0,this.castSlowT-dt);
    this.ultLockT=Math.max(0,this.ultLockT-dt);
    this.orbitT=Math.max(0,this.orbitT-dt);
    this.tapDashT=Math.max(0,this.tapDashT-dt);
    this.tapDashCd=Math.max(0,this.tapDashCd-dt);
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
    if(this.ultT>0) this.updateUlt(dt,opp);   // 持续型终结技
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
    // 终结技:能量满后 J+K 施放(优先于普通攻击/技能)
    let justUlt=false;
    if(inp.ult && this.ult>=ULT_MAX && this.stunT<=0 && game.state==='fight'){
      justUlt=this.castUltimate(opp);
    }
    // 技能输入窗口:按下防御瞬间开启 0.5s,窗口内 方向(无/前/后)+斩/射 组合施放技能槽
    if(inp.downEdge){ this.comboT=0.5; this.comboDir=0; }
    let justCast=false;
    if(!justUlt && this.comboT>0 && this.stunT<=0 && (inp.atk||inp.shoot)){
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
    // 双击方向冲刺:双击面朝方向=前冲,双击反方向=后冲;按住方向持续,松开即止
    if(this.tapDashT<=0 && this.tapDashCd<=0 && this.onGround && !this.siege && !this.guarding &&
       this.stunT<=0 && this.atkT<=0 && this.dashT<=0){
      const tapDir=inp.rightEdge?1:(inp.leftEdge?-1:0);
      if(tapDir){
        if(this.lastTapDir===tapDir && T-this.lastTapT<0.28){
          this.tapDashT=0.22; this.tapDashDir=tapDir;
          this.tapDashSpd=(tapDir===this.facing?380:320);   // 前冲略快,后撤略慢
          this.tapDashCd=0.42; this.lastTapDir=0; this.lastTapT=-9;
          sfx.dash();
          for(let i=0;i<8;i++) particles.push({x:this.x-tapDir*rnd(2,12),y:this.y-rnd(2,38),
            vx:-tapDir*rnd(40,130),vy:rnd(-35,35),life:0.26,max:0.26,col:i%2?this.pal.light:'#cfe6ff',sz:ri(1,2),g:0});
        }else{ this.lastTapDir=tapDir; this.lastTapT=T; }
      }
    }
    if(this.stunT>0){                    // 受击硬直:击退滑行 + 摩擦
      this.vx*=Math.max(0,1-4*dt);
    }else if(this.guarding){
      this.vx=0;
    }else if(this.tapDashT>0){            // 方向冲刺:松开方向键立即结束
      const held=this.tapDashDir<0?inp.left:inp.right;
      if(!held){ this.tapDashT=0; this.vx=0; }
      else{
        this.moving=true; this.vx=this.tapDashDir*this.tapDashSpd;
        if(Math.random()<0.7) particles.push({x:this.x-this.tapDashDir*rnd(2,10),y:this.y-rnd(2,36),
          vx:-this.tapDashDir*rnd(20,70),vy:rnd(-20,20),life:0.2,max:0.2,col:this.pal.light,sz:1,g:0});
      }
    }else{
      this.moving=false;
      const spdMul=(this.speedBoostT>0?1.5:1)*(this.slowT>0?0.55:1)*(this.castSlowT>0?0.6:1);   // 战术翻滚增益 / 寒冰减速 / 功能技施放代价
      if(this.siege){ this.vx=0; }                    // 机炮形态:定身炮塔
      else if(inp.left){ this.vx=-this.spd*spdMul; this.moving=true; }
      else if(inp.right){ this.vx=this.spd*spdMul; this.moving=true; }
      else this.vx=0;
      if(this.moving) this.walkT+=dt*11;
      if(inp.jump && this.onGround && !this.siege){ this.vy=-this.jumpV; this.onGround=false; sfx.jump(); }
      if(inp.atk && !justCast && !justUlt && this.atkCd<=0 && (this.onGround||this.flying) && !this.siege){
        this.atkDur=this.mw.atkT; this.atkT=this.atkDur; this.atkCd=this.mw.cd; this.hitDone=false; sfx.swing();
      }
      if(inp.shoot && !justCast && !justUlt){
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
        this.dashHit=true;
        const dmg=Math.round(MELEE_DMG*this.dashDmgMul*this.atkMul*this.mw.dmg*roleMeleeMul(this));
        hitMech(opp,dmg,this.facing*this.dashKb,true,false,this,this.dashSkill);
        if(this.dashSlow) opp.slowT=Math.max(opp.slowT||0,this.dashSlow);
        if(this.dashMark) opp.markT=Math.max(opp.markT||0,this.dashMark);
        if(this.dashAoe){
          for(const e of game.enemiesOf(this)){
            if(e===opp||e.dead) continue;
            if(Math.abs(e.x-this.x)<this.dashAoe+10*e.size&&Math.abs(e.y-this.y)<50){
              hitMech(e,Math.max(2,Math.round(dmg*0.6)),this.facing*120,true,false,this,this.dashSkill); e.vy=-120;
            }
          }
          game.shake=Math.max(game.shake,5);
        }
      }
    }
    // 回旋斩:旋转光剑周身一次判定
    if(this.spinT>0){
      particles.push({x:this.x+rnd(-26,26),y:this.y-rnd(6,34),vx:0,vy:0,life:0.12,max:0.12,col:this.pal.saber,sz:2,g:0});
      if(!this.spinHit&&opp&&!opp.dead&&Math.abs(opp.x-this.x)<36&&Math.abs(opp.y-this.y)<40){
        this.spinHit=true; hitMech(opp,Math.round(MELEE_DMG*1.25*this.atkMul*this.mw.dmg*roleMeleeMul(this)),(Math.sign(opp.x-this.x)||1)*130,true,false,this,this.spinSkill);
      }
    }
    // 环绕战锤:能量战锤绕身高速旋转,触及敌人即重击(逐敌 0.4s 命中冷却)
    if(this.orbitT>0){
      const ult=this.orbitUlt, hammers=ult?2:1, R=Math.round((ult?72:34)*this.size);
      this.orbitAng+=dt*(ult?10:7.5);
      for(const k in this.orbitCd) if(this.orbitCd[k]>0) this.orbitCd[k]=Math.max(0,this.orbitCd[k]-dt);
      for(let h=0;h<hammers;h++){
        const a=this.orbitAng+h*Math.PI;
        const hx=this.x+Math.cos(a)*R, hy=this.y-20*this.size+Math.sin(a)*R;
        for(const e of game.enemiesOf(this)){
          if(e.dead) continue;
          if(Math.hypot(e.x-hx,(e.y-20*e.size)-hy)<15*e.size+(ult?14:9) && (this.orbitCd[e.id]||0)<=0){
            this.orbitCd[e.id]=ult?0.32:0.4;
            hitMech(e,Math.round(MELEE_DMG*(ult?1.35:0.7)*this.atkMul*this.mw.dmg*roleMeleeMul(this)),(Math.sign(e.x-this.x)||this.facing)*(ult?280:200),true,false,this,this.orbitSkill);
            e.vy=Math.min(e.vy,ult?-140:-95); game.shake=Math.max(game.shake,ult?5:3);
          }
        }
      }
    }
    // 连环地裂:向前逐段引爆地面,每段对接触敌人造成伤害并挑空
    if(this.gbN>0){
      this.gbGap-=dt;
      if(this.gbGap<=0){
        this.gbGap=0.13;
        const bx=clamp(this.gbX,20,W-20);
        blasts.push({x:bx,y:GROUND,t:0.42,max:0.42,r:26,col:'#ff9a4d'});
        game.shake=Math.max(game.shake,3); sfx.boom();
        for(const e of game.enemiesOf(this)){
          if(e.dead) continue;
          if(Math.abs(e.x-bx)<30 && e.y>GROUND-130){
            hitMech(e,Math.max(2,Math.round(this.bulletDmg*0.45)),this.gbDir*90,false,false,this,this.gbSkill);
            e.vy=Math.min(e.vy,-125);
          }
        }
        for(let i=0;i<10;i++) particles.push({x:bx+rnd(-16,16),y:GROUND-rnd(0,10),vx:rnd(-150,150),vy:rnd(-180,-40),life:0.45,max:0.45,col:i%2?'#caa06a':'#8a94a8',sz:ri(1,3),g:250});
        this.gbX+=this.gbDir*30; this.gbN--;
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
    const sk=this.siege?'vulcan':(this.burstN>0?'triple':this._castId);   // 弹道皮肤:机炮/三连/本次施放技能
    let dmgMul=1;
    if(this.cloakAtk){ dmgMul=1.8; this.cloakAtk=false; this.cloakT=0; }  // 破隐一击
    for(let i=0;i<fan;i++){
      const a=ang+(i-(fan-1)/2)*fanArc;
      bullets.push({ x:ox, y:oy, baseY:oy,
        vx:Math.cos(a)*w.speed, vy:Math.sin(a)*w.speed,
        own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*w.dmg*dmgMul)),
        type:wid, aoe:w.aoe||0, pierce:!!w.pierce, wave:w.wave?0:undefined,
        t:0, ang:a, knock:w.knock||60, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6, sk });
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
        t:0, ang, knock:w.knock||60, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6, sk:this._castId });
    }
    sparks(ox,oyc,wid==='laser'?'#5ff2ff':(wid==='arc'?'#64f0c8':'#ffe27a'),7,95); this.muzzleT=0.09; sfx.shoot();
  }
  addUlt(v){ if(this.dead||this.ultLockT>0) return; this.ult=Math.min(ULT_MAX,this.ult+v); }
  /* 终结技:能量满后 J+K 施放;每个机体唯一,强度远高于普通技能 */
  ultAoe(cx,cy,r,dmg,kb){
    for(const e of game.enemiesOf(this)){
      if(e.dead) continue;
      if(Math.hypot(e.x-cx,(e.y-20*e.size)-cy)<r+10*e.size){
        hitMech(e,dmg,(Math.sign(e.x-cx)||this.facing)*kb,false,false,this);
        e.vy=Math.min(e.vy,-170);
      }
    }
    for(let i=0;i<18;i++) particles.push({x:cx+rnd(-r*0.5,r*0.5),y:cy+rnd(-r*0.4,r*0.4),vx:rnd(-180,180),vy:rnd(-220,-40),life:rnd(0.35,0.6),max:0.6,col:i%2?'#ffe27a':'#ff9a4d',sz:ri(1,3),g:160});
  }
  /* 终结技:强化角色招牌技能,消耗全部能量。持续型终结技走 updateUlt。 */
  castUltimate(opp){
    const id=this.ch.ult, u=ULTIMATES[id];
    if(!u) return false;
    const _d0=drones.length, _z0=fireZones.length, _l0=lightnings.length, _b0=bullets.length, _e0=emorbs.length, _i0=iceballs.length;
    this._castId=id;
    this.ult=0; this.ultLockT=2.5; this.ultT=0; this.ultKind=''; this.ultTick=0;
    this.atkT=0; this.comboT=0;
    game.shake=Math.max(game.shake,8); sfx.cast(); sfx.round();
    const nearest=()=>{ let t=null,bd=1e9; for(const e of game.enemiesOf(this)){ if(e.dead) continue; const d=Math.abs(e.x-this.x); if(d<bd){bd=d;t=e;} } return t; };
    switch(id){
      case 'ultBarrage': {                    // 突击者:强化机械隼群
        for(let i=0;i<3;i++) drones.push({x:this.x+(i-1)*24,y:this.y-56*this.size,team:this.team,own:this.id,
          t:10,cd:0.15+i*0.08,hover:rnd(0,6.28),kind:'bird',ult:true,sz:this.pSize,wing:0,fireT:0,ang:0,
          dmg:Math.max(3,Math.round(this.bulletDmg*WEAPONS.laser.dmg*1.1))});
        break; }
      case 'ultEarthbreaker':                 // 重装兵:强化环绕战锤
        this.orbitT=5; this.orbitUlt=true; this.orbitSkill='ultEarthbreaker'; this.orbitAng=0; this.orbitCd={};
        this.fortifyT=Math.max(this.fortifyT,3); this.shieldT=Math.max(this.shieldT,0.4);
        for(const e of game.enemiesOf(this)){ if(Math.abs(e.x-this.x)<220){ e.vx=(Math.sign(this.x-e.x)||1)*420; e.vy=-80; } }
        this.ultAoe(this.x,this.y-20,120,Math.round(MELEE_DMG*2.0*this.atkMul*this.mw.dmg*roleMeleeMul(this)),280);
        break;
      case 'ultSonicStorm':                   // 疾风:强化音爆冲刺
        this.ultKind='sonic'; this.ultT=1.8; this.ultTick=0; this.ultDir=this.facing;
        this.shieldT=Math.max(this.shieldT,0.5); this.speedBoostT=Math.max(this.speedBoostT,3);
        break;
      case 'ultFortress':                     // 堡垒:强化盾击冲锋 + 要塞火力
        this.shieldT=Math.max(this.shieldT,3); this.fortifyT=Math.max(this.fortifyT,3);
        this.dashSkill='ultFortress'; this.dashT=0.4; this.dashHit=false; this.dashDir=1; this.dashSpd=620; this.dashDmgMul=1.8; this.dashKb=320; this.dashAoe=60;
        for(let i=0;i<3;i++) drones.push({x:this.x+(i-1)*24,y:this.y-58*this.size,team:this.team,own:this.id,
          t:8,cd:rnd(0.2,0.8),hover:rnd(0,6.28),kind:'tri',off:(i-1)*28,offY:(i-1)*12,burst:0,burstT:0,
          dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.45))});
        break;
      case 'ultDeadeye': {                    // 猎手:强化双束狙击
        const n=12, spd=WEAPONS.laser.speed;
        for(let i=0;i<n;i++){
          const off=i-(n-1)/2, ang=(this.facing>0?0:Math.PI)+off*0.035;
          bullets.push({x:this.x+this.facing*29*this.size,y:this.y-24*this.size+off*4,vx:Math.cos(ang)*spd,vy:off*8,
            own:this.id,team:this.team,dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.8)),
            type:'laser',aoe:0,pierce:true,t:0,ang,knock:80,hitSet:null,sc:this.pSize,r:(this.pSize-1)*6,sk:'ultDeadeye'});
        }
        const tgt=nearest(); if(tgt) tgt.markT=Math.max(tgt.markT||0,6);
        break; }
      case 'ultAssassinate': {                // 幽灵:强化光学迷彩
        const tgt=nearest();
        if(tgt){
          this.x=clamp(tgt.x-(tgt.facing||1)*28,16,W-16); this.facing=tgt.x>=this.x?1:-1;
          hitMech(tgt,Math.round(MELEE_DMG*4.2*this.atkMul*this.mw.dmg*roleMeleeMul(this)),this.facing*260,true,false,this);
          tgt.markT=Math.max(tgt.markT||0,6);
          fireZones.push({x:tgt.x,team:this.team,own:this.id,r:100,t:3,max:3,tick:0,tick0:0.4,dmg:6,kind:'void',slow:1.5});
        }
        this.cloakT=Math.max(this.cloakT,3); this.cloakAtk=true;
        break; }
      case 'ultCataclysm': {                  // 巨兽:强化地震波
        for(let i=0;i<7;i++){
          const dir=i%2?1:-1, off=Math.floor(i/2)*40;
          bullets.push({x:clamp(this.x+dir*off,16,W-16),y:GROUND-6,vx:dir*430,vy:0,
            own:this.id,team:this.team,dmg:Math.max(3,Math.round(this.bulletDmg*1.8)),
            type:'quake',aoe:0,pierce:true,t:0,ang:0,knock:180,hitSet:null,sk:'ultCataclysm'});
        }
        this.ultAoe(this.x,this.y-20,110,Math.round(this.bulletDmg*1.8),280);
        const ct=nearest(); if(ct) this.ultAoe(ct.x,GROUND-30,90,Math.round(this.bulletDmg*2.0),240);
        break; }
      case 'ultSupernova':                    // 新星:强化能量爆发
        this.ultKind='nova'; this.ultT=2.4; this.ultTick=0; this.energy=100; this.burstT=Math.max(this.burstT,5);
        this.shieldT=Math.max(this.shieldT,0.4); break;
      case 'ultSingularity': {                // 磁暴:强化磁力牵引
        const tgt=nearest(), cx=clamp(tgt?tgt.x:this.x+this.facing*120,30,W-30);
        fireZones.push({x:cx,team:this.team,own:this.id,r:120,t:2.2,max:2.2,tick:0,tick0:0.25,dmg:8,kind:'gravity',slow:2,pull:true});
        for(const e of game.enemiesOf(this)){
          if(Math.abs(e.x-cx)<150){
            e.vx=(Math.sign(cx-e.x)||1)*480; e.vy=-100; e.markT=Math.max(e.markT||0,5);
            lightnings.push({own:this.id,team:this.team,tgt:e.id,t:1.0,gap:0.2,gap0:0.2,dmg:Math.max(2,Math.round(this.bulletDmg*0.55))});
          }
        }
        break; }
      case 'ultWorkshop': {                   // 工匠:强化重建立场
        for(let i=0;i<2;i++) drones.push({x:this.x+(i-0.5)*26,y:this.y-30*this.size,team:this.team,own:this.id,
          t:12,cd:0.6+i*0.15,hover:rnd(0,6.28),kind:'coil',dmg:Math.max(3,Math.round(this.bulletDmg*WEAPONS.laser.dmg*1.2))});
        for(let i=0;i<2;i++) drones.push({x:this.x+(i-0.5)*22,y:this.y-54*this.size,team:this.team,own:this.id,
          t:10,cd:1,hover:rnd(0,6.28),kind:'heal',heal:Math.max(5,Math.round(8+this.maxHp*0.03))});
        for(let i=0;i<2;i++) drones.push({x:this.x+(i-0.5)*20,y:this.y-52*this.size,team:this.team,own:this.id,
          t:8,cd:rnd(0.2,0.8),hover:rnd(0,6.28),kind:'tri',off:(i-0.5)*24,offY:(i-0.5)*10,burst:0,burstT:0,
          dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.4))});
        break; }
      case 'ultSkyfall':                      // 游隼:强化标记锁定
        this.ultKind='skymark'; this.ultT=1.8; this.ultTick=0;
        for(const e of game.enemiesOf(this)) e.markT=Math.max(e.markT||0,6);
        break;
      case 'ultFullBurst':                    // 自由:强化全弹发射
        this.ultKind='fullburst'; this.ultT=1.8; this.ultTick=0; break;
      case 'ultJudgement':                    // 天罚:强化裁决光柱
        this.ultKind='judgement'; this.ultT=2.0; this.ultTick=0; break;
      case 'ultZero': {                       // 湮灭:强化湮灭冲击
        this.ultAoe(this.x,this.y-20,180,Math.round(this.bulletDmg*3.5),330);
        fireZones.push({x:this.x,team:this.team,own:this.id,r:175,t:2.0,max:2.0,tick:0,tick0:0.3,dmg:8,kind:'void',slow:2.2,pull:true});
        for(const e of game.enemiesOf(this)){ if(Math.abs(e.x-this.x)<190){ e.slowT=Math.max(e.slowT||0,2.5); e.markT=Math.max(e.markT||0,4); } }
        break; }
    }
    if(game.telemetry){
      const T=game.telemetry;
      T.casts[this.id]=(T.casts[this.id]||0)+1;
      T.ultCasts[this.id]=(T.ultCasts[this.id]||0)+1;
      T.skillCasts[this.id]=T.skillCasts[this.id]||{};
      T.skillCasts[this.id][id]=(T.skillCasts[this.id][id]||0)+1;
    }
    for(let i=_d0;i<drones.length;i++) if(drones[i]&&!drones[i].sk) drones[i].sk=id;
    for(let i=_z0;i<fireZones.length;i++) if(fireZones[i]&&!fireZones[i].sk) fireZones[i].sk=id;
    for(let i=_l0;i<lightnings.length;i++) if(lightnings[i]&&!lightnings[i].sk) lightnings[i].sk=id;
    for(let i=_b0;i<bullets.length;i++) if(bullets[i]&&!bullets[i].sk) bullets[i].sk=id;
    for(let i=_e0;i<emorbs.length;i++) if(emorbs[i]&&!emorbs[i].sk) emorbs[i].sk=id;
    for(let i=_i0;i<iceballs.length;i++) if(iceballs[i]&&!iceballs[i].sk) iceballs[i].sk=id;
    this._castId=null;
    return true;
  }
  /* 持续型终结技:按固定节拍产生多轮强化效果 */
  updateUlt(dt,opp){
    this.ultT=Math.max(0,this.ultT-dt);
    if(this.ultT<=0){ this.ultKind=''; return; }
    this.ultTick-=dt;
    if(this.ultTick>0) return;
    const _prevCast=this._castId; this._castId=this.ch.ult;
    switch(this.ultKind){
      case 'sonic': {
        this.ultTick=0.14;
        const dir=this.ultDir||this.facing;
        this.x=clamp(this.x+dir*48,16,W-16);
        for(const e of game.enemiesOf(this)){
          if(e.dead) continue;
          if(Math.abs(e.x-this.x)<64 && Math.abs(e.y-this.y)<60){
            hitMech(e,Math.max(2,Math.round(this.bulletDmg*0.75)),dir*180,true,false,this); e.vy=Math.min(e.vy,-70);
          }
        }
        for(let i=0;i<6;i++) particles.push({x:this.x-dir*rnd(0,18),y:this.y-rnd(4,42),vx:-dir*rnd(40,140),vy:rnd(-30,30),life:0.25,max:0.25,col:i%2?'#c9a6ff':'#7df9ff',sz:ri(1,2),g:0});
        break; }
      case 'nova': {
        this.ultTick=0.4;
        const n=12, spd=WEAPONS.laser.speed;
        for(let i=0;i<n;i++){ const a=i/n*Math.PI*2;
          bullets.push({x:this.x,y:this.y-22*this.size,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,
            own:this.id,team:this.team,dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.35)),
            type:'laser',aoe:0,pierce:true,t:0,ang:a,knock:70,hitSet:null,sc:this.pSize,r:(this.pSize-1)*6,sk:'ultSupernova'});
        }
        this.energy=100; applyHeal(this,4,this,this.ch.ult);
        this.ultAoe(this.x,this.y-20,85,Math.max(2,Math.round(this.bulletDmg*0.8)),110);
        break; }
      case 'fullburst': {
        this.ultTick=0.36;
        const n=14, spd=WEAPONS.laser.speed;
        for(let i=0;i<n;i++){ const off=i-(n-1)/2, ang=(this.facing>0?0:Math.PI)+off*0.04;
          bullets.push({x:this.x+this.facing*29*this.size,y:this.y-24*this.size+off*4,vx:Math.cos(ang)*spd,vy:off*9,
            own:this.id,team:this.team,dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.55)),
            type:'laser',aoe:0,pierce:true,t:0,ang,knock:60,hitSet:null,sc:this.pSize,r:(this.pSize-1)*6,sk:'ultFullBurst'});
        }
        for(let i=0;i<6;i++){ const a=-Math.PI/2+(i-2.5)*0.3;
          bullets.push({x:this.x,y:this.y-24*this.size,vx:Math.cos(a)*230,vy:Math.sin(a)*230,
            own:this.id,team:this.team,dmg:Math.max(2,Math.round(this.bulletDmg*0.5)),
            type:'homing',aoe:0,knock:80,t:0,ang:a,turn:5,spd:230,maxT:3,hitSet:null,sc:this.pSize,r:(this.pSize-1)*6,sk:'ultFullBurst'});
        }
        break; }
      case 'judgement': {
        this.ultTick=0.3;
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const d=Math.abs(e.x-this.x); if(d<bd){bd=d;tgt=e;} }
        const cx=clamp(tgt?tgt.x:this.x+this.facing*120,40,W-40);
        this.ultAoe(cx,GROUND-30,52,Math.round(this.bulletDmg*2.0),190);
        break; }
      case 'skymark': {
        this.ultTick=0.22;
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const d=Math.abs(e.x-this.x); if(d<bd){bd=d;tgt=e;} }
        if(tgt){
          for(let i=0;i<16;i++){ const f=i/15; particles.push({x:this.x+(tgt.x-this.x)*f,y:this.y-24*this.size+((tgt.y-24*tgt.size)-(this.y-24*this.size))*f,vx:0,vy:0,life:0.22,max:0.22,col:i%2?'#ff5b5b':'#ffffff',sz:2,g:0}); }
          hitMech(tgt,Math.max(3,Math.round(this.bulletDmg*WEAPONS.laser.dmg*1.6)),this.facing*80,false,false,this);
          tgt.markT=Math.max(tgt.markT||0,6); sfx.beam();
        }
        break; }
    }
    this._castId=_prevCast;
  }
  /* 数据驱动的普通技能:新技能统一走这里,避免为每个技能复制一套 switch */
  castVariant(id,opp){
    const v=SKILL_VARIANTS[id]; if(!v) return false;
    switch(v.kind){
      case 'dash': {
        this.dashSkill=id;
        this.dashT=v.dur||0.2; this.dashHit=false; this.dashDir=v.dir||1;
        this.dashSpd=v.spd||560; this.dashDmgMul=v.dmgMul||1.2; this.dashKb=v.kb||160;
        this.dashSlow=v.slow||0; this.dashMark=v.mark||0; this.dashAoe=v.aoe||0;
        if(v.shield) this.shieldT=Math.max(this.shieldT,v.shield);
        if(v.cloak) this.cloakT=Math.max(this.cloakT,v.cloak);
        if(v.speed) this.speedBoostT=Math.max(this.speedBoostT,v.speed);
        if(v.auraSlow) for(const e of game.enemiesOf(this)){ if(Math.abs(e.x-this.x)<70&&Math.abs(e.y-this.y)<50) e.slowT=Math.max(e.slowT||0,v.auraSlow); }
        for(let i=0;i<9;i++) particles.push({x:this.x-this.facing*rnd(0,14),y:this.y-rnd(4,38),vx:-this.facing*rnd(50,160),vy:rnd(-35,35),life:0.28,max:0.28,col:i%2?this.pal.light:'#cfe6ff',sz:ri(1,2),g:0});
        sfx.swing(); return true;
      }
      case 'volley': {
        const start=bullets.length;
        this.volley(opp,v.wep||'rifle',v.n||3,v.arc||0.12,v.dmgMul||1,v.ySpread||0);
        for(let i=start;i<bullets.length;i++){
          const b=bullets[i];
          if(v.pierce) b.pierce=true;
          if(v.slow) b.slow=v.slow;
          if(v.mark) b.mark=v.mark;
          if(v.speedMul){ b.vx*=v.speedMul; b.vy*=v.speedMul; }
          if(v.aoe) b.aoe=v.aoe;
          b.sk=id;
        }
        return true;
      }
      case 'lob': {
        const base=clamp(opp&&!opp.dead?opp.x:this.x+this.facing*160,20,W-20);
        const w=WEAPONS[v.wep||'mortar'], n=Math.max(1,Math.round((v.n||3)*this.pCount)), grav=560, sp=v.spread||58;
        for(let i=0;i<n;i++){
          const txx=clamp(base+rnd(-sp,sp),20,W-20), T2=rnd(0.75,1.0), oy=this.y-30*this.size-rnd(0,8);
          bullets.push({x:this.x+rnd(-6,6),y:oy,vx:(txx-this.x)/T2,vy:((GROUND-6-oy)-0.5*grav*T2*T2)/T2,grav,
            own:this.id,team:this.team,dmg:Math.max(1,Math.round(this.bulletDmg*w.dmg*(v.dmgMul||1))),
            type:v.wep==='rocket'?'rocket':'mortar',aoe:v.aoe||w.aoe||34,knock:w.knock||120,
            t:0,ang:0,ty:GROUND-6,hitSet:null,sc:this.pSize,r:(this.pSize-1)*6,sk:id});
        }
        this.muzzleT=0.12; sfx.shoot(); return true;
      }
      case 'buff': {
        if(v.fortify) this.fortifyT=Math.max(this.fortifyT,v.fortify);
        if(v.shield) this.shieldT=Math.max(this.shieldT,v.shield);
        if(v.speed) this.speedBoostT=Math.max(this.speedBoostT,v.speed);
        if(v.over) this.overT=Math.max(this.overT,v.over);
        if(v.regen) this.burstT=Math.max(this.burstT,v.regen);
        if(v.heal) applyHeal(this,v.heal,this,id);
        if(v.energy) this.energy=Math.min(100,this.energy+v.energy);
        if(v.castSlow) this.castSlowT=Math.max(this.castSlowT,v.castSlow);
        if(v.cover){
          const cw=16, cpHP=70+Math.round(this.maxHp*0.15), cx=clamp(this.x+this.facing*(22+cw/2),20,W-20);
          covers.push({x:cx,y:GROUND,team:this.team,own:this.id,hp:cpHP,max:cpHP,t:10,w:cw,h:46});
        }
        sparks(this.x,this.y-24*this.size,'#8fe6ff',12,80); sfx.guard(); return true;
      }
      case 'summon': {
        const n=Math.max(1,Math.round((v.n||1)*this.pCount));
        for(let i=0;i<n;i++){
          if(v.droneKind==='heal') drones.push({x:this.x+(i-(n-1)/2)*18,y:this.y-54*this.size,team:this.team,own:this.id,t:v.t||8,cd:1,hover:rnd(0,6.28),kind:'heal',heal:v.heal||5});
          else if(v.droneKind==='coil') drones.push({x:this.x-this.facing*24,y:this.y-20*this.size,team:this.team,own:this.id,t:v.t||10,cd:0.6,hover:rnd(0,6.28),kind:'coil',dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*(v.dmgMul||0.8)))});
          else drones.push({x:this.x+(i-(n-1)/2)*18,y:this.y-52*this.size,team:this.team,own:this.id,t:v.t||7,cd:rnd(0.2,0.8),hover:rnd(0,6.28),kind:'tri',off:(i-(n-1)/2)*24,offY:(i-(n-1)/2)*10,burst:0,burstT:0,dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*(v.dmgMul||0.35)))});
        }
        sparks(this.x,this.y-44*this.size,'#7df9ff',12,90); sfx.round(); return true;
      }
      case 'zone': {
        const tx=clamp(opp&&!opp.dead?opp.x:this.x+this.facing*80,20,W-20);
        fireZones.push({x:tx,team:this.team,own:this.id,r:v.r||80,t:v.t||3,max:v.t||3,tick:0,tick0:v.tick||0.4,
          dmg:Math.max(1,Math.round(v.dmg||4)),kind:v.zoneKind||'void',slow:v.slow||0,pull:!!v.pull});
        sparks(tx,GROUND-24,'#b18cff',12,90); sfx.round(); return true;
      }
      case 'execute': {
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const d=Math.abs(e.x-this.x); if(d<bd){bd=d;tgt=e;} }
        if(!tgt) return false;
        let dmg=Math.round(this.bulletDmg*WEAPONS.laser.dmg*(v.dmgMul||2.5));
        if(tgt.hp/tgt.maxHp<0.35) dmg=Math.round(dmg*(v.executeBonus||1.5));
        for(let i=0;i<18;i++){ const f=i/17; particles.push({x:this.x+(tgt.x-this.x)*f,y:this.y-24*this.size+((tgt.y-24*tgt.size)-(this.y-24*this.size))*f,vx:0,vy:0,life:0.22,max:0.22,col:i%2?'#ff5b5b':'#ffffff',sz:2,g:0}); }
        hitMech(tgt,dmg,this.facing*80,false,false,this); tgt.markT=Math.max(tgt.markT||0,3);
        game.shake=Math.max(game.shake,5); sfx.beam(); return true;
      }
      case 'teleportStrike': {
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const d=Math.abs(e.x-this.x); if(d<bd){bd=d;tgt=e;} }
        if(!tgt) return false;
        this.x=clamp(tgt.x-(tgt.facing||1)*28,16,W-16); this.facing=tgt.x>=this.x?1:-1;
        let dmg=Math.round(MELEE_DMG*this.atkMul*this.mw.dmg*roleMeleeMul(this)*(v.dmgMul||2));
        if(tgt.markT>0) dmg=Math.round(dmg*(v.markBonus||1.5));
        hitMech(tgt,dmg,this.facing*240,true,false,this); tgt.markT=Math.max(tgt.markT||0,3);
        for(let i=0;i<14;i++) particles.push({x:this.x+rnd(-16,16),y:this.y-rnd(0,36),vx:rnd(-90,90),vy:rnd(-90,20),life:0.3,max:0.3,col:i%2?'#7dffcf':'#2a3341',sz:ri(1,2),g:0});
        sfx.swing(); return true;
      }
      case 'leap': {
        this.vy=-250; this.onGround=false;
        this.dashT=0.2; this.dashHit=true; this.dashDir=-1; this.dashSpd=300; this.dashDmgMul=0; this.dashKb=0;
        this.volley(opp,v.wep||'rocket',v.n||2,v.arc||0.2,v.dmgMul||0.8);
        return true;
      }
      case 'beam': {
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const d=Math.abs(e.x-this.x); if(d<bd){bd=d;tgt=e;} }
        if(!tgt) return false;
        const n=v.n||6, gap=v.gap||0.2;
        lightnings.push({own:this.id,team:this.team,tgt:tgt.id,t:n*gap,gap,gap0:gap,
          dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*(v.dmgMul||0.55)))});
        sparks(tgt.x,tgt.y-30*tgt.size,'#ffe27a',12,100); sfx.beam(); return true;
      }
      case 'drain': {
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const d=Math.abs(e.x-this.x); if(d<bd){bd=d;tgt=e;} }
        if(!tgt) return false;
        const dmg=Math.max(2,Math.round(this.bulletDmg*(v.dmgMul||1.8)));
        hitMech(tgt,dmg,this.facing*70,false,false,this);
        const heal=Math.max(1,Math.round(dmg*(v.healRatio||0.6)));
        const healed=applyHeal(this,heal,this,id);
        dmgTexts.push({x:this.x+rnd(-6,6),y:this.y-44*this.size,val:'+'+healed,col:'#8fffc0',life:0.7,max:0.7});
        for(let i=0;i<14;i++) particles.push({x:tgt.x+rnd(-10,10),y:tgt.y-rnd(10,40),vx:rnd(-80,80),vy:rnd(-80,20),life:0.3,max:0.3,col:i%2?'#a86ee0':'#8fffc0',sz:ri(1,2),g:0});
        sfx.heal(); return true;
      }
    }
    return false;
  }
  /* 技能施放:slot='nJ'/'fJ'/'bJ'/'nK'/'fK'/'bK' → ch.skills 映射技能 id,成功返回 true */
  castSkill(slot,opp){
    const id=this.ch.skills&&this.ch.skills[slot], sk=SKILLS[id];
    if(!sk) return false;
    const _d0=drones.length, _z0=fireZones.length, _l0=lightnings.length, _b0=bullets.length, _e0=emorbs.length, _i0=iceballs.length;
    this._castId=id;                              // 记录当前施放技能 id:供 volley/弹道附加视觉皮肤
    sfx.cast();                                   // 统一的技能施放音
    if(SKILL_SFX[id]) sfx[SKILL_SFX[id]]();       // 按技能类型叠加专属音色
    switch(id){
      case 'dash': this.dashSkill=id; this.dashT=0.18; this.dashHit=false; this.dashDir=1; this.dashSpd=520; this.dashDmgMul=1.35; this.dashKb=150;
        for(let i=0;i<9;i++) particles.push({x:this.x-this.facing*rnd(0,12),y:this.y-rnd(6,38),vx:-this.facing*rnd(50,150),vy:rnd(-35,35),life:0.28,max:0.28,col:this.pal.saber,sz:ri(1,2),g:0});
        sfx.swing(); break;
      case 'shadowdash': this.dashSkill=id; this.dashT=0.2; this.dashHit=false; this.dashDir=1; this.dashSpd=560; this.dashDmgMul=1.5; this.dashKb=170;
        for(let i=0;i<12;i++) particles.push({x:this.x-this.facing*rnd(0,16),y:this.y-rnd(4,40),vx:-this.facing*rnd(60,180),vy:rnd(-40,40),life:0.32,max:0.32,col:i%2?this.pal.saber:this.pal.dark,sz:ri(1,2),g:0});
        sfx.swing(); break;
      case 'shieldbash': this.dashSkill=id; this.dashT=0.22; this.dashHit=false; this.dashDir=1; this.dashSpd=460; this.dashDmgMul=1.1; this.dashKb=230;
        sparks(this.x+this.facing*14,this.y-22,'#9adcff',12,110); sfx.guard(); sfx.swing(); break;
      case 'trample': this.dashSkill=id; this.dashT=0.3; this.dashHit=false; this.dashDir=1; this.dashSpd=400; this.dashDmgMul=1.6; this.dashKb=210;
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
      case 'fortify': this.fortifyT=3; this.castSlowT=1.4; sparks(this.x,this.y-20,'#9adcff',10,80); sfx.guard(); break;
      case 'vulcan': this.siegeT=1.4; this.siege=true; this.vx=0;
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
            t:0, ang:0, ty:GROUND-6, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6, sk:'mortarBarrage' });
        }
        this.muzzleT=0.14;
        for(let i=0;i<12;i++) particles.push({x:this.x+rnd(-12,12),y:this.y-28*this.size,vx:rnd(-70,70),vy:rnd(-120,-30),life:0.4,max:0.4,col:i%2?'#ff9a4d':'#8a94a8',sz:ri(1,2),g:160});
        sfx.shoot(); break; }
      case 'burst': this.energy=100; this.burstT=3; sparks(this.x,this.y-24,'#ffd6f0',12,90); sfx.round(); break;
      case 'spin': this.spinSkill=id; this.spinT=0.4; this.spinHit=false;
        for(let i=0;i<12;i++) particles.push({x:this.x+Math.cos(i/12*6.28)*20,y:this.y-22+Math.sin(i/12*6.28)*20,vx:Math.cos(i/12*6.28)*90,vy:Math.sin(i/12*6.28)*90,life:0.3,max:0.3,col:this.pal.saber,sz:ri(1,2),g:0});
        sfx.swing(); break;
      case 'roar': this.roarT=2.5; game.shake=Math.max(game.shake,5); sfx.boom();
        for(let i=0;i<14;i++) particles.push({x:this.x+rnd(-20,20),y:this.y-rnd(0,30),vx:rnd(-90,90),vy:rnd(-60,10),life:0.35,max:0.35,col:'#ffb066',sz:2,g:120});
        for(const e of game.enemiesOf(this)){
          if(Math.abs(e.x-this.x)<95&&Math.abs(e.y-this.y)<50){
            hitMech(e,8,(Math.sign(e.x-this.x)||this.facing)*240,true,false,this); e.vy=-140;
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
            turn:5.0, spd:245, maxT:2.8, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6, sk:'missileSalvo' });
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
      case 'eshield': this.shieldT=2.8; this.castSlowT=1.6; sparks(this.x,this.y-22,'#ffffff',8,60); sfx.guard(); break;
      case 'judgement': {                    // 天罚审判:周身环形激光弹幕
        const n=Math.max(1,Math.round(8*this.pCount)), spd=WEAPONS.laser.speed*0.6;
        for(let i=0;i<n;i++){
          const a=i/n*Math.PI*2;
          bullets.push({ x:this.x, y:this.y-22*this.size,
            vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
            own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.6)),
            type:'laser', aoe:0, pierce:true, t:0, ang:a, knock:50, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6 });
        }
        game.shake=Math.max(game.shake,6); sfx.round();
        for(let i=0;i<22;i++) particles.push({x:this.x+rnd(-20,20),y:this.y-22*this.size+rnd(-20,20),vx:rnd(-140,140),vy:rnd(-140,140),life:0.45,max:0.45,col:'#ffe27a',sz:2,g:0});
        break; }
      case 'oblivion': {                     // 湮灭冲击:大范围 AoE + 击飞 + 迟滞
        const R=Math.round(110*this.pSize), dmg=Math.round(this.bulletDmg*2.4*this.atkMul);
        game.shake=Math.max(game.shake,9); sfx.boom();
        for(let i=0;i<30;i++) particles.push({x:this.x+rnd(-40,40),y:this.y-rnd(0,40),vx:rnd(-230,230),vy:rnd(-230,60),life:0.5,max:0.5,col:i%2?'#ff3b5b':'#ffd166',sz:ri(2,3),g:120});
        for(const e of game.enemiesOf(this)){
          if(Math.abs(e.x-this.x)<R && Math.abs(e.y-this.y)<90){
            hitMech(e,dmg,(Math.sign(e.x-this.x)||this.facing)*280,true,false,this); e.vy=-180;
            e.slowT=Math.max(e.slowT||0,1.5);
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
            turn:4.6, spd:235, maxT:3.2, hitSet:null, sk:'hellfire' });
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
            own:this.id, team:this.team, dmg:Math.max(1,Math.round(this.bulletDmg*0.65)),
            type:'incendiary', aoe:30, knock:70, t:0, ang:0, ty:GROUND-6, hitSet:null, sk:'incendiary' });
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
            dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.26)) });
        }
        sparks(this.x,this.y-40*this.size,'#7df9ff',14,90); sfx.round(); break; }
      case 'cover': {                         // 部署掩体:身前展开固定 HP 掩体,仅拦敌方弹药
        const cw=16, cpHP=70+Math.round(this.maxHp*0.15);
        const cx=clamp(this.x+this.facing*(22+cw/2),20,W-20);
        covers.push({ x:cx, y:GROUND, team:this.team, own:this.id,
          hp:cpHP, max:cpHP, t:12, w:cw, h:46 });
        this.castSlowT=1.2;                     // 功能技代价:部署后短暂迟缓
        sparks(cx,GROUND-24,'#9adcff',12,80); sfx.guard(); break; }
      case 'healDrone':                       // 修复无人机:跟随自身 8 秒,每 1s 充能回血
        drones.push({ x:this.x-this.facing*26, y:this.y-54*this.size, team:this.team, own:this.id,
          t:8, cd:1, hover:rnd(0,6.28), kind:'heal', heal:Math.max(4,Math.round(6+this.maxHp*0.03)) });
        sparks(this.x,this.y-48*this.size,'#8fffc0',12,90); sfx.round(); break;
      case 'lightning': {                     // 雷击锁定:锁定最近敌人,3 秒内每 0.2s 落雷(不硬直)
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const dd=Math.abs(e.x-this.x); if(dd<bd){bd=dd;tgt=e;} }
        if(!tgt){ this._castId=null; return false; }                // 无目标:不进入冷却
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
      /* —— 签名技(每机专属) —— */
      case 'sonicdash': {                    // 音爆冲刺:突破音障的高速冲刺,路径重斩 + 重击退
        this.dashT=0.2; this.dashHit=false; this.dashDir=1; this.dashSpd=820; this.dashDmgMul=1.45; this.dashKb=260;
        game.shake=Math.max(game.shake,4);
        for(let i=0;i<16;i++) particles.push({x:this.x-this.facing*rnd(0,22),y:this.y-rnd(4,44),vx:-this.facing*rnd(90,250),vy:rnd(-55,55),life:0.32,max:0.32,col:i%2?'#c9a6ff':'#7df9ff',sz:ri(1,2),g:0});
        sfx.swing(); break; }
      case 'magnetpull': {                   // 磁力牵引:磁场将附近敌人拽向自身并减速
        const R=Math.round(155*this.pSize);
        for(let i=0;i<18;i++) particles.push({x:this.x+rnd(-26,26),y:this.y-rnd(0,42),vx:rnd(-70,70),vy:rnd(-70,20),life:0.36,max:0.36,col:i%2?'#b18cff':'#7df9ff',sz:ri(1,2),g:0});
        sfx.round();
        for(const e of game.enemiesOf(this)){
          if(e.dead) continue;
          if(Math.abs(e.x-this.x)<R && Math.abs(e.y-this.y)<76){
            hitMech(e,Math.max(2,Math.round(this.bulletDmg*0.6)),0,true,false,this);   // 先结算伤害
            e.vx=(Math.sign(this.x-e.x)||this.facing)*430;                  // 再赋牵引速度(避免被 hitMech 覆盖)
            e.slowT=Math.max(e.slowT||0,1.8);                               // 磁力干扰减速
          }
        }
        break; }
      case 'marklock': {                     // 标记锁定:hitscan 重创最近敌人并标记其弱点(受创 +30%)
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const dd=Math.abs(e.x-this.x); if(dd<bd){bd=dd;tgt=e;} }
        if(!tgt){ this._castId=null; return false; }               // 无目标:不进入冷却
        const ty=tgt.y-24*tgt.size, sy=this.y-24*this.size;
        for(let i=0;i<16;i++){ const f=i/15;
          particles.push({x:this.x+(tgt.x-this.x)*f,y:sy+(ty-sy)*f,vx:0,vy:0,life:0.22,max:0.22,col:i%2?'#ff5b5b':'#ffffff',sz:2,g:0});
        }
        hitMech(tgt,Math.max(3,Math.round(this.bulletDmg*WEAPONS.laser.dmg*1.5)),this.facing*60,false,false,this);
        tgt.markT=4; tgt.slowT=Math.max(tgt.slowT||0,0.8);
        game.shake=Math.max(game.shake,4); sfx.beam(); break; }
      case 'rebuildfield':                   // 重建立场:召唤持续 8 秒的修复无人机为自身充能
        drones.push({ x:this.x-this.facing*26, y:this.y-54*this.size, team:this.team, own:this.id,
          t:8, cd:1, hover:rnd(0,6.28), kind:'heal', heal:Math.max(4,Math.round(4+this.maxHp*0.02)) });
        sparks(this.x,this.y-48*this.size,'#8fffc0',14,100); sfx.heal(); break;
      case 'fullburst': {                    // 全弹发射:展开全部光束兵装,向前倾泻贯穿光束
        const n=Math.max(1,Math.round(8*this.pCount)), spd=WEAPONS.laser.speed;
        const base=(this.facing>0?0:Math.PI);
        for(let i=0;i<n;i++){
          const off=i-(n-1)/2, ang=base+off*0.03;
          bullets.push({ x:this.x+this.facing*29*this.size, y:this.y-24*this.size+off*6,
            vx:Math.cos(ang)*spd, vy:off*10,
            own:this.id, team:this.team, dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.45)),
            type:'laser', aoe:0, pierce:true, t:0, ang, knock:50, hitSet:null, sc:this.pSize, r:(this.pSize-1)*6 });
        }
        this.muzzleT=0.16; game.shake=Math.max(game.shake,5);
        for(let i=0;i<18;i++) particles.push({x:this.x+this.facing*rnd(0,26),y:this.y-24*this.size+rnd(-18,18),vx:this.facing*rnd(120,340),vy:rnd(-50,50),life:0.3,max:0.3,col:i%2?'#7dd6ff':'#ffffff',sz:ri(1,2),g:0});
        sfx.beam(); break; }
      case 'judgementpillar': {              // 裁决光柱:在敌人位置降下光柱,范围重创并击飞
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const dd=Math.abs(e.x-this.x); if(dd<bd){bd=dd;tgt=e;} }
        const cx=clamp(tgt?tgt.x:this.x+this.facing*160,20,W-20);
        const R=Math.round(68*this.pSize), dmg=Math.max(5,Math.round(this.bulletDmg*3.2));
        game.shake=Math.max(game.shake,8); sfx.boom();
        for(let i=0;i<28;i++) particles.push({x:cx+rnd(-14,14),y:GROUND-rnd(0,GROUND),vx:rnd(-60,60),vy:rnd(-230,-60),life:0.5,max:0.5,col:i%2?'#fff3b8':'#ffd166',sz:ri(2,3),g:-40});
        for(let i=0;i<16;i++) particles.push({x:cx+rnd(-R*0.7,R*0.7),y:GROUND-rnd(0,6),vx:rnd(-160,160),vy:rnd(-90,-10),life:0.42,max:0.42,col:i%2?'#ffe89a':'#c9a227',sz:ri(1,3),g:200});
        for(const e of game.enemiesOf(this)){
          if(e.dead) continue;
          if(Math.abs(e.x-cx)<R && e.y>GROUND-150){
            hitMech(e,dmg,(Math.sign(e.x-this.x)||this.facing)*120,false,false,this);
            e.vy=-210;                                                        // 击飞(hitMech 之后设置)
            e.slowT=Math.max(e.slowT||0,1.2);
            e.stunT=Math.max(e.stunT||0,0.22);                                // 光柱压制:短暂硬直
          }
        }
        break; }
      /* —— 近战/召唤/反制类机制扩展 —— */
      case 'hammerorbit': {                  // 环绕战锤:能量战锤绕身高速旋转 2.6 秒
        this.orbitT=2.6; this.orbitUlt=false; this.orbitSkill=id; this.orbitAng=0; this.orbitCd={};
        for(let i=0;i<16;i++){ const a=i/16*Math.PI*2;
          particles.push({x:this.x+Math.cos(a)*22,y:this.y-20*this.size+Math.sin(a)*22,
            vx:Math.cos(a)*90,vy:Math.sin(a)*90,life:0.34,max:0.34,col:i%2?'#ffd166':'#b0b6c4',sz:ri(1,2),g:0}); }
        sfx.swing(); break; }
      case 'quakewave': {                    // 地震波:锤击地面激起贴地推进的岩刺波
        const dmg=Math.max(3,Math.round(this.bulletDmg*1.15));
        bullets.push({ x:this.x+this.facing*20*this.size, y:GROUND-6, vx:this.facing*320, vy:0,
          own:this.id, team:this.team, dmg, type:'quake', aoe:0, pierce:true, t:0, ang:0,
          knock:150, hitSet:null, sk:'quakewave' });
        game.shake=Math.max(game.shake,6); sfx.boom();
        for(let i=0;i<14;i++) particles.push({x:this.x+this.facing*rnd(4,30),y:GROUND-rnd(0,8),
          vx:this.facing*rnd(60,180),vy:rnd(-90,-20),life:0.4,max:0.4,col:i%2?'#caa06a':'#8a94a8',sz:ri(1,3),g:220});
        break; }
      case 'groundburst': this.gbSkill=id;   // 连环地裂:向前连续引爆 4 段地面
        this.gbN=4; this.gbGap=0; this.gbX=this.x+this.facing*24; this.gbDir=this.facing;
        game.shake=Math.max(game.shake,3); sfx.boom(); break;
      case 'mechbird': {                     // 机械隼:召唤悬停身侧的机械隼,每 0.8~1.4s 发射穿透激光
        drones.push({ x:this.x-this.facing*30, y:this.y-56*this.size, team:this.team, own:this.id,
          t:12, cd:rnd(0.8,1.4), hover:rnd(0,6.28), kind:'bird', sz:this.pSize, wing:0, fireT:0, ang:0,
          dmg:Math.max(2,Math.round(this.bulletDmg*WEAPONS.laser.dmg*0.9)) });
        sparks(this.x,this.y-50*this.size,'#ffd166',12,90); sfx.round(); break; }
      case 'shieldbreak': {                  // 破盾重击:近战重击,击碎目标护盾与壁垒
        let tgt=null,bd=1e9;
        for(const e of game.enemiesOf(this)){ if(e.dead) continue; const dd=Math.abs(e.x-this.x); if(dd<bd){bd=dd;tgt=e;} }
        if(tgt&&Math.abs(tgt.x-this.x)>46)     // 不在近战范围内:朝目标短距瞬身
          this.x=clamp(tgt.x-this.facing*32,16,W-16);
        const hit=this.x+this.facing*34;
        game.shake=Math.max(game.shake,6); sfx.guard(); sfx.swing();
        for(let i=0;i<16;i++) particles.push({x:hit+rnd(-14,14),y:this.y-20*this.size+rnd(-16,16),
          vx:this.facing*rnd(60,200),vy:rnd(-90,60),life:0.34,max:0.34,col:i%2?'#9adcff':'#ffffff',sz:ri(1,2),g:120});
        for(const e of game.enemiesOf(this)){
          if(e.dead) continue;
          if(Math.abs(e.x-hit)<34&&Math.abs(e.y-this.y)<44){
            if(e.shieldT>0){ e.shieldT=0; sparks(e.x,e.y-22,'#9adcff',14,120); }   // 击碎护盾
            if(e.fortifyT>0) e.fortifyT=0;                                        // 击碎壁垒
            hitMech(e,Math.max(3,Math.round(this.bulletDmg*1.35)),this.facing*220,true,false,this);
            e.slowT=Math.max(e.slowT||0,1.2);
          }
        }
        break; }
      case 'antidrone': {                    // 干扰脉冲:清除范围内敌方弹幕与召唤物,并造成范围伤害/迟滞
        const R=Math.round(155*this.pSize), dmg=Math.max(2,Math.round(this.bulletDmg*1.2));
        game.shake=Math.max(game.shake,5); sfx.round();
        for(let i=0;i<26;i++){ const a=i/26*Math.PI*2;
          particles.push({x:this.x+Math.cos(a)*14,y:this.y-24*this.size+Math.sin(a)*14,
            vx:Math.cos(a)*rnd(120,240),vy:Math.sin(a)*rnd(120,240),life:0.42,max:0.42,col:i%2?'#7df9ff':'#ffffff',sz:ri(1,2),g:0}); }
        for(const d of drones){              // 范围内的敌方召唤物直接被摧毁
          if(d.team===this.team) continue;
          if(Math.abs(d.x-this.x)<R){ d.t=0; sparks(d.x,d.y,'#7df9ff',12,130); }
        }
        for(const b of bullets){             // 电磁脉冲清空范围内的敌方飞行道具
          if(b.team===this.team||b.dead) continue;
          if(Math.abs(b.x-this.x)<R&&Math.abs(b.y-(this.y-24*this.size))<R) b.dead=true;
        }
        for(const e of game.enemiesOf(this)){
          if(e.dead) continue;
          if(Math.abs(e.x-this.x)<R&&Math.abs(e.y-this.y)<80){
            hitMech(e,dmg,(Math.sign(e.x-this.x)||this.facing)*70,false,false,this);
            e.slowT=Math.max(e.slowT||0,1.6);
          }
        }
        break; }
      case 'reveal': {                       // 侦察脉冲:解除敌方隐身并标记弱点(受创 +30%)
        const R=Math.round(220*this.pSize);
        sfx.ui();
        for(let i=0;i<22;i++){ const a=i/22*Math.PI*2;
          particles.push({x:this.x,y:this.y-24*this.size,vx:Math.cos(a)*rnd(150,260),vy:Math.sin(a)*rnd(150,260),life:0.5,max:0.5,col:'#7dffcf',sz:2,g:0}); }
        for(const e of game.enemiesOf(this)){
          if(e.dead) continue;
          if(e.cloakT>0){ e.cloakT=0; sparks(e.x,e.y-22,'#7dffcf',12,110); }      // 破除隐身
          if(Math.abs(e.x-this.x)<R) e.markT=Math.max(e.markT||0,4);              // 标记弱点
        }
        break; }
      default:
        if(!this.castVariant(id,opp)){ this._castId=null; return false; }
    }
    this.cds[id]=sk.cd;                     // 施放成功才进入冷却
    if(game.telemetry){
      const T=game.telemetry;
      T.casts[this.id]=(T.casts[this.id]||0)+1;
      T.skillCasts[this.id]=T.skillCasts[this.id]||{};
      T.skillCasts[this.id][id]=(T.skillCasts[this.id][id]||0)+1;
    }
    // 给本次施放产生的持续实体打上来源技能,供伤害归属统计
    for(let i=_d0;i<drones.length;i++) if(drones[i]&&!drones[i].sk) drones[i].sk=id;
    for(let i=_z0;i<fireZones.length;i++) if(fireZones[i]&&!fireZones[i].sk) fireZones[i].sk=id;
    for(let i=_l0;i<lightnings.length;i++) if(lightnings[i]&&!lightnings[i].sk) lightnings[i].sk=id;
    for(let i=_b0;i<bullets.length;i++) if(bullets[i]&&!bullets[i].sk) bullets[i].sk=id;
    for(let i=_e0;i<emorbs.length;i++) if(emorbs[i]&&!emorbs[i].sk) emorbs[i].sk=id;
    for(let i=_i0;i<iceballs.length;i++) if(iceballs[i]&&!iceballs[i].sk) iceballs[i].sk=id;
    this._castId=null;                      // 弹道皮肤作用域仅限本次施放,避免污染后续普通射击
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
  // 持续型终结技:角色周身能量环
  if(m.ultT>0){
    const col=m.ultKind==='nova'?'#ffd6f0':m.ultKind==='fullburst'?'#ff7a7a':m.ultKind==='judgement'?'#ffe27a':m.ultKind==='skymark'?'#ff5b5b':'#7df9ff';
    const r=Math.round(30*sz+Math.sin(T*12)*3);
    g.globalAlpha=0.20+0.10*Math.sin(T*9); g.fillStyle=col; g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.fill();
    g.globalAlpha=0.75; g.strokeStyle=col; g.lineWidth=1;
    g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.stroke();
    g.globalAlpha=1;
  }
  // 环绕战锤:能量战锤绕身高速旋转(触及即重击;终结技为双锤风暴)
  if(m.orbitT>0){
    const ult=m.orbitUlt, R=Math.round((ult?64:34)*sz), n=ult?2:1;
    const fade=clamp(m.orbitT/0.4,0,1);
    for(let h=0;h<n;h++){
      const a=(m.orbitAng||0)+h*Math.PI;
      const hx=Math.round(cx+Math.cos(a)*R), hy=Math.round(cy+Math.sin(a)*R);
      g.globalAlpha=0.30*fade; g.strokeStyle=ult?'#ff9a4d':'#ffd166'; g.lineWidth=ult?2:1;
      g.beginPath(); g.arc(cx,cy,R,0,Math.PI*2); g.stroke();
      g.globalAlpha=fade;
      px(hx-5,hy-5,ult?12:10,ult?12:10,'#8a94a8');
      px(hx-4,hy-4,ult?10:8,ult?10:8,'#b0b6c4');
      px(hx-3,hy-3,ult?5:3,ult?5:3,ult?'#ffd166':'#ffd166');
      px(hx-1,hy-10,2,5,'#6a7387');
    }
    g.globalAlpha=1;
  }
}
