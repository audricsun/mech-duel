/* =========================================================================
 * 机甲对决 MECH DUEL · 07-particles.js
 * 粒子、子弹与弹幕实体
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 5. 粒子与子弹 ---------------- */
let particles=[];
function sparks(x,y,col,n=6,spd=90){
  for(let i=0;i<n;i++){
    const a=rnd(0,Math.PI*2), v=rnd(spd*0.3,spd);
    particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-40,life:rnd(0.2,0.45),max:0.45,col,sz:ri(1,2),g:260});
  }
}
function explosion(x,y){
  for(let i=0;i<26;i++){
    const a=rnd(0,Math.PI*2), v=rnd(30,160);
    particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-60,life:rnd(0.3,0.8),max:0.8,
      col:['#ffd166','#ff8c42','#ff5b5b','#fff2c0'][ri(0,3)],sz:ri(1,3),g:180});
  }
  for(let i=0;i<10;i++)
    particles.push({x:x+rnd(-8,8),y:y+rnd(-8,8),vx:rnd(-15,15),vy:rnd(-70,-20),life:rnd(0.5,1.1),max:1.1,col:'#5a5f6e',sz:ri(2,3),g:-30});
}
/* 命中特效:火花四溅 + 被弹开的碎屑(反弹感) */
function impactFX(x,y,dir=1,col='#ffd166',n=7){
  dir=Math.sign(dir)||1;
  sparks(x,y,col,n,115);
  sparks(x,y,'#ffffff',Math.max(2,n-3),85);
  for(let i=0;i<4;i++){                       // 弹开的碎屑:朝来向回弹
    const a=rnd(-0.9,0.9);
    particles.push({ x,y, vx:-dir*Math.cos(a)*rnd(45,115), vy:Math.sin(a)*rnd(30,90)-30,
      life:rnd(0.18,0.36), max:0.36, col:i%2?'#fff2c0':col, sz:ri(1,2), g:180 });
  }
}
function updateParticles(dt){
  for(const p of particles){ p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=p.g*dt; }
  particles=particles.filter(p=>p.life>0 && p.y<H+8);
}
function drawParticles(){
  for(const p of particles){
    g.globalAlpha=clamp(p.life/p.max,0,1);
    px(Math.round(p.x),Math.round(p.y),p.sz,p.sz,p.col);
  }
  g.globalAlpha=1;
}
let bullets=[];
let fireZones=[];        // 凝固燃烧弹留下的持续火海({x,team,own,r,t,max,tick,dmg})
let drones=[];           // 浮游炮单位({x,y,team,own,t,cd,hover,dmg})
let covers=[];           // 部署掩体({x,y,team,own,hp,max,t,w,h})
let iceballs=[];         // 寒冰球({x,y,vx,team,own,r,hp,t,dmg})
let emorbs=[];           // 电磁球({x,y,vx,vy,team,own,r,hp,t,dmg,ph})
let lightnings=[];       // 雷击锁定({own,team,tgt,t,gap,dmg})
/* 火箭弹爆炸:范围伤害 + 强击退 + 火花 */
function explodeBullet(b,mechs){
  if(b.exploded) return; b.exploded=true; b.dead=true;
  sfx.boom();
  for(let i=0;i<14;i++)
    particles.push({x:b.x,y:b.y,vx:rnd(-90,90),vy:rnd(-110,30),life:rnd(0.25,0.55),max:0.55,col:i%3?'#ff9a4d':'#ffe27a',sz:ri(2,3),g:220});
  game.shake=Math.max(game.shake,4);
  if(b.type==='incendiary'){                 // 燃烧弹:落点留下持续灼烧的火海
    fireZones.push({ x:b.x, team:b.team, own:b.own, r:44, t:3.0, max:3.0,
      tick:0, dmg:Math.max(1,Math.round((b.dmg||10)*0.16)) });
  }
  for(const m of mechs){
    if(m.team===b.team||m.dead) continue;
    const dx=m.x-b.x, dy=(m.y-20*m.size)-b.y;
    if(Math.hypot(dx,dy)<(b.aoe||0)*(b.sc||1)+10*m.size){   // 放大弹体:爆炸范围同步放大
      hitMech(m,b.dmg,Math.sign(dx)||Math.sign(b.vx)||1,false);
      m.vx+=(Math.sign(dx)||1)*b.knock; m.vy=Math.min(m.vy,-60);
    }
  }
}
function updateBullets(dt,mechs){
  for(const b of bullets){
    b.t+=dt;
    b.x+=b.vx*dt;
    if(b.wave!==undefined) b.y=b.baseY+Math.sin(b.t*18)*7;   // 电弧波浪轨迹
    else b.y+=b.vy*dt;
    if(b.turn){                                   // 追踪弹:持续朝目标修正航向
      const tgt=mechs.find(m2=>m2.team!==b.team&&!m2.dead&&m2.cloakT<=0);
      if(tgt){
        const want=Math.atan2((tgt.y-20*tgt.size)-b.y,tgt.x-b.x);
        let cur=Math.atan2(b.vy,b.vx), diff=want-cur;
        while(diff>Math.PI) diff-=2*Math.PI; while(diff<-Math.PI) diff+=2*Math.PI;
        const mt=b.turn*dt; cur+=clamp(diff,-mt,mt);
        b.vx=Math.cos(cur)*b.spd; b.vy=Math.sin(cur)*b.spd; b.ang=cur;
      }
      if(Math.random()<0.7) particles.push({x:b.x,y:b.y,vx:rnd(-10,10),vy:rnd(-10,10),life:0.22,max:0.22,col:b.type==='homing'?'#7df9ff':'#ff9a4d',sz:ri(1,2),g:0});
      if(b.t>b.maxT){ if(b.aoe) explodeBullet(b,mechs); else b.dead=true; continue; }
    }
    if(b.type==='mortar'||b.type==='incendiary'){  // 迫击炮/燃烧弹:抛物线弹道,到点即炸
      b.vy+=b.grav*dt; b.ang=Math.atan2(b.vy,b.vx);
      if(Math.random()<0.5) particles.push({x:b.x,y:b.y,vx:rnd(-8,8),vy:rnd(-8,8),life:0.2,max:0.2,col:b.type==='incendiary'?'#ff9a4d':'#8a94a8',sz:1,g:0});
      if(b.y>=Math.min(b.ty,GROUND-2)||b.t>1.6){ explodeBullet(b,mechs); continue; }
    }
    if(b.type==='droneLaser'&&b.y>=GROUND-1){     // 浮游炮贯穿弹:触地消散
      sparks(b.x,GROUND,'#7de3ff',5,90); b.dead=true; continue;
    }
    if(b.type==='rocket'&&Math.random()<0.6)                 // 火箭尾焰
      particles.push({x:b.x-Math.cos(b.ang)*6,y:b.y-Math.sin(b.ang)*6,vx:rnd(-12,12),vy:rnd(-12,12),life:rnd(0.15,0.3),max:0.3,col:'#ff9a4d',sz:ri(1,2),g:0});
    // —— 光束/电弧弹拖尾粒子:让高速弹道留下能量尾迹 ——
    if((b.type==='laser'||b.type==='droneLaser'||b.type==='droneShot')&&Math.random()<0.55)
      particles.push({x:b.x,y:b.y,vx:rnd(-10,10),vy:rnd(-10,10),life:0.16,max:0.16,col:b.type==='laser'?'#5ff2ff':'#7df9ff',sz:1,g:0});
    if(b.type==='arc'&&Math.random()<0.5)
      particles.push({x:b.x,y:b.y,vx:rnd(-22,22),vy:rnd(-22,22),life:0.14,max:0.14,col:'#64f0c8',sz:1,g:0});
    if(b.type==='rocket'&&b.y>=GROUND-1){ explodeBullet(b,mechs); continue; }  // 撞地爆炸
    // —— 冰球拦截:寒冰球可挡下敌方的飞行道具 ——
    if(!b.aoe&&b.type!=='droneLaser'){          // 范围弹/贯穿激光不被冰球拦下
      let blocked=false;
      for(const ib of iceballs){
        if(ib.team===b.team) continue;
        if(Math.hypot(b.x-ib.x,b.y-ib.y)<ib.r+3){
          ib.hp-=8; impactFX(b.x,b.y,b.vx,'#eafffa',7);
          b.dead=true; blocked=true;
          if(ib.hp<=0){ ib.t=0; sparks(ib.x,ib.y,'#bfeaff',14,120); }
          break;
        }
      }
      if(blocked) continue;
    }
    // —— 电磁球拦截:电磁球可挡下敌方的子弹与飞弹(范围弹伤害球体更多) ——
    if(!b.pierce&&b.type!=='droneLaser'){
      let blocked=false;
      for(const eb of emorbs){
        if(eb.team===b.team) continue;
        if(Math.hypot(b.x-eb.x,b.y-eb.y)<eb.r+4){
          eb.hp-=(b.aoe?22:9); impactFX(b.x,b.y,b.vx,'#b18cff',8);
          b.dead=true; blocked=true;
          if(eb.hp<=0){ eb.t=0; sparks(eb.x,eb.y,'#e0d0ff',14,130); }
          break;
        }
      }
      if(blocked) continue;
    }
    // —— 掩体拦截:掩体只挡下敌方的普通弹药 ——
    if(!b.aoe){
      let blocked=false;
      for(const cp of covers){
        if(cp.team===b.team) continue;
        if(b.x>cp.x-cp.w/2-2&&b.x<cp.x+cp.w/2+2&&b.y>GROUND-cp.h-2&&b.y<GROUND+2){
          cp.hp-=b.dmg||BULLET_DMG; impactFX(b.x,b.y,b.vx,'#9adcff',7);
          b.dead=true; blocked=true;
          break;
        }
      }
      if(blocked) continue;
    }
    for(const m of mechs){
      if(m.team===b.team||m.dead) continue;
      if(b.hitSet&&b.hitSet.has(m.id)) continue;             // 光束已穿透过该机
      if(Math.abs(b.x-m.x)<11*m.size+(b.r||0) && b.y>m.y-40*m.size && b.y<m.y-2){
        if(b.aoe){ explodeBullet(b,mechs); break; }
        impactFX(b.x,b.y,b.vx,'#ffd166',6);
        hitMech(m,b.dmg||BULLET_DMG,Math.sign(b.vx)||1,false);
        if(b.knock>60) m.vx+=(Math.sign(b.vx)||1)*b.knock*0.4;
        if(b.pierce){ (b.hitSet=b.hitSet||new Set()).add(m.id); }
        else b.dead=true;
        break;
      }
    }
    if(b.x<-12||b.x>W+12||b.y<-60||b.y>H+40) b.dead=true;
  }
  bullets=bullets.filter(b=>!b.dead);
}
function drawBullets(){
  for(const b of bullets){
    const x=Math.round(b.x), y=Math.round(b.y);
    const sc=b.sc||1;
    if(sc!==1){ g.save(); g.translate(x,y); g.scale(sc,sc); g.translate(-x,-y); }   // 隐藏机体:放大弹体
    if(b.type==='rocket'){
      g.save(); g.translate(x,y); g.rotate(b.ang);
      px(-5,-2,8,4,'#8a8f9a'); px(1,-1,3,2,'#ffb84d'); px(-7,-1,2,2,'#ff5a3c');
      g.restore();
    }else if(b.type==='laser'){
      g.save(); g.translate(x,y); g.rotate(b.ang);
      g.globalAlpha=0.4; px(-9,-1,18,3,'#5ff2ff'); g.globalAlpha=1;
      px(-9,0,18,1,'#ffffff');
      g.restore();
    }else if(b.type==='arc'){
      g.globalAlpha=0.5; px(x-2,y-2,4,4,'#64f0c8'); g.globalAlpha=1;
      px(x-1,y-1,2,2,'#eafffa');
    }else if(b.type==='homing'||b.type==='seeker'){
      g.save(); g.translate(x,y); g.rotate(b.ang);
      if(b.type==='homing'){ px(-4,-1,7,2,'#cfd6ea'); px(3,-1,2,2,'#7df9ff'); px(-6,0,2,1,'#ff9a4d'); }
      else{ px(-6,-2,10,4,'#3f4a5f'); px(4,-2,3,4,'#64f0c8'); px(-8,-1,2,2,'#ff5a3c'); }
      g.restore();
    }else if(b.type==='hellfire'){                           // 地狱火导弹:带焰尾的弧线追踪弹
      g.save(); g.translate(x,y); g.rotate(b.ang);
      g.globalAlpha=0.5; px(-8,-2,10,4,'#ff5b1b'); g.globalAlpha=1;
      px(-5,-2,7,4,'#8a8f9a'); px(1,-1,3,2,'#ffb84d'); px(-6,-1,3,2,'#ff3b1b');
      g.restore();
    }else if(b.type==='incendiary'){                         // 燃烧弹:咕嘟冒泡的橙色弹体
      g.save(); g.translate(x,y); g.rotate(b.ang*0.5);
      pixelCircle(0,0,4,'#5a3a20'); px(-3,-2,6,4,'#ff8c2a'); px(-2,-1,4,2,'#ffe27a');
      g.restore();
    }else if(b.type==='droneLaser'){                         // 浮游炮贯穿激光
      g.save(); g.translate(x,y);
      g.globalAlpha=0.4; px(-2,-20,4,40,'#7de3ff'); g.globalAlpha=1;
      px(-1,-20,2,40,'#eafffa');
      g.restore();
    }else if(b.type==='mortar'){
      g.save(); g.translate(x,y); g.rotate(b.ang*0.5);
      pixelCircle(0,0,3,'#5a6470'); px(-4,-1,2,2,'#3a3f4a'); px(2,-1,2,2,'#8a94a8');
      g.restore();
    }else if(b.type==='droneShot'){                          // 三连装浮游炮:短小青色点射弹
      g.save(); g.translate(x,y); g.rotate(b.ang);
      g.globalAlpha=0.4; px(-6,-1,8,2,'#7df9ff'); g.globalAlpha=1;
      px(-3,-1,5,2,'#bff6ff'); px(0,-1,2,2,'#ffffff');
      g.restore();
    }else{                                                   // rifle/vulcan/spread 通用弹丸
      const dir=Math.sign(b.vx)||1;
      g.globalAlpha=0.35; px(x-dir*5,y,4,1,'#ffb84d');
      g.globalAlpha=1;
      px(x-2,y-1,5,3,'#ffb84d');
      px(x-1,y,3,1,'#fff6d8');
    }
    if(sc!==1) g.restore();
  }
}

