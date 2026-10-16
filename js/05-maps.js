/* =========================================================================
 * 机甲对决 MECH DUEL · 05-maps.js
 * 地图系统:7 张战场与机关绘制
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 4. 地图系统:7 张可选战场 ----------------
 * 设计空间 960×540(地面线 MG=472),渲染时按 SC/2 变换铺满画布;
 * 每张地图:{name, tag, build(d) 预生成随机元素, draw(t) 绘制(含动画)} */
const MW=960, MH=540, MG=472;
const BX=380;   // 地图元素生成余量(相机拉远时两侧仍有楼宇/山体等景致)
const BGE=460;  // 背景底色扩展范围(配合 ZMIN,保证拉到最远也不露底)
function genWindows(w,h,density,ww,wh,sx,sy){
  const arr=[];
  for(let gx=sx;gx<w-ww;gx+=sx) for(let gy=sy;gy<h-wh;gy+=sy)
    if(Math.random()<density) arr.push({gx,gy,c:Math.random()<.72?'#ffd98a':'#7de3ff',fl:Math.random()<.05});
  return arr;
}
function px(x,y,w,h,c){ g.fillStyle=c; g.fillRect(x,y,w,h); }
function pixelCircle(cx,cy,r,c){
  g.fillStyle=c;
  for(let dy=-r;dy<=r;dy++){ const w=Math.floor(Math.sqrt(r*r-dy*dy)); g.fillRect(cx-w,cy+dy,w*2,1); }
}
const MAPS=[
/* —— 地图 1:夜幕都市(经典) —— */
{ name:'夜幕都市', tag:'霓虹不夜城 · 均衡战场',
  build(d){
    d.stars=Array.from({length:150},()=>({x:ri(0,MW),y:ri(0,300),p:rnd(0,6),s:Math.random()<.25?3:2}));
    d.far=[]; { let x=-BX; while(x<MW+BX){ const w=ri(52,92),h=ri(56,132); d.far.push({x,w,h}); x+=w+ri(4,18); } }
    d.near=[];{ let x=-BX; while(x<MW+BX){ const w=ri(72,124),h=ri(104,224);
      d.near.push({x,w,h,win:genWindows(w,h,.42,2,5,9,14),ant:Math.random()<.35}); x+=w+ri(8,30); } }
    d.debris=Array.from({length:22},()=>({x:ri(0,MW),w:ri(3,10),h:ri(2,4),dy:ri(8,52)}));
    d.cars=Array.from({length:6},()=>({x:rnd(0,MW),y:ri(120,280),sp:rnd(50,110)*(Math.random()<.5?1:-1),c:Math.random()<.5?'#ff5b5b':'#ffe9a8'}));
    d.rain=Array.from({length:70},()=>({x:rnd(-40,MW),y:rnd(0,MH),sp:rnd(300,430)}));
  },
  draw(t){
    const d=this.data;
    px(-BX,-100,MW+2*BX,100,'#0b0e1d');
    ['#0b0e1d','#12122b','#1a1438','#251a45','#311f4e'].forEach((c,i)=>px(-BX,i*88,MW+2*BX,88,c));
    px(-BX,440,MW+2*BX,32,'#3b2656');
    for(const s of d.stars){ g.globalAlpha=0.4+0.6*Math.abs(Math.sin(t*1.5+s.p)); px(s.x,s.y,s.s,s.s,'#dfe8ff'); }
    g.globalAlpha=1;
    pixelCircle(796,84,30,'#e8e4d8');
    pixelCircle(786,76,6,'#cfcaba'); pixelCircle(804,92,4,'#cfcaba'); pixelCircle(802,72,2,'#cfcaba');
    // 云层遮月(缓慢飘过)
    { const mcx=((t*9)%(MW+320))-160;
      g.globalAlpha=0.92;
      pixelCircle(mcx,80,26,'#141830'); pixelCircle(mcx+22,88,20,'#141830'); pixelCircle(mcx-24,90,18,'#141830');
      pixelCircle(mcx+6,72,16,'#1a1f3c');
      g.globalAlpha=1; }
    for(const b of d.far) px(b.x,MG-b.h,b.w,b.h,'#1b2140');
    // 飞行车流(楼宇间穿梭)
    for(const c of d.cars){
      const x=((c.x+t*c.sp)%(MW+240)+(MW+240))%(MW+240)-120;
      const yy=c.y+Math.sin(t*2+c.y)*3;
      px(x,yy,9,3,'#1d2440');
      px(x+(c.sp>0?8:0),yy+1,2,1,c.c);
      g.globalAlpha=0.5; px(x+(c.sp>0?-5:10),yy+1,4,1,c.c); g.globalAlpha=1;
    }
    for(const b of d.near){
      px(b.x,MG-b.h,b.w,b.h,'#141a33');
      px(b.x,MG-b.h,b.w,2,'#232c52');
      for(const wd of b.win){
        if(wd.fl && Math.sin(t*7+wd.gx)>0.4) continue;
        px(b.x+wd.gx,MG-b.h+wd.gy,2,5,wd.c);
      }
      if(b.ant){ const ax=b.x+(b.w>>1); px(ax,MG-b.h-24,1,24,'#232c52'); px(ax-2,MG-b.h-28,4,4,(t*2%2<1)?'#ff5b5b':'#5b1f1f'); }
    }
    // 霓虹全息广告牌(变色+闪烁)
    { const ncol=['#ff5bd8','#5ff2ff','#ffe27a'][(t*0.7|0)%3];
      const on=Math.sin(t*9)>-0.8;
      g.globalAlpha=on?0.30:0.08; px(324,178,72,34,ncol); g.globalAlpha=1;
      px(326,180,68,30,'#0d1226');
      if(on) for(let i=0;i<4;i++) px(332,186+i*6,52-((i*17)%30),3,ncol);
    }
    g.globalAlpha=0.06; g.fillStyle='#cfe4ff';
    g.beginPath(); g.moveTo(84,120);  g.lineTo(300,MG); g.lineTo(60,MG);  g.closePath(); g.fill();
    g.beginPath(); g.moveTo(876,120); g.lineTo(904,MG); g.lineTo(660,MG); g.closePath(); g.fill();
    g.globalAlpha=1;
    px(80,116,4,MG-116,'#2a3350'); px(72,112,12,4,'#39466e'); px(74,124,10,3,'#ffe9a8');
    px(872,116,4,MG-116,'#2a3350'); px(864,112,12,4,'#39466e'); px(866,124,10,3,'#ffe9a8');
    px(-BX,MG,MW+2*BX,180,'#262b36');
    px(-BX,MG,MW+2*BX,4,'#3a4152');
    px(-BX,MG+4,MW+2*BX,2,'#1d2129');
    g.globalAlpha=0.25;
    for(let x=26;x<MW;x+=52) px(x,MG+8,1,MH-MG,'#000');
    g.globalAlpha=1;
    for(const db of d.debris) px(db.x,MG+db.dy,db.w,db.h,'#171b24');
    // 雨丝(前景)
    g.globalAlpha=0.26;
    for(const r of d.rain){
      const y=(r.y+t*r.sp)%(MH+40)-20;
      px(r.x-y*0.06,y,1,5,'#7de3ff');
    }
    g.globalAlpha=1;
  } },
/* —— 地图 2:荒漠遗址 —— */
{ name:'荒漠遗址', tag:'落日黄沙 · 视野开阔',
  build(d){
    d.stars=Array.from({length:46},()=>({x:ri(0,MW),y:ri(0,150),p:rnd(0,6),s:2}));
    d.mesas=[]; { let x=-BX; while(x<MW+BX){ const w=ri(90,190),h=ri(28,74); d.mesas.push({x,w,h}); x+=w+ri(60,180); } }
    d.dunes=[{x:120,y:MG+46,r:110},{x:470,y:MG+70,r:180},{x:830,y:MG+40,r:130}];
    d.cols=[]; { let x=70; while(x<MW-60){ if(Math.random()<.6){ const h=ri(24,84);
      d.cols.push({x,h,broken:Math.random()<.5,top:Math.random()<.4}); } x+=ri(70,150); } }
    d.dust=Array.from({length:26},()=>({x:ri(0,MW),y:ri(300,464),p:rnd(0,6),sp:rnd(8,20)}));
    d.rocks=Array.from({length:14},()=>({x:ri(0,MW),w:ri(4,12),h:ri(2,5),dy:ri(6,50)}));
    d.birds=Array.from({length:3},()=>({cx:rnd(180,MW-180),cy:ri(70,140),r:ri(40,80),p:rnd(0,6),sp:rnd(0.2,0.45)}));
    d.sand=Array.from({length:9},()=>({x:rnd(0,MW),y:ri(MG-70,MG-8),w:ri(50,140),sp:rnd(40,95),o:rnd(0.06,0.13)}));
    for(const c of d.cols) if(Math.random()<.45) c.flag=true;
  },
  draw(t){
    const d=this.data;
    px(-BX,-100,MW+2*BX,100,'#2b1b3d');
    ['#2b1b3d','#4b2340','#7a3046','#b5543c','#e08a4c'].forEach((c,i)=>px(-BX,i*88,MW+2*BX,88,c));
    for(const s of d.stars){ g.globalAlpha=0.3+0.5*Math.abs(Math.sin(t+s.p)); px(s.x,s.y,2,2,'#ffe8d0'); }
    g.globalAlpha=1;
    // 落日(下半截扫描线切口)
    pixelCircle(620,375,55,'#ffd98a');
    px(565,398,110,3,'#e08a4c'); px(565,408,110,3,'#e08a4c'); px(565,417,110,4,'#e08a4c'); px(565,425,110,5,'#e08a4c');
    // 秃鹫盘旋剪影
    for(const b of d.birds){
      const a=t*b.sp+b.p;
      const x=b.cx+Math.cos(a)*b.r, y=b.cy+Math.sin(a*2)*10;
      const f=Math.round(2*Math.sin(t*6+b.p));
      px(x-7,y-f,6,2,'#2e1a26'); px(x+1,y-f,6,2,'#2e1a26'); px(x-1,y+1,2,2,'#2e1a26');
    }
    px(-BX,440,MW+2*BX,32,'#e89a54');
    // 远山台地
    for(const m of d.mesas){ px(m.x,MG-m.h,m.w,m.h+10,'#5a2f42'); px(m.x,MG-m.h,m.w,4,'#6b3a4a'); }
    // 金字塔剪影
    g.fillStyle='#4a2a3c';
    g.beginPath(); g.moveTo(660,MG+6); g.lineTo(760,MG-118); g.lineTo(860,MG+6); g.closePath(); g.fill();
    // 沙丘
    for(const du of d.dunes) pixelCircle(du.x,du.y,du.r,'#c9924f');
    // 残柱
    for(const c of d.cols){
      px(c.x-3,MG-4,20,4,'#8a5f43');
      px(c.x,MG-4-c.h,14,c.h,'#a3724e');
      px(c.x,MG-4-c.h,14,3,'#c08a5e');
      if(c.broken) px(c.x+2,MG-4-c.h-8,10,8,'#a3724e');
      if(c.top) px(c.x+16,MG-10,26,6,'#8a5f43');
      if(c.flag){
        const fy=MG-4-c.h-(c.broken?8:0);
        px(c.x+7,fy-9,1,9,'#6b3a2a');
        for(let r2=0;r2<6;r2++) px(c.x+8,fy-9+r2,8+Math.round(3*Math.sin(t*6+c.x+r2*1.3)),1,'#c9542e');
      }
    }
    // 沙地
    px(-BX,MG,MW+2*BX,180,'#e0aa62');
    px(-BX,MG,MW+2*BX,4,'#f0c27a');
    g.globalAlpha=0.2;
    for(let y=MG+14;y<MH+90;y+=14) px(-BX,y,MW+2*BX,2,'#a3724e');
    g.globalAlpha=1;
    for(const r of d.rocks) px(r.x,MG+r.dy,r.w,r.h,'#b0824c');
    // 沙尘卷流(贴地滚动)
    for(const s of d.sand){
      const x=((s.x+t*s.sp)%(MW+240)+(MW+240))%(MW+240)-120;
      g.globalAlpha=s.o;
      px(x,s.y,s.w,3,'#f0d8a8');
      px(x+16,s.y-3,(s.w*0.6)|0,2,'#f0d8a8');
    }
    g.globalAlpha=1;
    // 热浪升腾(扭曲线)
    g.globalAlpha=0.09;
    for(let i=0;i<7;i++){
      const hx=70+i*140;
      for(let y=0;y<30;y+=6) px(hx+Math.round(3*Math.sin(t*3+i+y*0.5)),MG-46+y,9,2,'#ffe8c0');
    }
    g.globalAlpha=1;
    // 飘尘
    for(const p of d.dust){
      const x=(p.x+t*p.sp)%MW, y=p.y+Math.sin(t*2+p.p)*4;
      g.globalAlpha=0.25+0.2*Math.sin(t*3+p.p);
      px(x,y,2,2,'#f0d8a8');
    }
    g.globalAlpha=1;
  } },
/* —— 地图 3:冰原哨站 —— */
{ name:'冰原哨站', tag:'极光雪原 · 寒风凛冽',
  build(d){
    d.stars=Array.from({length:120},()=>({x:ri(0,MW),y:ri(0,260),p:rnd(0,6),s:Math.random()<.3?3:2}));
    d.mounts=[]; { let x=-BX; while(x<MW+BX){ const w=ri(160,300),h=ri(90,190); d.mounts.push({x,w,h}); x+=w-ri(20,90); } }
    d.flakes=Array.from({length:90},()=>({x:ri(0,MW),y:ri(0,MH),s:ri(2,3),sp:rnd(24,50),p:rnd(0,6)}));
    d.cracks=Array.from({length:10},()=>({x:ri(20,MW-40),y:MG+ri(10,52),len:ri(14,40),up:Math.random()<.5}));
    d.crates=[{x:120},{x:142},{x:131,up:1}];
    d.glints=Array.from({length:16},()=>({x:ri(20,MW-24),y:MG+ri(10,64),p:rnd(0,6)}));
    d.gusts=Array.from({length:8},()=>({x:rnd(0,MW),y:ri(110,MG-30),sp:rnd(150,260),len:ri(26,66)}));
  },
  draw(t){
    const d=this.data;
    px(-BX,-100,MW+2*BX,100,'#050912');
    ['#050912','#071022','#0a1830','#0d2238','#123044'].forEach((c,i)=>px(-BX,i*88,MW+2*BX,88,c));
    px(-BX,440,MW+2*BX,32,'#16394c');
    for(const s of d.stars){ g.globalAlpha=0.35+0.55*Math.abs(Math.sin(t*1.2+s.p)); px(s.x,s.y,s.s,s.s,'#e8f4ff'); }
    g.globalAlpha=1;
    // 极光帘幕
    for(let band=0;band<2;band++){
      g.globalAlpha=0.10;
      g.fillStyle=band?'#5ff2ff':'#7dffb0';
      for(let x=0;x<MW;x+=10){
        const h=56+34*Math.sin(x*0.011+t*0.8+band*2.2)+18*Math.sin(x*0.023-t*0.5);
        g.fillRect(x,50+band*44,10,Math.max(10,h));
      }
    }
    g.globalAlpha=1;
    // 雪山
    for(const m of d.mounts){
      g.fillStyle='#10263c';
      g.beginPath(); g.moveTo(m.x,MG+6); g.lineTo(m.x+m.w/2,MG-m.h); g.lineTo(m.x+m.w,MG+6); g.closePath(); g.fill();
      g.fillStyle='#cfe8f5';
      const cx=m.x+m.w/2, cap=m.h*0.32;
      g.beginPath(); g.moveTo(cx-m.w*0.14,MG-m.h+cap); g.lineTo(cx,MG-m.h); g.lineTo(cx+m.w*0.14,MG-m.h+cap); g.closePath(); g.fill();
    }
    // 哨站穹顶 + 天线
    pixelCircle(740,MG+6,30,'#7a9ab5');
    px(716,MG-6,48,6,'#5a7a95');
    px(728,MG-24,10,8,'#ffe9a8');
    px(758,MG-66,2,40,'#3e5a74'); px(755,MG-70,8,4,(t*2%2<1)?'#ff5b5b':'#5b1f1f');
    // 穹顶探照灯(来回扫射)
    g.save();
    g.translate(740,MG-24);
    g.rotate(Math.sin(t*0.7)*1.0-0.35);
    g.globalAlpha=0.09; g.fillStyle='#fff2c9';
    g.beginPath(); g.moveTo(0,0); g.lineTo(190,-44); g.lineTo(190,16); g.closePath(); g.fill();
    g.restore();
    g.globalAlpha=1;
    // 货箱
    for(const c of d.crates){ const yy=c.up?MG-16:MG; px(c.x,yy-14,20,14,'#3e5a74'); px(c.x,yy-14,20,3,'#5a7a95'); }
    // 冰面
    px(-BX,MG,MW+2*BX,180,'#b9cfe2');
    px(-BX,MG,MW+2*BX,4,'#eef6ff');
    g.globalAlpha=0.35;
    for(const c of d.cracks){ px(c.x,c.y,c.len,2,'#7a98b5'); px(c.x+(c.up?c.len-6:0),c.y-2,6,2,'#7a98b5'); }
    g.globalAlpha=1;
    // 冰面闪光(星点反射)
    for(const gl of d.glints){
      if(Math.sin(t*2+gl.p)>0.86){ px(gl.x,gl.y,3,1,'#ffffff'); px(gl.x+1,gl.y-1,1,3,'#ffffff'); }
    }
    // 飘雪
    for(const f of d.flakes){
      const y=(f.y+t*f.sp)%MH, x=(f.x+Math.sin(t+f.p)*14+MW)%MW;
      px(x,y,f.s,f.s,'#eef6ff');
    }
    // 横向阵风(雪线横掠)
    g.globalAlpha=0.13;
    for(const w2 of d.gusts){
      const x=((w2.x+t*w2.sp)%(MW+200)+(MW+200))%(MW+200)-100;
      px(x,w2.y,w2.len,1,'#eef6ff');
      px(x+8,w2.y+2,(w2.len/2)|0,1,'#cfe8f5');
    }
    g.globalAlpha=1;
  } },
/* —— 地图 4:熔岩工厂 —— */
{ name:'熔岩工厂', tag:'高温车间 · 火星四溅',
  build(d){
    d.chims=[]; { let x=30; while(x<MW-40){ const w=ri(34,60),h=ri(110,210); d.chims.push({x,w,h,p:rnd(0,6)}); x+=w+ri(60,140); } }
    d.chains=[]; { let x=60; while(x<MW-30){ if(Math.random()<.7) d.chains.push({x,len:ri(40,120)}); x+=ri(90,170); } }
    d.embers=Array.from({length:36},()=>({x:ri(0,MW),p:rnd(0,6),sp:rnd(26,60)}));
    d.bubbles=Array.from({length:12},()=>({x:ri(10,MW-10),r:ri(3,7),p:rnd(0,6)}));
    d.seams=Array.from({length:9},(_,i)=>({x:40+i*110+ri(-14,14)}));
    d.vents=Array.from({length:5},()=>({x:ri(40,MW-60),p:rnd(0,6)}));
    d.alarms=[{x:150},{x:480},{x:810}];
  },
  draw(t){
    const d=this.data;
    px(-BX,-100,MW+2*BX,100,'#160a0a');
    ['#160a0a','#1e0d0b','#26100d','#2e150f','#361a11'].forEach((c,i)=>px(-BX,i*88,MW+2*BX,88,c));
    px(-BX,440,MW+2*BX,32,'#3c1f12');
    // 墙面板缝
    g.globalAlpha=0.25;
    for(const s of d.seams) px(s.x,0,2,440,'#000');
    g.globalAlpha=1;
    // 烟囱 + 烟雾
    for(const c of d.chims){
      px(c.x,MG-c.h,c.w,c.h+10,'#120808');
      px(c.x-3,MG-c.h,c.w+6,6,'#1f0e0c');
      px(c.x+4,MG-c.h+8,4,4,(t*1.5+c.p)%2<1?'#ff5b5b':'#4a1a1a');
      for(let i=0;i<3;i++){
        const yy=(MG-c.h-10)-((t*16+i*36+c.p*10)%108);
        g.globalAlpha=0.16;
        pixelCircle(c.x+c.w/2+Math.sin(t+i*2+c.p)*8, yy, 8+i*3, '#8a7a72');
      }
      g.globalAlpha=1;
    }
    // 顶部横梁 + 吊链
    px(-BX,0,MW+2*BX,26,'#0d0708'); px(-BX,26,MW+2*BX,4,'#2e1a14');
    for(let x=24-BX;x<MW+BX;x+=48) px(x,6,6,6,'#1f1210');
    for(const c of d.chains){
      const sw=Math.sin(t*1.4+c.x*0.05);
      for(let y=30;y<30+c.len;y+=8) px(c.x+Math.round(sw*(y-30)*0.06),y,3,5,'#3a2a24');
      px(c.x-2+Math.round(sw*c.len*0.06),30+c.len,7,6,'#4a362c');
    }
    // 警报灯脉冲
    { const al=0.5+0.5*Math.sin(t*4);
      for(const a of d.alarms){
        g.globalAlpha=0.25+0.55*al; px(a.x,30,6,4,'#ff3b30');
        g.globalAlpha=0.10*al;  pixelCircle(a.x+3,36,24,'#ff3b30');
        g.globalAlpha=1;
      }
    }
    // 熔岩光晕(映在墙面)
    g.globalAlpha=0.10+0.04*Math.sin(t*2);
    px(-BX,MG-70,MW+2*BX,70,'#ff6a1a');
    g.globalAlpha=1;
    // 金属地面
    px(-BX,MG,MW+2*BX,44,'#2e2a2c');
    px(-BX,MG,MW+2*BX,4,'#4a3a34');
    g.globalAlpha=0.3;
    for(let x=30-BX;x<MW+BX;x+=64) px(x,MG+6,2,34,'#0d0708');
    g.globalAlpha=1;
    // 发光裂缝
    for(let x=44;x<MW;x+=128){
      g.globalAlpha=0.5+0.4*Math.abs(Math.sin(t*3+x));
      px(x,MG+16,26,3,'#ff8c2a'); px(x+8,MG+19,10,2,'#ffd166');
    }
    g.globalAlpha=1;
    // 地面蒸汽喷射(周期性)
    for(const v of d.vents){
      const ph=(t*0.8+v.p)%2.4;
      if(ph<1.1){
        for(let i=0;i<3;i++){
          const yy=MG-6-((ph*60+i*26)%110);
          const prog=(MG-6-yy)/110;
          g.globalAlpha=0.20*(1-prog);
          pixelCircle(v.x+Math.sin(t*2+i)*6*prog, yy, 4+Math.round(9*prog), '#c9c2ba');
        }
        g.globalAlpha=1;
      }
    }
    // 警示条纹
    for(let x=-BX;x<MW+BX;x+=24){ px(x,MG+40,12,4,'#c9a52a'); px(x+12,MG+40,12,4,'#241a18'); }
    // 熔岩池(前景下缘)
    px(-BX,MG+44,MW+2*BX,130,'#ff6a1a');
    px(-BX,MG+44,MW+2*BX,3,'#ffd166');
    g.globalAlpha=0.5;
    for(let x=20-BX;x<MW+BX;x+=90) px(x,MG+52+((x*7)%12)+Math.round(2*Math.sin(t*2+x*0.05)),26,4,'#c9461a');
    g.globalAlpha=1;
    for(const b of d.bubbles){
      const r=b.r*(0.6+0.4*Math.sin(t*4+b.p));
      g.globalAlpha=0.8; pixelCircle(b.x,MG+52+(b.p*7|0)%10,Math.max(2,r|0),'#ffd166');
    }
    g.globalAlpha=1;
    // 火星升腾
    for(const e of d.embers){
      const yy=MG+44-((t*e.sp+e.p*40)%150);
      const xx=(e.x+Math.sin(t*3+e.p)*10+MW)%MW;
      g.globalAlpha=clamp((MG+44-yy)/30,0,1)*0.9;
      px(xx,yy,2,2,(e.p%2<1)?'#ffd166':'#ff8c2a');
    }
    g.globalAlpha=1;
  } },
/* —— 地图 5:轨道残骸 —— */
{ name:'轨道残骸', tag:'近地轨道 · 失重残骸',
  build(d){
    d.stars=Array.from({length:210},()=>({x:ri(-BX,MW+BX),y:ri(0,392),p:rnd(0,6),s:Math.random()<.18?3:2}));
    d.hulls=[]; { let x=-BX; while(x<MW+BX){ const w=ri(46,96),h=ri(48,150);
      d.hulls.push({x,w,h,lit:Math.random()<.5}); x+=w+ri(10,52); } }
    d.debris=Array.from({length:16},()=>({x:rnd(-BX,MW+BX),y:ri(60,420),s:ri(6,18),p:rnd(0,6),sp:rnd(0.3,0.8)}));
    d.streaks=Array.from({length:5},()=>({x:rnd(0,MW),y:ri(40,MG-40),len:ri(60,150),sp:rnd(60,140)}));
  },
  draw(t){
    const d=this.data;
    px(-BX,-100,MW+2*BX,MG+100,'#03050c');
    // 母星弧面(近地轨道)
    pixelCircle(600,760,340,'#123a52');
    g.globalAlpha=0.5; pixelCircle(600,764,340,'#1d5a76'); g.globalAlpha=1;
    g.globalAlpha=0.16;
    for(let i=0;i<8;i++) px(60+i*110,404+i*6,90,6,'#3ea0c8');
    g.globalAlpha=1;
    for(const s of d.stars){ g.globalAlpha=0.35+0.65*Math.abs(Math.sin(t*1.4+s.p)); px(s.x,s.y,s.s,s.s,'#dfe8ff'); }
    g.globalAlpha=1;
    // 流星横掠
    for(const st of d.streaks){
      const x=((st.x+t*st.sp)%(MW+300)+(MW+300))%(MW+300)-150;
      g.globalAlpha=0.5;
      px(x,st.y,st.len,1,'#bfe9ff'); px(x+Math.round(st.len*0.6),st.y,Math.round(st.len*0.4),1,'#7de3ff');
      g.globalAlpha=1;
    }
    // 空间站外壳(远景)
    for(const h of d.hulls){
      px(h.x,MG-h.h,h.w,h.h,'#1a2338');
      px(h.x,MG-h.h,h.w,3,'#2e3f60');
      g.globalAlpha=0.5;
      for(let y=MG-h.h+10;y<MG-6;y+=12) px(h.x+3,y,h.w-6,2,'#0d1424');
      g.globalAlpha=1;
      if(h.lit){ g.globalAlpha=0.4+0.4*Math.abs(Math.sin(t*2+h.x)); px(h.x+Math.round(h.w*0.28),MG-h.h+8,5,5,'#7de3ff'); g.globalAlpha=1; }
    }
    // 悬浮残骸(缓慢旋转漂移)
    for(const b of d.debris){
      const x=b.x+Math.sin(t*b.sp+b.p)*22, y=b.y+Math.cos(t*b.sp*0.8+b.p)*16;
      g.save(); g.translate(Math.round(x),Math.round(y)); g.rotate(t*b.sp+b.p);
      px(-b.s/2,-b.s/4,b.s,b.s/2,'#33405c'); px(-b.s/2,-b.s/4,b.s,2,'#4d5f80');
      g.restore();
    }
    // 轨道平台地面
    px(-BX,MG,MW+2*BX,180,'#1c2740');
    px(-BX,MG,MW+2*BX,4,'#39507a');
    px(-BX,MG+4,MW+2*BX,2,'#0e1626');
    g.globalAlpha=0.35;
    for(let x=26-BX;x<MW+BX;x+=64) px(x,MG+8,2,MH-MG,'#0a1020');
    for(let y=MG+18;y<MH;y+=26) px(-BX,y,MW+2*BX,1,'#0a1020');
    g.globalAlpha=1;
    for(let x=40;x<MW;x+=140){ const on=Math.sin(t*3+x)>0; px(x,MG+16,4,4,on?'#ff9a5b':'#4a2a20'); }
  } },
/* —— 地图 6:远古神殿 —— */
{ name:'远古神殿', tag:'失落遗迹 · 圣光倾泻',
  build(d){
    d.cols=[]; { let x=20; while(x<MW-20){ d.cols.push({x,w:ri(14,22),h:ri(90,210),broken:Math.random()<.35}); x+=ri(80,150); } }
    d.arches=[{x:180},{x:560},{x:820}];
    d.vines=Array.from({length:14},()=>({x:ri(20,MW-20),y:ri(0,120),len:ri(30,110),p:rnd(0,6)}));
    d.runes=Array.from({length:18},()=>({x:ri(30,MW-30),y:ri(MG-150,MG-20),p:rnd(0,6),c:Math.random()<.5?'#7dffd0':'#ffe9a8'}));
    d.fireflies=Array.from({length:30},()=>({x:rnd(0,MW),y:ri(120,MG),p:rnd(0,6),sp:rnd(0.3,0.9)}));
    d.motes=Array.from({length:40},()=>({x:rnd(0,MW),y:rnd(0,MG),sp:rnd(6,18),p:rnd(0,6),s:Math.random()<.3?2:1}));
    d.shafts=[{x:200,w:120},{x:640,w:150}];
  },
  draw(t){
    const d=this.data;
    px(-BX,-100,MW+2*BX,MG+100,'#07130f');
    ['#07130f','#0c1e18','#123026','#183c2f','#1f4a38'].forEach((c,i)=>px(-BX,i*88,MW+2*BX,88,c));
    px(-BX,440,MW+2*BX,32,'#24523c');
    // 圣光柱(自上而下的锥形光)
    for(const s of d.shafts){
      g.globalAlpha=0.09+0.04*Math.sin(t*1.6+s.x*0.05);
      g.fillStyle='#ffe9a8';
      g.beginPath(); g.moveTo(s.x,0); g.lineTo(s.x+s.w,0); g.lineTo(s.x+s.w*1.5,MG); g.lineTo(s.x-s.w*0.5,MG); g.closePath(); g.fill();
      g.globalAlpha=1;
    }
    // 顶部藤蔓(摆动)
    for(const v of d.vines){
      const sw=Math.sin(t*1.1+v.p)*4;
      for(let y=v.y;y<v.y+v.len;y+=10) px(v.x+Math.round(sw*Math.sin(y*0.1)),y,3,10,'#1c4432');
      px(v.x+Math.round(sw*Math.sin((v.y+v.len)*0.1)),v.y+v.len-6,4,6,'#2a5c42');
    }
    // 石柱(含雕纹/断头)
    for(const c of d.cols){
      px(c.x,MG-c.h,c.w,c.h,'#3a4a3c');
      px(c.x,MG-c.h,c.w,4,'#5a6e56');
      if(c.broken) px(c.x-2,MG-c.h-10,c.w+4,10,'#4a5c48');
      g.globalAlpha=0.35;
      for(let y=MG-c.h+12;y<MG-10;y+=22) px(c.x+3,y,c.w-6,2,'#243026');
      g.globalAlpha=1;
    }
    // 残拱门
    for(const a of d.arches){
      px(a.x,MG-120,10,120,'#3a4a3c'); px(a.x+70,MG-120,10,120,'#3a4a3c');
      px(a.x,MG-130,80,12,'#4a5c48'); px(a.x+16,MG-142,48,12,'#5a6e56');
    }
    // 悬空符文(明灭)
    for(const r of d.runes){
      if(Math.sin(t*2.4+r.p)>0.55){
        g.globalAlpha=0.5+0.4*Math.abs(Math.sin(t*5+r.p));
        px(r.x,r.y,3,3,r.c); px(r.x-1,r.y+1,5,1,r.c);
      }
    }
    g.globalAlpha=1;
    // 石板地面
    px(-BX,MG,MW+2*BX,180,'#5a6a52');
    px(-BX,MG,MW+2*BX,4,'#7d8f6e');
    g.globalAlpha=0.3;
    for(let x=40-BX;x<MW+BX;x+=84) px(x,MG+4,2,MH-MG,'#39452f');
    for(let y=MG+22;y<MH;y+=26) px(-BX,y,MW+2*BX,2,'#39452f');
    g.globalAlpha=1;
    for(let i=0;i<16;i++) px(30+i*56,MG+8+((i*13)%40),ri(6,16),ri(2,5),'#42563a');
    // 萤火 + 尘埃
    for(const f of d.fireflies){
      g.globalAlpha=0.3+0.5*Math.abs(Math.sin(t*3+f.p));
      px(f.x+Math.sin(t*f.sp+f.p)*14,f.y+Math.sin(t*0.8+f.p)*10,2,2,'#e8ffb0');
    }
    for(const mo of d.motes){
      g.globalAlpha=0.2;
      px((mo.x+Math.sin(t+mo.p)*8+MW)%MW,(mo.y+t*mo.sp)%MG,mo.s,mo.s,'#ffe9a8');
    }
    g.globalAlpha=1;
  } },
/* —— 地图 7:数据深渊 —— */
{ name:'数据深渊', tag:'虚拟深潜 · 数据裂隙',
  build(d){
    d.bars=[]; { let x=0; while(x<MW){ d.bars.push({x,w:ri(40,110)}); x+=ri(60,150); } }
    d.cubes=Array.from({length:16},()=>({x:rnd(-BX,MW+BX),y:ri(80,420),s:ri(8,22),p:rnd(0,6),sp:rnd(0.4,1.1),c:Math.random()<.5?'#5ff2ff':'#ff5bd8'}));
    d.glitch=Array.from({length:10},()=>({x:ri(0,MW),y:ri(30,MG),w:ri(30,120),h:ri(2,5),p:rnd(0,6)}));
    d.stream=Array.from({length:60},()=>({x:ri(0,MW),y:rnd(0,MG),sp:rnd(30,90),len:ri(4,14),c:Math.random()<.5?'#5ff2ff':'#9a6bff'}));
    d.nodes=Array.from({length:22},()=>({x:ri(0,MW),y:ri(MG+6,MH+60),p:rnd(0,6)}));
  },
  draw(t){
    const d=this.data;
    px(-BX,-100,MW+2*BX,MG+100,'#05060f');
    ['#05060f','#080a1e','#0b1030','#0e1542','#111a52'].forEach((c,i)=>px(-BX,i*88,MW+2*BX,88,c));
    px(-BX,440,MW+2*BX,32,'#1a2160');
    // 透视网格(向地平线汇聚)
    g.globalAlpha=0.35; g.strokeStyle='#2a3a9a'; g.lineWidth=1;
    for(let i=0;i<=12;i++){ const bx2=i*80; g.beginPath(); g.moveTo(bx2,0); g.lineTo(240+(bx2-240)*0.25,MG); g.stroke(); }
    for(let y=0;y<MG;y+=34){ g.beginPath(); g.moveTo(-BX,y); g.lineTo(MW+BX,y); g.stroke(); }
    g.globalAlpha=1;
    // 数据柱(高度脉动)
    for(const b of d.bars){
      const hh=60+180*Math.abs(Math.sin(t*0.9+b.x*0.01));
      g.globalAlpha=0.12; px(b.x,MG-hh,b.w,hh,'#5ff2ff');
      g.globalAlpha=0.5;  px(b.x,MG-hh,b.w,2,'#9affff');
      g.globalAlpha=1;
    }
    // 悬浮数据立方(旋转发光框)
    for(const c of d.cubes){
      const x=c.x+Math.sin(t*c.sp+c.p)*18, y=c.y+Math.cos(t*c.sp*0.7+c.p)*14;
      const s=c.s*(0.85+0.15*Math.sin(t*3+c.p));
      g.globalAlpha=0.7; g.strokeStyle=c.c; g.lineWidth=1;
      g.strokeRect(Math.round(x-s/2),Math.round(y-s/2),Math.round(s),Math.round(s));
      g.globalAlpha=0.2; px(x-s/2,y-s/2,s,2,c.c);
      g.globalAlpha=1;
    }
    // 故障彩条
    for(const gl of d.glitch){
      if(Math.sin(t*7+gl.p)>0.6){ g.globalAlpha=0.5; px(gl.x,gl.y,gl.w,gl.h,Math.random()<.5?'#ff5bd8':'#5ff2ff'); g.globalAlpha=1; }
    }
    // 下落数据流
    for(const s of d.stream){
      const y=(s.y+t*s.sp)%MG;
      g.globalAlpha=0.6; px(s.x,y,1,s.len,s.c); px(s.x,y,1,2,'#ffffff');
      g.globalAlpha=1;
    }
    // 深渊地面(线框)
    px(-BX,MG,MW+2*BX,180,'#0a1030');
    px(-BX,MG,MW+2*BX,4,'#3a5adf');
    g.globalAlpha=0.4;
    for(let x=30-BX;x<MW+BX;x+=56) px(x,MG+6,2,MH-MG,'#1c2a6e');
    for(let y=MG+20;y<MH;y+=22) px(-BX,y,MW+2*BX,1,'#1c2a6e');
    g.globalAlpha=1;
    for(const n of d.nodes) px(n.x,n.y,3,3,Math.sin(t*4+n.p)>0.2?'#5ff2ff':'#182a66');
  } },
];
function buildBackground(){ for(const m of MAPS){ m.data={}; m.build(m.data); } }
/* 各图底色(延伸铺底用):sky 天空 / ground 地面,与各地图自身配色一致 */
const MAP_BG=[
  {sky:'#0b0e1d', ground:'#262b36'},
  {sky:'#2b1b3d', ground:'#e0aa62'},
  {sky:'#050912', ground:'#b9cfe2'},
  {sky:'#160a0a', ground:'#ff6a1a'},
  {sky:'#03050c', ground:'#1c2740'},
  {sky:'#07130f', ground:'#5a6a52'},
  {sky:'#05060f', ground:'#0a1030'},
];
function drawBackground(t){
  const m=MAPS[game.mapIdx]||MAPS[0];
  const bg=MAP_BG[game.mapIdx]||MAP_BG[0];
  // 先按地图配色大范围铺底,再叠加地图细节 —— 相机拉到最远也不露底
  px(-BGE,-BGE,MW+2*BGE,MG+BGE,bg.sky);
  px(-BGE,MG,MW+2*BGE,MH-MG+BGE,bg.ground);
  m.draw(t);
}
