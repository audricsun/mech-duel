/* =========================================================================
 * 机甲对决 MECH DUEL · 09-combat.js
 * 战斗结算:伤害/防御/KO
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 7. 战斗结算 ---------------- */
function hitMech(def,dmg,kbx,melee,dot,src,skill){
  if(def.dead||game.state!=='fight') return;
  let d=dmg;
  const att=src||game.other(def);
  const T=game.telemetry;
  if(def.shieldT>0){                       // 能量护盾:完全格挡
    def.flash=0.08; sparks(def.x,def.y-22,'#ffffff',6,80); sfx.guard();
    if(T&&src&&src!==def){
      T.blocked[def.id]=(T.blocked[def.id]||0)+d;
      T.blocks[src.id]=(T.blocks[src.id]||0)+1;
    }
    return;
  }
  if(def.fortifyT>0) d=Math.max(1,Math.round(d*0.5));   // 震荡壁垒:受伤减半
  if(def.siege) d=Math.max(1,Math.round(d*0.8));        // 攻城模式:受伤 -20%
  if(def.markT>0) d=Math.max(1,Math.round(d*1.3));      // 标记锁定:弱点被标记,受创 +30%
  if(def.guarding){                        // 防御:按机体减伤(默认 85%),小幅推挡
    d=Math.max(1,Math.round(d*def.guardMul));
    def.vx=kbx*0.5; def.flash=0.08;
    sparks(def.x+def.facing*13,def.y-22,'#9adcff',5,70);
    sfx.guard();
  }else{
    if(def.fortifyT>0||def.roarT>0||dot){ def.flash=0.08; }  // 壁垒/战吼/持续伤害:免疫击退与硬直
    else{
      def.vx=kbx;
      // 硬直保护:未处于硬直且不在保护期时才施加,避免多枚弹幕连续命中把玩家永久锁死
      if(def.stunT<=0 && def.stunCd<=0){ def.stunT=0.3; def.stunCd=0.5; }
      if(!def.onGround) def.vy=Math.min(def.vy,-30);
    }
    sparks(def.x+def.facing*8,def.y-24,'#ffd166',8,110);
    sparks(def.x+def.facing*8,def.y-24,'#ffffff',3,80);
    sfx.hit();
  }
  def.hp = def.invincible ? Math.max(DUMMY_HP_FLOOR,def.hp-d) : Math.max(0,def.hp-d);  // 靶机血量下限锁在 DUMMY_HP_FLOOR
  if(T){
    if(src&&src!==def){
      T.damage[src.id]=(T.damage[src.id]||0)+d;
      T.taken[def.id]=(T.taken[def.id]||0)+d;
      T.hits[src.id]=(T.hits[src.id]||0)+1;
      T.hitsTaken[def.id]=(T.hitsTaken[def.id]||0)+1;
      const kid=skill||src._castId||null;
      if(kid){
        T.skillDamage[src.id]=T.skillDamage[src.id]||{};
        T.skillDamage[src.id][kid]=(T.skillDamage[src.id][kid]||0)+d;
        T.skillHits[src.id]=T.skillHits[src.id]||{};
        T.skillHits[src.id][kid]=(T.skillHits[src.id][kid]||0)+1;
      }
    }else{
      T.neutralDamage=(T.neutralDamage||0)+d;
      T.taken[def.id]=(T.taken[def.id]||0)+d;
    }
  }
  if(src&&src.addUlt&&src!==def) src.addUlt(d*ULT_GAIN);   // 造成伤害积累终结能量
  // 伤害数字分级:伤害越高字越大越亮、光晕与抖屏越夸张,便于一眼看出招式强度
  let tcol='#cfd6e6', tsz=7, tglow=0, tcrit=0;
  if(def.guarding){ tcol='#9adcff'; tsz=9; }
  else if(d>=60){ tcol='#fff5c0'; tsz=26; tglow=1; tcrit=1; }
  else if(d>=45){ tcol='#fff2c0'; tsz=22; tglow=1; tcrit=1; }
  else if(d>=30){ tcol='#ffd166'; tsz=17; tglow=1; }
  else if(d>=18){ tcol='#ffe08a'; tsz=13; tglow=1; }
  else if(d>=9){  tcol='#ffe9b0'; tsz=10; }
  dmgTexts.push({x:def.x+rnd(-6,6),y:def.y-44*def.size,val:d,col:tcol,sz:tsz,glow:tglow,crit:tcrit,life:0.65,max:0.65});
  def.flash=Math.max(def.flash,0.12);
  game.shake=Math.max(game.shake,def.guarding?2:(3+Math.min(d,90)*0.09));   // 伤害越高抖屏越强
  if(def.hp<=0 && !def.invincible) killMech(def,kbx,att);
}
function killMech(def,kbx,att){
  def.dead=true; def.hp=0;
  if(game.telemetry){
    const T=game.telemetry;
    if(att&&att!==def) T.kills[att.id]=(T.kills[att.id]||0)+1;
    T.deaths[def.id]=(T.deaths[def.id]||0)+1;
  }
  def.flying=false; def.siege=false; def.siegeT=0; def.cloakT=0; def.cloakAtk=false;
  def.vy=-150; def.vx=kbx*1.2;
  explosion(def.x,def.y-20);
  game.shake=7;
  if(game.storyMode){ game.onStoryKill(def); return; }
  if(game.state!=='fight') return;
  game.state='ko'; game.koT=2.3;
  game.koWinner = (att && !att.dead) ? att : null;
  game.setAnn('K.O.!',7,1.6,'#ff5b5b');
  sfx.boom(); sfx.ko();
}
/* 统一治疗入口:记录有效治疗量(用于详细平衡统计) */
function applyHeal(m,amount,src,skill){
  if(!m||m.dead) return 0;
  const before=m.hp;
  m.hp=Math.min(m.maxHp,m.hp+Math.max(0,amount));
  const healed=m.hp-before;
  const T=game.telemetry;
  if(T&&healed>0){
    T.healing[m.id]=(T.healing[m.id]||0)+healed;
    if(skill){
      const sid=src?src.id:m.id;
      T.skillHealing[sid]=T.skillHealing[sid]||{};
      T.skillHealing[sid][skill]=(T.skillHealing[sid][skill]||0)+healed;
    }
  }
  return healed;
}
function meleeCheck(a,def){
  if(a.dead||def.dead||a.atkT<=0||a.hitDone) return;
  const w=a.mw||MELEE_WEP.saber, dur=a.atkDur||ATK_TIME;
  const p=1-a.atkT/dur;                        // 挥砍进度 0→1
  if(p>0.2 && p<0.62){                         // 有效命中窗口(与原光刃等价)
    const dx=(def.x-a.x)*a.facing;
    if(dx>2 && dx<w.range*a.size && Math.abs(def.y-a.y)<w.arc*Math.max(1,def.size)){
      let md=MELEE_DMG*a.atkMul*w.dmg*roleMeleeMul(a);
      if(a.cloakAtk){ md*=1.8; a.cloakAtk=false; a.cloakT=0; }   // 破隐一击
      a.hitDone=true; hitMech(def,Math.round(md),a.facing*w.kb,true,false,a);
    }
  }
}