/* 凝固燃烧弹火海:持续 tick 灼烧范围内的敌对单位 + 火焰粒子 */
function updateFireZones(dt,mechs){
  for(const fz of fireZones){
    fz.t-=dt; fz.tick-=dt;
    if(fz.tick<=0){                            // 每 0.4s 对范围内单位结算一次灼烧
      fz.tick=0.4;
      for(const m of mechs){
        if(m.team===fz.team||m.dead) continue;
        if(Math.abs(m.x-fz.x)<fz.r*0.5 && Math.abs(m.y-GROUND)<46)
          hitMech(m,fz.dmg,(Math.sign(m.x-fz.x)||1)*18,false);
      }
    }
    if(Math.random()<0.7) particles.push({ x:fz.x+rnd(-fz.r*0.4,fz.r*0.4), y:GROUND-rnd(0,8),
      vx:rnd(-10,10), vy:rnd(-46,-16), life:rnd(0.3,0.6), max:0.6,
      col:['#ff8c2a','#ffd166','#ff5b1b'][ri(0,2)], sz:ri(1,2), g:-20 });
  }
  fireZones=fireZones.filter(fz=>fz.t>0);
}
function drawFireZones(){
  for(const fz of fireZones){
    const life=clamp(fz.t/fz.max,0,1), r=fz.r;
    g.globalAlpha=0.5*life; px(fz.x-r/2,GROUND-3,r,4,'#3a1408'); g.globalAlpha=1;   // 焦痕
    for(let i=0;i<8;i++){                                                          // 舞动火舌
      const fx=fz.x-r/2+(i+0.5)*(r/8)+Math.sin(T*9+i*2+fz.x)*1.5;
      const h=((i%3)*6+11)*(0.55+0.45*Math.sin(T*13+i))*life+3;
      g.globalAlpha=0.85*life; px(fx-2,GROUND-h,4,h,(i%2)?'#ff8c2a':'#ffd166');
      g.globalAlpha=0.6*life;  px(fx-1,GROUND-h-3,2,4,'#fff2c0');
    }
    g.globalAlpha=0.4*life; px(fz.x-r/2,GROUND-1,r,1,'#ff5b1b'); g.globalAlpha=1;  // 范围提示
  }
}
/* 浮游炮:自主飞至最近敌人正上方,周期性向下发射贯穿激光
 * 修复无人机(kind='heal'):跟随己方施放者,周期性为其充能回血 */
function updateDrones(dt,mechs){
  for(const d of drones){
    d.t-=dt; d.cd-=dt; d.hover+=dt*3;
    if(d.kind==='heal'){                       // —— 修复无人机 ——
      const owner=mechs.find(m=>m.id===d.own);
      if(owner&&!owner.dead){
        const tx=owner.x-owner.facing*26, ty=owner.y-54*owner.size;
        d.x+=(tx-d.x)*Math.min(1,dt*5); d.y+=(ty-d.y)*Math.min(1,dt*5)+Math.sin(d.hover)*0.4;
        if(d.cd<=0){ d.cd=1;                     // 每 1s 治疗一次
          if(owner.hp<owner.maxHp){
            const hl=Math.min(d.heal,owner.maxHp-owner.hp);
            owner.hp+=hl;
            dmgTexts.push({x:owner.x+rnd(-6,6),y:owner.y-44*owner.size,val:'+'+hl,col:'#8fffc0',life:0.7,max:0.7});
            sparks(owner.x,owner.y-24*owner.size,'#8fffc0',7,60);
          }
        }
      }else{ d.t=Math.min(d.t,0); }              // 施放者阵亡:无人机消散
      if(Math.random()<0.5) particles.push({x:d.x+rnd(-6,6),y:d.y+rnd(-4,4),vx:rnd(-6,6),vy:rnd(-6,6),life:0.25,max:0.25,col:'#8fffc0',sz:1,g:0});
      continue;
    }
    if(d.kind==='tri'){                        // —— 三连装浮游炮:3 连发点射,每轮随机 1~2s 冷却 ——
      let tgt=null,bd=1e9;
      for(const m of mechs){ if(m.team===d.team||m.dead) continue; const dd=Math.abs(m.x-d.x); if(dd<bd){bd=dd;tgt=m;} }
      if(tgt){
        const tx=tgt.x+(d.off||0), ty=tgt.y-70+(d.offY||0);
        let vx=(tx-d.x)*3.2, vy=(ty-d.y)*3.2;
        const sp=280, mag=Math.hypot(vx,vy)||1;
        if(mag>sp){ vx=vx/mag*sp; vy=vy/mag*sp; }
        d.x+=vx*dt; d.y+=vy*dt+Math.sin(d.hover)*0.5;
        const ready=Math.abs(d.x-tx)<34 && d.y<ty+40;
        if(d.burst>0){                           // 点射进行中
          d.burstT-=dt;
          if(d.burstT<=0){
            d.burst--; d.burstT=0.09;
            if(ready){
              const ang=Math.atan2((tgt.y-18*tgt.size)-d.y,tgt.x-d.x);
              bullets.push({ x:d.x, y:d.y+5, vx:Math.cos(ang)*540, vy:Math.sin(ang)*540,
                own:d.own, team:d.team, dmg:d.dmg, type:'droneShot', t:0, ang, knock:22, hitSet:null,
                sc:d.sz||1, r:((d.sz||1)-1)*6 });
              sparks(d.x,d.y+6,'#7df9ff',2,60); sfx.shoot();
            }
            if(d.burst<=0) d.cd=rnd(1,2);        // 每轮点射结束:随机 1~2 秒冷却
          }
        }else if(ready && d.cd<=0){ d.burst=3; d.burstT=0; }
      }
      if(Math.random()<0.5) particles.push({x:d.x+rnd(-5,5),y:d.y+rnd(-4,4),vx:rnd(-6,6),vy:rnd(-6,6),life:0.25,max:0.25,col:'#7df9ff',sz:1,g:0});
      continue;
    }
    let tgt=null,bd=1e9;
    for(const m of mechs){ if(m.team===d.team||m.dead) continue; const dd=Math.abs(m.x-d.x); if(dd<bd){bd=dd;tgt=m;} }
    if(tgt){
      const tx=tgt.x, ty=tgt.y-74;                        // 目标正上方
      let vx=(tx-d.x)*3.4, vy=(ty-d.y)*3.2;
      const sp=300, mag=Math.hypot(vx,vy)||1;
      if(mag>sp){ vx=vx/mag*sp; vy=vy/mag*sp; }
      d.x+=vx*dt; d.y+=vy*dt+Math.sin(d.hover)*0.4;
      if(d.cd<=0 && Math.abs(d.x-tx)<28 && d.y<ty+34){    // 已就位:向下贯穿射击
        d.cd=0.6; d.ang=Math.PI/2;
        bullets.push({ x:d.x, y:d.y+7, vx:0, vy:540, own:d.own, team:d.team,
          dmg:d.dmg, type:'droneLaser', pierce:true, t:0, ang:Math.PI/2, knock:26, hitSet:null,
          sc:d.sz||1, r:((d.sz||1)-1)*6 });
        sfx.shoot();
      }
    }
    if(Math.random()<0.5) particles.push({x:d.x+rnd(-6,6),y:d.y+rnd(-4,4),vx:rnd(-6,6),vy:rnd(-6,6),life:0.25,max:0.25,col:'#7de3ff',sz:1,g:0});
  }
  drones=drones.filter(d=>d.t>0);
}
function drawDrones(){
  for(const d of drones){
    const x=Math.round(d.x), y=Math.round(d.y);
    const bob=Math.round(Math.sin(d.hover)*1);
    const fade=clamp(d.t/0.6,0,1);                       // 消散淡出
    g.globalAlpha=fade;
    if(d.kind==='heal'){                                 // —— 修复无人机(绿白配色) ——
      g.globalAlpha=fade*(0.35+0.2*Math.sin(T*10));      // 悬浮光环
      px(x-7,y+2+bob,14,5,'#1f4d38'); g.globalAlpha=fade;
      px(x-6,y-3+bob,12,6,'#e8fff2');                    // 壳体
      px(x-4,y-2+bob,8,3,'#8fffc0');
      px(x-2,y-1+bob,4,2,'#ffffff');                     // 指示灯
      px(x-1,y+3+bob,2,3,'#7dffb0');
      const blink=0.5+0.5*Math.sin(T*16);                // 治疗脉冲环
      g.globalAlpha=fade*blink;
      px(x-9,y-1+bob,3,3,'#8fffc0'); px(x+6,y-1+bob,3,3,'#8fffc0');
      g.globalAlpha=1; continue;
    }
    if(d.kind==='tri'){                                  // —— 三连装浮游炮(青蓝配色) ——
      g.globalAlpha=fade*(0.35+0.2*Math.sin(T*10));
      px(x-7,y-3+bob,14,8,'#1f3a4d'); g.globalAlpha=fade;
      px(x-6,y-2+bob,12,6,'#2f5a7a');                    // 壳体
      px(x-3,y-1+bob,6,3,'#7df9ff');                     // 核心
      px(x-2,y+4+bob,4,3,'#2a3a4d');                     // 炮口
      const rdy = d.burst>0;
      g.globalAlpha=fade*(rdy?0.9:0.4+0.4*Math.sin(T*16));
      px(x-8,y+bob,3,2,'#7df9ff'); px(x+5,y+bob,3,2,'#7df9ff');  // 侧翼炮
      px(x-1,y+7+bob,2,rdy?4:2,'#eafffa');               // 发射蓄能
      g.globalAlpha=1; continue;
    }
    g.globalAlpha=fade*(0.35+0.2*Math.sin(T*10));        // 悬浮光环
    px(x-9,y-4+bob,18,9,'#2a3a4d'); g.globalAlpha=fade;
    px(x-7,y-3+bob,14,7,'#3f566e');                      // 壳体
    px(x-3,y-2+bob,6,3,'#7de3ff');                       // 核心
    px(x-2,y+3+bob,4,5,'#39424f');                       // 炮口
    g.globalAlpha=fade*(0.5+0.5*Math.sin(T*16));
    px(x-1,y+7+bob,2,3,'#eafffa');                       // 发射蓄能
    g.globalAlpha=1;
  }
}
/* 部署掩体:固定 HP 的合金墙,只拦截来袭的敌方弹药,不阻挡自己人 */
function updateCovers(dt,mechs){
  for(const cp of covers){
    cp.t-=dt;
    if(cp.hp<=0){ sparks(cp.x,GROUND-cp.h/2,'#9adcff',10,90); cp.t=0; continue; }
    if(Math.random()<0.35) particles.push({x:cp.x+rnd(-cp.w/2,cp.w/2),y:GROUND-rnd(2,10),
      vx:rnd(-6,6),vy:rnd(-14,-4),life:0.25,max:0.25,col:'#5a7a9a',sz:1,g:20});
  }
  covers=covers.filter(cp=>cp.t>0&&cp.hp>0);
}
function drawCovers(){
  for(const cp of covers){
    const x=Math.round(cp.x), bot=GROUND, w=cp.w, h=cp.h;
    const fade=clamp(cp.t/0.8,0,1);
    g.globalAlpha=fade;
    px(x-w/2-1,bot-h-1,w+2,h+1,'#0e141c');               // 外框
    px(x-w/2,bot-h,w,h,'#4a5a70');                        // 主体
    px(x-w/2,bot-h,w,3,'#7a8ea8');                        // 顶沿高光
    // 装甲纹理
    for(let i=1;i<3;i++) px(x-w/2+1,bot-h+i*(h/3),w-2,1,'#39465a');
    // 能量生命条
    const pct=clamp(cp.hp/cp.max,0,1);
    px(x-w/2,bot-h-4,w,2,'#1a2230');
    px(x-w/2,bot-h-4,Math.round(w*pct),2,pct>0.5?'#7de3ff':'#ffd166');
    g.globalAlpha=1;
  }
}
/* 寒冰球:缓慢前飞,阻挡敌方飞行道具,并对接触的敌人造成伤害与减速 */
function updateIceballs(dt,mechs){
  for(const ib of iceballs){
    ib.t-=dt; ib.x+=ib.vx*dt; ib.y+=ib.vy*dt;
    if(ib.x<8||ib.x>W-8) ib.vx*=-1;                       // 撞边反弹
    if(Math.random()<0.7) particles.push({x:ib.x+rnd(-ib.r,ib.r),y:ib.y+rnd(-ib.r,ib.r),
      vx:rnd(-8,8),vy:rnd(-14,-2),life:0.3,max:0.3,col:(ri(0,1)?'#bfeaff':'#eafffa'),sz:1,g:6});
    for(const m of mechs){                                 // 接触伤害(每球每目标 0.6s 一次)
      if(m.team===ib.team||m.dead) continue;
      ib.hitSet=ib.hitSet||new Set();
      if(ib.hitSet.has(m.id)) continue;
      if(Math.abs(m.x-ib.x)<ib.r+11*m.size && ib.y>m.y-40*m.size && ib.y<m.y-2){
        hitMech(m,ib.dmg,Math.sign(ib.vx)||1,false);
        m.slowT=Math.max(m.slowT||0,1.2);                  // 冻结减速
        ib.hitSet.add(m.id);
        sparks(m.x,m.y-22,'#bfeaff',10,90);
        ib.hp-=12;                                         // 撞击受损
        if(ib.hp<=0){ ib.t=0; sparks(ib.x,ib.y,'#eafffa',14,110); }
      }
    }
    // 每 0.6s 重置命中记录,使持续接触可反复生效
    ib.reSet=ib.reSet||0; ib.reSet-=dt;
    if(ib.reSet<=0){ ib.reSet=0.6; ib.hitSet=null; }
  }
  iceballs=iceballs.filter(ib=>ib.t>0&&ib.hp>0);
}
function drawIceballs(){
  for(const ib of iceballs){
    const x=Math.round(ib.x), y=Math.round(ib.y), r=ib.r;
    const fade=clamp(ib.t/0.6,0,1);
    g.globalAlpha=fade*0.35; pixelCircle(x,y,r+3,'#7fd8ff'); g.globalAlpha=fade;
    pixelCircle(x,y,r,'#bfeaff');
    pixelCircle(x,y,r-4,'#eafffa');
    // 冰晶棱面
    px(x-r+3,y-1,3,3,'#ffffff'); px(x+r-6,y+1,3,3,'#8fd8ff');
    px(x-1,y-r+3,3,3,'#ffffff'); px(x+1,y+r-6,3,3,'#8fd8ff');
    g.globalAlpha=1;
  }
}
/* 电磁球:向前缓慢漂浮,拦截敌方弹药,并对接触的敌人施加磁力干扰减速 */
function updateEmorbs(dt,mechs){
  for(const eb of emorbs){
    eb.t-=dt;
    eb.x+=eb.vx*dt;
    eb.ph=(eb.ph||0)+dt*6;
    eb.y+=Math.sin(eb.ph)*7*dt;                           // 上下轻微漂浮
    if(Math.random()<0.8) particles.push({x:eb.x+rnd(-eb.r,eb.r),y:eb.y+rnd(-eb.r,eb.r),
      vx:rnd(-12,12),vy:rnd(-16,4),life:0.32,max:0.32,col:ri(0,1)?'#b18cff':'#7df9ff',sz:1,g:0});
    for(const m of mechs){                                // 接触:磁力干扰(减速为主)
      if(m.team===eb.team||m.dead) continue;
      eb.hitSet=eb.hitSet||new Set();
      if(eb.hitSet.has(m.id)) continue;
      if(Math.abs(m.x-eb.x)<eb.r+11*m.size && eb.y>m.y-40*m.size && eb.y<m.y-2){
        m.slowT=Math.max(m.slowT||0,1.6);                 // 磁力干扰:降低移速
        if(eb.dmg>0) hitMech(m,eb.dmg,Math.sign(eb.vx)||1,false);
        eb.hitSet.add(m.id);
        sparks(m.x,m.y-22,'#b18cff',10,90);
        eb.hp-=10;                                        // 干扰消耗球体
        if(eb.hp<=0){ eb.t=0; sparks(eb.x,eb.y,'#e0d0ff',14,120); }
      }
    }
    // 每 0.7s 重置命中记录,使持续接触可反复生效
    eb.reSet=eb.reSet||0; eb.reSet-=dt;
    if(eb.reSet<=0){ eb.reSet=0.7; eb.hitSet=null; }
  }
  emorbs=emorbs.filter(eb=>eb.t>0&&eb.hp>0);
}
function drawEmorbs(){
  for(const eb of emorbs){
    const x=Math.round(eb.x), y=Math.round(eb.y), r=eb.r;
    const fade=clamp(eb.t/0.6,0,1)*clamp(eb.hp/12,0.3,1);
    g.globalAlpha=fade*0.35; pixelCircle(x,y,r+3,'#7df9ff'); g.globalAlpha=fade;
    pixelCircle(x,y,r,'#b18cff');
    pixelCircle(x,y,r-4,'#e6dbff');
    // 内部电极 + 环绕电弧
    px(x-1,y-1,2,2,'#ffffff');
    const a1=Math.round(Math.cos(eb.ph||0)*(r-2)), b1=Math.round(Math.sin(eb.ph||0)*(r-2));
    px(x+a1,y+b1,2,2,'#7df9ff'); px(x-a1,y-b1,2,2,'#7df9ff');
    g.globalAlpha=1;
  }
}
/* 雷击锁定:锁定最近的敌人,持续 3 秒、每 0.2s 落下一道闪电(1 秒 5 次) */
function updateLightnings(dt,mechs){
  for(const lt of lightnings){
    lt.t-=dt;
    const tgt=mechs.find(m=>m.id===lt.tgt&&!m.dead);
    if(!tgt){ lt.t=0; continue; }
    lt.x=tgt.x; lt.y=tgt.y-22*tgt.size;
    lt.gap-=dt;
    if(lt.gap<=0){
      lt.gap=0.2;
      hitMech(tgt,lt.dmg,0,false,true);                      // 持续伤害:不硬直
      sparks(lt.x,lt.y-40,'#c9a6ff',6,120);
    }
    if(Math.random()<0.6) particles.push({x:lt.x+rnd(-8,8),y:lt.y+rnd(-30,10),
      vx:rnd(-10,10),vy:rnd(-10,10),life:0.2,max:0.2,col:'#c9a6ff',sz:1,g:0});
  }
  lightnings=lightnings.filter(lt=>lt.t>0);
}
function drawLightnings(){
  for(const lt of lightnings){
    const x=Math.round(lt.x), yTop=Math.round(lt.y-120), yBot=Math.round(lt.y);
    g.globalAlpha=0.55;
    // 折线闪电主干:分段抖动
    for(let s=0;s<6;s++){
      const t0=s/6,t1=(s+1)/6;
      const y0=yTop+(yBot-yTop)*t0, y1=yTop+(yBot-yTop)*t1;
      const jx=Math.sin(T*40+s*3+lt.own)*4;
      px(x+jx-1,y0,3,y1-y0,'#c9a6ff');
    }
    g.globalAlpha=0.9;
    for(let s=0;s<6;s++){
      const t0=s/6,t1=(s+1)/6;
      const y0=yTop+(yBot-yTop)*t0, y1=yTop+(yBot-yTop)*t1;
      const jx=Math.sin(T*40+s*3+lt.own)*4;
      px(x+jx,y0,1,y1-y0,'#f0e6ff');
    }
    g.globalAlpha=1;
    px(x-2,yBot-1,5,2,'#eafffa');                          // 落点
  }
}
/* 飞行锁敌:±55° 锥内自动瞄准;隐身目标不可锁 */
function lockAngle(m,opp){
  const base=m.facing>0?0:Math.PI;
  if(!opp||opp.dead||opp.cloakT>0) return base;
  const dx=opp.x-m.x, dy=(opp.y-20*opp.size)-(m.y-24*m.size);
  if(Math.abs(dx)>8&&Math.sign(dx)!==m.facing) return base;   // 目标在背后不锁
  let diff=Math.atan2(dy,dx)-base;
  while(diff>Math.PI) diff-=2*Math.PI;
  while(diff<-Math.PI) diff+=2*Math.PI;
  return base+clamp(diff,-0.96,0.96);
}

/* 伤害数字:命中反馈,漂浮于受击者头顶 */
let dmgTexts=[];
function updateDmgTexts(dt){ for(const d of dmgTexts){ d.life-=dt; d.y-=34*dt; } dmgTexts=dmgTexts.filter(d=>d.life>0); }
function drawDmgTexts(){
  for(const d of dmgTexts){
    const sz=d.sz||9, life=clamp(d.life/d.max,0,1), age=1-life;
    const bx=Math.round(d.x), by=Math.round(d.y);
    // 弹入:出生瞬间由小放大(轻微回弹),暴击额外脉动,伤害越高越醒目
    let sc=0.5+0.5*Math.min(1,age/0.11);
    if(d.crit) sc+=0.12*Math.abs(Math.sin(age*22))*(1-age);
    const fsz=Math.max(1,Math.round(sz*sc));
    if(d.glow){                                   // 高伤:外扩光晕(暴击更强)
      g.globalAlpha=life*(0.22+0.30*Math.abs(Math.sin(T*11)));
      text(String(d.val),bx,by,fsz+(d.crit?12:6),d.col,'center');
    }
    if(d.crit){                                   // 暴击:四向放射光束
      g.globalAlpha=life*0.75;
      g.strokeStyle=d.col; g.lineWidth=1;
      const cy=by+fsz*0.4, L=fsz*1.6;
      for(let i=0;i<4;i++){
        const a=Math.PI/4+Math.PI/2*i;
        g.beginPath();
        g.moveTo(bx+Math.cos(a)*fsz*0.7, cy+Math.sin(a)*fsz*0.7);
        g.lineTo(bx+Math.cos(a)*L,       cy+Math.sin(a)*L);
        g.stroke();
      }
      g.globalAlpha=1;
    }
    g.globalAlpha=life;
    // 四向黑描边 + 投影:复杂背景下依然清晰
    text(String(d.val),bx-1,by,fsz,'rgba(0,0,0,.85)','center');
    text(String(d.val),bx+1,by,fsz,'rgba(0,0,0,.85)','center');
    text(String(d.val),bx,by-1,fsz,'rgba(0,0,0,.85)','center');
    text(String(d.val),bx,by+1,fsz,'rgba(0,0,0,.85)','center');
    text(String(d.val),bx+2,by+2,fsz,'rgba(0,0,0,.9)','center');
    text(String(d.val),bx,by,fsz,d.col,'center');
    if(d.glow){                                   // 高伤:白芯闪烁
      g.globalAlpha=life*(0.45+0.45*Math.abs(Math.sin(T*14)));
      text(String(d.val),bx,by,fsz,'#ffffff','center');
    }
  }
  g.globalAlpha=1;
}

/* 地图专属危险:周期性 预警→爆发 的区域伤害(kind 决定判定与绘制)
 * bolt 电网浪涌(闪电柱,全域高度) / whirl 流沙旋风(横向移动扫过) / ice 冰锥坠落(落点溅射)
 * lava 岩浆喷泉(地面喷发) / debris 碎星横掠(残骸横向扫过中低空) / light 圣光倾泻(神殿光柱)
 * glitch 数据裂隙(虚拟空间错位撕裂) */
const HAZ_INFO=[
  {kind:'bolt',   name:'电网浪涌', col:'#7de3ff', warn:1.0, live:0.55, dmg:9,  tmin:5.5, tmax:9.5},
  {kind:'whirl',  name:'流沙旋风', col:'#e8c07a', warn:0.8, live:2.8,  dmg:8,  tmin:6.0, tmax:10.0},
  {kind:'ice',    name:'冰锥坠落', col:'#bfe8ff', warn:1.0, live:0.5,  dmg:10, tmin:5.5, tmax:9.5},
  {kind:'lava',   name:'岩浆喷泉', col:'#ff8c2a', warn:1.1, live:0.9,  dmg:12, tmin:6.0, tmax:10.0},
  {kind:'debris', name:'碎星横掠', col:'#9fb6ff', warn:1.0, live:1.0,  dmg:11, tmin:6.0, tmax:10.0},
  {kind:'light',  name:'圣光倾泻', col:'#ffe9a8', warn:1.2, live:0.6,  dmg:10, tmin:6.0, tmax:10.0},
  {kind:'glitch', name:'数据裂隙', col:'#ff5bd8', warn:0.9, live:0.7,  dmg:11, tmin:5.5, tmax:9.5},
];
let haz={phase:'idle',t:3,x:W/2,dir:1,hit:[false,false],imp:false,tmr:0};
function resetHazards(){ haz={phase:'idle',t:rnd(2.5,4.5),x:rnd(60,W-60),dir:Math.random()<.5?1:-1,hit:[false,false],imp:false,tmr:0}; }
function updateHazards(dt){
  if(game.state!=='fight'||!game.mechs.length) return;
  const info=HAZ_INFO[game.mapIdx]||HAZ_INFO[0];
  const kind=info.kind;
  haz.tmr+=dt;
  if(haz.phase==='idle'){
    haz.t-=dt;
    if(haz.t<=0){ haz.phase='warn'; haz.tmr=0; haz.hit=[false,false]; haz.imp=false;
      haz.x=rnd(60,W-60); haz.dir=Math.random()<.5?1:-1; }
  }else if(haz.phase==='warn'){
    if(haz.tmr>=info.warn){ haz.phase='live'; haz.tmr=0; }
  }else{
    if(kind==='whirl'||kind==='debris'){            // 旋风/碎星残骸:横向推移
      haz.x+=haz.dir*85*dt;
      if(haz.x<24||haz.x>W-24){ haz.dir*=-1; haz.x=clamp(haz.x,24,W-24); }
    }
    for(let i=0;i<game.mechs.length;i++){
      const m=game.mechs[i];
      if(m.dead||haz.hit[i]) continue;
      let inZone=false;
      if(kind==='bolt')        inZone=Math.abs(m.x-haz.x)<24;                  // 闪电柱:全域高度
      else if(kind==='whirl')  inZone=Math.abs(m.x-haz.x)<20&&m.y>GROUND-46;   // 旋风:贴地扫过
      else if(kind==='lava')   inZone=Math.abs(m.x-haz.x)<20&&m.y>GROUND-104;  // 岩浆柱:中低空
      else if(kind==='debris') inZone=Math.abs(m.x-haz.x)<30&&m.y>GROUND-150;  // 碎星:中低空横掠
      else if(kind==='light')  inZone=Math.abs(m.x-haz.x)<22;                  // 圣光:全域高度
      else if(kind==='glitch') inZone=Math.abs(m.x-haz.x)<18&&m.y>GROUND-90;   // 裂隙:近地错位
      if(inZone){ haz.hit[i]=true; hitMech(m,info.dmg,(Math.sign(m.x-haz.x)||1)*90,false); }
    }
    if(kind==='ice'&&!haz.imp&&haz.tmr>=info.live){   // 冰锥落地溅射
      haz.imp=true;
      sparks(haz.x,GROUND-4,'#bfe8ff',12,150); game.shake=Math.max(game.shake,3.5); sfx.boom();
      for(let i=0;i<game.mechs.length;i++){
        const m=game.mechs[i];
        if(!m.dead&&!haz.hit[i]&&Math.abs(m.x-haz.x)<30&&m.y>GROUND-40){
          haz.hit[i]=true; hitMech(m,info.dmg,0,false);
        }
      }
    }
    if(haz.tmr>=info.live){ haz.phase='idle'; haz.t=rnd(info.tmin,info.tmax); }
  }
}
function drawHazards(){
  if(haz.phase==='idle'||!game.mechs.length) return;
  if(game.state!=='fight'&&game.state!=='ko') return;
  const info=HAZ_INFO[game.mapIdx]||HAZ_INFO[0];
  const kind=info.kind;
  const x=Math.round(haz.x);
  if(haz.phase==='warn'){                          // 预警:地面标记 + 感叹号
    const blink=Math.sin(T*14)>0;
    g.globalAlpha=blink?0.8:0.3;
    px(x-14,GROUND-2,28,2,info.col);
    px(x-1,GROUND-26,3,14,info.col); px(x-1,GROUND-8,3,3,info.col);
    g.globalAlpha=1;
    if(kind==='lava'&&blink){ g.globalAlpha=0.3; px(x-8,GROUND-6,16,4,'#ff5b1a'); g.globalAlpha=1; }
    if(kind==='bolt'&&blink){ px(x-1,GROUND-64,2,10,'#7de3ff'); px(x-1,GROUND-46,2,8,'#7de3ff'); }
    if(kind==='light'&&blink){ g.globalAlpha=0.22; px(x-16,0,32,GROUND,'#ffe9a8'); g.globalAlpha=1; }
    if(kind==='glitch'&&blink){ for(let i=0;i<4;i++) px(x-10+ri(-6,6),GROUND-20-i*18,ri(6,16),2,'#ff5bd8'); }
    return;
  }
  const pr=clamp(haz.tmr/info.live,0,1);
  if(kind==='bolt'){                               // 闪电柱
    let yy=0,xx=x;
    g.globalAlpha=0.9;
    while(yy<GROUND){
      const ny=Math.min(GROUND,yy+ri(10,20)), nx=x+ri(-8,8);
      px(Math.min(xx,nx),yy,Math.max(2,Math.abs(nx-xx)),Math.max(2,ny-yy),'#bfe9ff');
      xx=nx; yy=ny;
    }
    g.globalAlpha=0.3; pixelCircle(x,GROUND-10,18,'#7de3ff'); g.globalAlpha=1;
  }else if(kind==='whirl'){                        // 流沙旋风
    for(let i=0;i<6;i++){
      const yy=GROUND-6-i*9, wdt=26-i*3, off=Math.round(Math.sin(T*10+i*1.4)*6);
      g.globalAlpha=0.3+0.09*i;
      px(x-wdt/2+off,yy,wdt,3,i%2?'#e8c07a':'#c9924f');
    }
    g.globalAlpha=1;
  }else if(kind==='ice'){                          // 冰锥坠落
    const fy=-24+pr*(GROUND+16);
    g.fillStyle='#bfe8ff';
    g.beginPath(); g.moveTo(x-5,fy); g.lineTo(x+5,fy); g.lineTo(x,fy+22); g.closePath(); g.fill();
    px(x-1,fy-12,2,12,'rgba(191,232,255,.45)');
  }else if(kind==='debris'){                       // 碎星横掠(旋转残骸)
    const dy=GROUND-92+Math.round(Math.sin(T*3)*10);
    g.save(); g.translate(x,dy); g.rotate(T*4);
    px(-16,-7,32,14,'#33405c'); px(-16,-7,32,3,'#5d7396');
    px(-9,-2,18,4,'#9fb6ff');
    g.restore();
    g.globalAlpha=0.28; pixelCircle(x,dy,20,'#9fb6ff'); g.globalAlpha=1;
    if(Math.random()<0.6) particles.push({x:x+rnd(-14,14),y:dy+rnd(-8,8),vx:rnd(-60,-10),vy:rnd(-30,30),life:rnd(0.2,0.5),max:0.5,col:'#cfdcff',sz:2,g:60});
  }else if(kind==='light'){                        // 圣光倾泻(神殿光柱)
    g.globalAlpha=0.28+0.12*Math.abs(Math.sin(T*9));
    px(x-9,0,18,GROUND,'#ffe9a8');
    g.globalAlpha=0.5;
    px(x-3,0,6,GROUND,'#fff6d0');
    g.globalAlpha=1;
    for(let i=0;i<5;i++){
      const yy=((T*90+i*54)%GROUND);
      px(x-8+Math.round(Math.sin(T*4+i)*6),GROUND-yy,3,7,'#fff6d0');
    }
    g.globalAlpha=0.3; pixelCircle(x,GROUND-8,20,'#ffe9a8'); g.globalAlpha=1;
  }else if(kind==='glitch'){                       // 数据裂隙(错位撕裂)
    for(let yy=GROUND;yy>GROUND-96;yy-=7){
      const off=Math.round(Math.sin(T*16+yy*0.3)*6);
      g.globalAlpha=0.55+0.35*Math.abs(Math.sin(T*12+yy));
      px(x-8+off,yy,ri(4,14),5,(yy%14<7)?'#ff5bd8':'#5ff2ff');
    }
    g.globalAlpha=0.35; pixelCircle(x,GROUND-10,20,'#ff5bd8'); g.globalAlpha=1;
  }else{                                           // 岩浆喷泉
    const env=pr<0.2?pr/0.2:(pr>0.7?(1-pr)/0.3:1);
    const hgt=Math.round(105*env);
    for(let yy=GROUND;yy>GROUND-hgt;yy-=6){
      const wdt=Math.max(3,10-((GROUND-yy)*0.05|0))+ri(0,3);
      g.globalAlpha=0.85;
      px(x-wdt/2+Math.round(Math.sin(T*20+yy)*2),yy,wdt,5,(yy%12<6)?'#ff8c2a':'#ffd166');
    }
    g.globalAlpha=1;
    if(Math.random()<0.5) particles.push({x:x+rnd(-8,8),y:GROUND-hgt,vx:rnd(-40,40),vy:rnd(-80,-30),life:rnd(0.3,0.6),max:0.6,col:'#ffd166',sz:2,g:260});
  }
}
