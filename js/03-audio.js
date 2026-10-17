/* =========================================================================
 * 机甲对决 MECH DUEL · 03-audio.js
 * 音效与多轨 MIDI 音序器(WebAudio 合成,无外部素材)
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 2. 音效 & 背景音乐(WebAudio 复古芯片音 + 多轨音序器) ---------------- */
let AC = null, noiseBuf = null, MGAIN = null;
function initAudio(){
  if(AC) return;
  try{
    AC = new (window.AudioContext||window.webkitAudioContext)();
    noiseBuf = AC.createBuffer(1, AC.sampleRate*0.5, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    MGAIN = AC.createGain(); MGAIN.gain.value = 0.5; MGAIN.connect(AC.destination);
    musicResume();                          // 首帧输入前若已在某界面,补起对应音轨
  }catch(e){}
}
function tone(type,f0,f1,dur,vol){
  if(!AC) return;
  const o=AC.createOscillator(), gn=AC.createGain(), t=AC.currentTime;
  o.type=type; o.frequency.setValueAtTime(f0,t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30,f1),t+dur);
  gn.gain.setValueAtTime(vol,t); gn.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(gn).connect(AC.destination); o.start(t); o.stop(t+dur);
}
function noise(dur,vol,f){
  if(!AC) return;
  const s=AC.createBufferSource(), gn=AC.createGain(), fl=AC.createBiquadFilter(), t=AC.currentTime;
  s.buffer=noiseBuf; fl.type='lowpass'; fl.frequency.setValueAtTime(f,t);
  fl.frequency.exponentialRampToValueAtTime(120,t+dur);
  gn.gain.setValueAtTime(vol,t); gn.gain.exponentialRampToValueAtTime(0.001,t+dur);
  s.connect(fl).connect(gn).connect(AC.destination); s.start(t); s.stop(t+dur);
}
/* 音效:在原有主音之上再叠低频"体感层"与高频"亮边层",打击更厚实 */
const sfx = {
  shoot(){ tone('square',900,180,0.07,0.09); tone('sawtooth',1500,320,0.05,0.045); noise(0.05,0.09,5200); },
  swing(){ noise(0.09,0.07,3600); tone('sawtooth',260,1100,0.09,0.055); },
  hit(){ noise(0.11,0.24,2600); tone('square',190,58,0.11,0.16); tone('triangle',95,30,0.13,0.11); tone('square',820,240,0.05,0.06); },
  guard(){ tone('triangle',230,150,0.07,0.15); tone('square',1150,700,0.05,0.05); noise(0.05,0.10,4200); },
  jump(){ tone('square',200,470,0.09,0.055); tone('triangle',120,300,0.09,0.04); },
  dash(){ tone('sawtooth',620,180,0.12,0.06); noise(0.12,0.09,3200); },
  boom(){ noise(0.6,0.34,1000); tone('sawtooth',130,38,0.55,0.20); tone('sine',70,32,0.6,0.16); },
  ko(){ tone('sawtooth',450,50,0.75,0.17); tone('square',700,120,0.5,0.08); noise(0.45,0.22,1300); },
  round(){ tone('square',523,523,0.09,0.09); tone('triangle',262,262,0.2,0.06); setTimeout(()=>tone('square',784,784,0.14,0.09),110); },
  ui(){ tone('square',880,880,0.05,0.06); tone('square',1320,1320,0.05,0.03); },
  cast(){ tone('square',340,780,0.13,0.07); tone('triangle',680,1560,0.13,0.05); noise(0.09,0.045,3200); },
  beam(){ tone('sawtooth',1400,340,0.34,0.09); tone('square',700,180,0.34,0.05); noise(0.2,0.05,6000); },
  missile(){ noise(0.28,0.10,3200); tone('sawtooth',520,900,0.22,0.05); },
  heal(){ tone('sine',660,1320,0.16,0.10); tone('triangle',440,880,0.24,0.04); setTimeout(()=>tone('sine',990,1980,0.2,0.09),90); },
  shield(){ tone('sine',300,900,0.22,0.09); tone('triangle',600,1800,0.24,0.06); noise(0.12,0.04,5000); }
};
/* 技能 id → 专属音色(叠加在通用施放音上,突出技能类型) */
const SKILL_SFX={ healDrone:'heal', eshield:'shield', fortify:'shield', cloak:'shield', cover:'shield',
  twinlaser:'beam', judgement:'beam', arcburst:'beam', lightning:'beam', marklock:'beam', fullburst:'beam',
  rebuildfield:'heal',
  missileSalvo:'missile', hellfire:'missile', rocketsalvo:'missile', rocketBarrage:'missile',
  mortarBarrage:'missile', incendiary:'missile',
  hammerorbit:'swing', quakewave:'boom', groundburst:'boom', shieldbreak:'shield',
  mechbird:'beam', antidrone:'shield', reveal:'shield',
  suppressfire:'shoot', smokebomb:'shield', ironcharge:'swing', bulwark:'shield', ammodrop:'heal',
  railpiercer:'beam', afterimage:'swing', windblade:'beam', backflip:'swing', tailwind:'shield',
  siegecannon:'missile', aegis:'shield', executionshot:'beam', grapple:'swing', clusterbomb:'missile',
  voidstab:'swing', nightfall:'shield', meteorcharge:'boom', teslacoil:'shield', rocketjump:'missile',
  dive:'swing', flare:'shield', phasewings:'swing', dronebarrage:'beam', prismwall:'shield', repairfield:'heal',
  divinebeam:'beam', seraphrush:'swing', orbitaljudgement:'missile', sanctuary:'shield', grace:'heal',
  singularity:'boom', voidstep:'swing', entropyrain:'missile', nullfield:'shield', devour:'heal' };

/* ---------------- 2b. 多轨 MIDI 音序器(纯 WebAudio 合成,无外部素材/库) ----------------
 * 贴合游戏叙事:title 序章静谧 / menu 机库电子 / story 荒原叙事 / battle 遭遇战 /
 * boss 隐藏机体决战 / spectate 观赏守擂。每轨由若干 part 构成,part.seq 为空格分隔
 * 步进记号:'.' 休止、'-' 延长上一音、k/s/h/H 鼓(底鼓/军鼓/闭镲/开镲)、音名如
 * A4 / C#3,'+' 连接表示和弦同时发音。步长 = 60/bpm/div,以 0.35s 前瞻调度。 */
const SEMI={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
function mNote(nm){
  const m=/^([A-G][#b]?)(-?\d)$/.exec(nm); if(!m) return 0;
  return 440*Math.pow(2,((parseInt(m[2],10)+1)*12+SEMI[m[1]]-69)/12);
}
function mADSR(g,t,dur,a,dec,peak){
  peak=Math.max(0.0002,peak);
  const ta=t+Math.max(0.001,Math.min(a,dur*0.45));
  const td=ta+Math.max(0.001,Math.min(dec,dur*0.3));
  const tr=Math.max(td+0.0005,t+dur*0.8);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,ta);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak*0.6),td);
  g.gain.setValueAtTime(Math.max(0.0002,peak*0.6),tr);
  g.gain.linearRampToValueAtTime(0.0001,t+dur);
}
function mVoice(type,f,t,dur,vol,opt){
  opt=opt||{};
  if(!AC||!f) return;
  const g=AC.createGain(), a=opt.a||0.008, dec=opt.dec||Math.min(0.14,dur*0.4);
  const node=AC.createOscillator(); node.type=type; node.frequency.setValueAtTime(f,t);
  let tail=node;
  if(opt.lp){ const fl=AC.createBiquadFilter(); fl.type='lowpass'; fl.frequency.setValueAtTime(opt.lp,t); node.connect(fl); tail=fl; }
  tail.connect(g); g.connect(MGAIN||AC.destination);
  mADSR(g,t,dur,a,dec,vol); node.start(t); node.stop(t+dur+0.02);
  if(opt.detune){                          // 第二振荡器微失谐 → 声部加厚
    const n2=AC.createOscillator(), g2=AC.createGain();
    n2.type=type; n2.frequency.setValueAtTime(f,t); n2.detune.setValueAtTime(opt.detune,t);
    g2.gain.value=0.6; n2.connect(g2); g2.connect(g); n2.start(t); n2.stop(t+dur+0.02);
  }
}
function mKick(t,vol){
  if(!AC) return;
  const o=AC.createOscillator(), g=AC.createGain();
  o.type='sine'; o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(42,t+0.13);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
  o.connect(g); g.connect(MGAIN||AC.destination); o.start(t); o.stop(t+0.22);
}
function mSnare(t,vol){
  if(!AC) return;
  const s=AC.createBufferSource(), fl=AC.createBiquadFilter(), g=AC.createGain();
  s.buffer=noiseBuf; fl.type='highpass'; fl.frequency.value=1400;
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.14);
  s.connect(fl).connect(g).connect(MGAIN||AC.destination); s.start(t); s.stop(t+0.15);
  const o=AC.createOscillator(), g2=AC.createGain();
  o.type='triangle'; o.frequency.setValueAtTime(200,t); o.frequency.exponentialRampToValueAtTime(120,t+0.1);
  g2.gain.setValueAtTime(vol*0.7,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.12);
  o.connect(g2); g2.connect(MGAIN||AC.destination); o.start(t); o.stop(t+0.13);
}
function mHat(t,vol,open){
  if(!AC) return;
  const d=open?0.16:0.045;
  const s=AC.createBufferSource(), fl=AC.createBiquadFilter(), g=AC.createGain();
  s.buffer=noiseBuf; fl.type='highpass'; fl.frequency.value=7200;
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+d);
  s.connect(fl).connect(g).connect(MGAIN||AC.destination); s.start(t); s.stop(t+d+0.01);
}
const INST={
  lead:(f,t,d,v)=>mVoice('square',f,t,d,v,{detune:8,lp:2600,a:0.006}),
  pluck:(f,t,d,v)=>mVoice('sawtooth',f,t,Math.min(d,0.26),v,{lp:1900,a:0.004,dec:0.1}),
  pad:(f,t,d,v)=>mVoice('sawtooth',f,t,d,v,{detune:9,lp:820,a:0.28,dec:0.3}),
  bass:(f,t,d,v)=>mVoice('square',f,t,d,v,{lp:560,a:0.006,dec:0.08}),
  stab:(f,t,d,v)=>mVoice('square',f,t,Math.min(d,0.14),v,{lp:3000,a:0.004,dec:0.06}),
  bell:(f,t,d,v)=>{ mVoice('sine',f,t,Math.min(d,1.2),v,{a:0.005,dec:0.5});
                    mVoice('sine',f*2.76,t,Math.min(d,0.6),v*0.22,{a:0.004,dec:0.3}); }
};
/* —— 编曲辅助:把 16/32 步动机扩展为 3~5 段式长循环 ——
 * __tr 移调(支持和弦) / __sec 规整到 32 步 / __arr 按和声计划拼接 / __drums 加鼓点过门。
 * 每首 BGM 循环长度均超过 15 秒,并通过移调、留白和过门制造段落变化。 */
const __NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const __FLAT={Cb:'B',Db:'C#',Eb:'D#',Fb:'E',Gb:'F#',Ab:'G#',Bb:'A#'};
function __tr(seq,n){
  if(!n) return seq;
  return seq.trim().split(/\s+/).map(tok=>{
    if(tok==='.'||tok==='-'||/^[khsH]$/.test(tok)) return tok;
    return tok.split('+').map(nm=>{
      const m=/^([A-G][#b]?)(-?\d+)$/.exec(nm); if(!m) return nm;
      let name=m[1]; if(name.endsWith('b')) name=__FLAT[name]||name;
      const pc=__NOTE_NAMES.indexOf(name); if(pc<0) return nm;
      const midi=12*(parseInt(m[2],10)+1)+pc+n;
      const oct=Math.floor(midi/12)-1, p=((midi%12)+12)%12;
      return __NOTE_NAMES[p]+oct;
    }).join('+');
  }).join(' ');
}
function __sec(seq,n=32){
  const tk=seq.trim().split(/\s+/);
  if(tk.length>=n) return tk.slice(0,n).join(' ');
  const out=tk.slice(); while(out.length<n) out.push(...tk);
  return out.slice(0,n).join(' ');
}
function __arr(seq,plan){
  const base=__sec(seq,32);
  return plan.map(v=>v===null?Array(32).fill('.').join(' '):__tr(base,v)).join(' ');
}
function __drums(seq,plan){
  const base=__sec(seq,32).split(/\s+/);
  return plan.map(fill=>{
    const a=base.slice();
    if(fill){ a[28]='s'; a[29]='s'; a[30]='h'; a[31]='H'; }
    return a.join(' ');
  }).join(' ');
}
const MUSIC={
  title:{ bpm:74, div:4, parts:[
    {inst:'pad',  vol:0.20, seq:__arr('D3+A3+F4 - - - - - - - A#2+F3+D4 - - - - - - - F3+A3+C4 - - - - - - - C3+G3+E4 - - - - - - -',[0,3,0])},
    {inst:'bass', vol:0.22, seq:__arr('D2 - - - - - - - A#1 - - - - - - - F2 - - - - - - - C2 - - - - - - -',[0,3,0])},
    {inst:'bell', vol:0.16, seq:__arr('- - - - F5 - - - - - - - D5 - - - - - - - C5 - - - - - - A4 - - - -',[0,null,0])}
  ]},
  menu:{ bpm:106, div:4, parts:[
    {inst:'pad',  vol:0.14, seq:__arr('A2+E3+C4 - - - - - - - F2+C3+A3 - - - - - - - C3+G3+E4 - - - - - - - G2+D3+B3 - - - - - - -',[0,0,3,5])},
    {inst:'bass', vol:0.22, seq:__arr('A2 . A2 . A2 . A2 . F2 . F2 . F2 . F2 . C3 . C3 . C3 . C3 . G2 . G2 . G2 . G2 .',[0,0,3,5])},
    {inst:'pluck',vol:0.13, seq:__arr('A3 C4 E4 A4 E4 C4 A3 E4 F3 A3 C4 F4 C4 A3 F3 A3 C4 E4 G4 C5 G4 E4 C4 E4 G3 B3 D4 G4 D4 B3 G3 D4',[0,3,5,3])},
    {inst:'drum', vol:0.09, seq:__drums('h . h . h . h . h . h . h . h . h . h . h . h . h . h . h . h .',[0,0,0,1])}
  ]},
  story:{ bpm:80, div:4, parts:[
    {inst:'pad',  vol:0.18, seq:__arr('D3+A3+F4 - - - - - - - A#2+F3+D4 - - - - - - - G2+D3+A#3 - - - - - - - A2+E3+C#4 - - - - - - -',[0,5,0])},
    {inst:'bass', vol:0.20, seq:__arr('D2 - - - D2 - - - A#1 - - - A#1 - - - G1 - - - G1 - - - A1 - - - A1 - - -',[0,5,0])},
    {inst:'bell', vol:0.15, seq:__arr('- D5 - - F5 - - - - - E5 - - D5 - - - - - A#4 - - A4 - - - - - C#5 - - -',[0,null,0])}
  ]},
  battle:{ bpm:140, div:4, parts:[
    {inst:'bass', vol:0.26, seq:__arr('A2 . A2 . A2 . A2 . F2 . F2 . F2 . F2 . C3 . C3 . C3 . C3 . E2 . E2 . E2 . E2 .',[0,0,5,3,0])},
    {inst:'drum', vol:0.30, seq:__drums('k . h . s . h k k . h . s . h . k . h . s . h k k . h . s . h .',[0,0,1,0,1])},
    {inst:'lead', vol:0.16, seq:__arr('A4 . C5 E5 . D5 C5 A4 F4 . A4 C5 . A4 F4 D4 E4 . G4 C5 . B4 G4 E4 D4 . F4 A4 . G#4 A4 B4',[0,3,5,3,0])},
    {inst:'stab', vol:0.12, seq:__arr('A3+C4+E4 . . . . . . . F3+A3+C4 . . . . . . . C4+E4+G4 . . . . . . . E3+G#3+B3 . . . . . . .',[0,0,5,3,0])}
  ]},
  boss:{ bpm:152, div:4, parts:[
    {inst:'drum', vol:0.32, seq:__drums('k . h k s . h . k . h k s . h s k . h k s . h . k . h k s . h s',[0,0,1,0,1])},
    {inst:'bass', vol:0.28, seq:__arr('D2 . D2 . D2 . D2 . G#2 . G#2 . G#2 . G#2 . D2 . D2 . D2 . D2 . A2 . A2 . A2 . A2 .',[0,0,1,5,0])},
    {inst:'lead', vol:0.16, seq:__arr('D5 . D5 F5 . E5 D5 C#5 G#4 . G#4 B4 . A#4 G#4 G4 D5 . D5 F5 . A5 G#5 G5 F5 . E5 D5 . C#5 D5 A4',[0,1,5,3,0])},
    {inst:'pad',  vol:0.14, seq:__arr('D3+A3+F4 - - - - - - - G#2+D3+B3 - - - - - - - D3+A3+F4 - - - - - - - A2+C#3+E3 - - - - - - -',[0,0,1,5,0])}
  ]},
  spectate:{ bpm:124, div:4, parts:[
    {inst:'bass', vol:0.22, seq:__arr('A2 . A2 . A2 . A2 . F2 . F2 . F2 . F2 . C3 . C3 . C3 . C3 . G2 . G2 . G2 . G2 .',[0,3,5,3])},
    {inst:'pad',  vol:0.12, seq:__arr('A2+E3+C4 - - - - - - - F2+C3+A3 - - - - - - - C3+G3+E4 - - - - - - - G2+D3+B3 - - - - - - -',[0,3,5,3])},
    {inst:'drum', vol:0.24, seq:__drums('k . h . s . h . k . h . s . h H k . h . s . h . k . h . s . h H',[0,0,1,1])},
    {inst:'pluck',vol:0.12, seq:__arr('A3 C4 E4 A4 E4 C4 A3 C4 F3 A3 C4 F4 C4 A3 F3 A3 C4 E4 G4 C5 G4 E4 C4 E4 G3 B3 D4 G4 B4 D4 G3 B3',[0,3,5,3])}
  ]},
  select:{ bpm:120, div:4, parts:[
    {inst:'bass', vol:0.24, seq:__arr('A2 . A2 . F2 . F2 . C3 . C3 . G2 . G2 . A2 . A2 . F2 . F2 . C3 . C3 . E2 . E2 .',[0,3,5,3])},
    {inst:'pad',  vol:0.13, seq:__arr('A2+E3+C4 - - - - - - - F2+C3+A3 - - - - - - - C3+G3+E4 - - - - - - - G2+D3+B3 - - - - - - -',[0,3,5,3])},
    {inst:'pluck',vol:0.13, seq:__arr('A3 C4 E4 A4 C5 A4 E4 C4 F3 A3 C4 F4 A4 F4 C4 A3 C4 E4 G4 C5 E5 C5 G4 E4 G3 B3 D4 G4 B4 G4 D4 B3',[0,3,5,3])},
    {inst:'drum', vol:0.12, seq:__drums('k . h . s . h . k . h . s . h . k . h . s . h . k . h . s . h H',[0,0,1,1])}
  ]},
  map0:{ bpm:136, div:4, parts:[
    {inst:'bass', vol:0.24, seq:__arr('A1 A1 . A1 F1 F1 . F1 C2 C2 . C2 G1 G1 . G1',[0,0,3,5,0])},
    {inst:'pad',  vol:0.12, seq:__arr('A2+E3+C4 - - - F2+C3+A3 - - - C3+G3+E4 - - - G2+D3+B3 - - -',[0,0,3,5,0])},
    {inst:'lead', vol:0.13, seq:__arr('A4 . C5 . E5 . C5 . F4 . A4 . C5 . A4 .',[0,3,5,3,0])},
    {inst:'drum', vol:0.14, seq:__drums('k . h . s . h . k . h . s . h h',[0,0,1,0,1])}
  ]},
  map1:{ bpm:116, div:4, parts:[
    {inst:'bass', vol:0.22, seq:__arr('D2 . . D2 . A1 . . A#1 . . A#1 . C2 . .',[0,5,3,0])},
    {inst:'pluck',vol:0.13, seq:__arr('D3 F3 A3 D4 A3 F3 D3 F3 A#2 D3 F3 A#3 F3 D3 A#2 D3',[0,5,3,0])},
    {inst:'bell', vol:0.12, seq:__arr('. . A4 . . . F4 . . . D4 . . . C4 .',[0,null,5,0])},
    {inst:'drum', vol:0.10, seq:__drums('k . . h s . . h k . . h s . h .',[0,0,1,1])}
  ]},
  map2:{ bpm:108, div:4, parts:[
    {inst:'pad',  vol:0.16, seq:__arr('D3+A3+F4 - - - - - - - A#2+F3+D4 - - - - - - -',[0,5,3,0])},
    {inst:'bass', vol:0.20, seq:__arr('D2 - - - - - - - A#1 - - - - - - -',[0,5,3,0])},
    {inst:'bell', vol:0.15, seq:__arr('- - D5 - - - F5 - - - A4 - - - D5 -',[0,null,5,0])},
    {inst:'drum', vol:0.08, seq:__drums('. . h . . . h . . . h . . . h .',[0,0,1,1])}
  ]},
  map3:{ bpm:148, div:4, parts:[
    {inst:'drum', vol:0.18, seq:__drums('k h s h k h s h k h s h k h s H',[0,0,1,0,1])},
    {inst:'bass', vol:0.26, seq:__arr('E1 . E1 . E1 E1 . E1 G1 . G1 . G1 G1 . G1',[0,0,5,3,0])},
    {inst:'stab', vol:0.12, seq:__arr('E3+G3+B3 . . . . . . . G2+B2+D3 . . . . . . .',[0,0,5,3,0])},
    {inst:'lead', vol:0.13, seq:__arr('E4 . G4 . B4 . G4 E4 D4 . F#4 . A4 . F#4 D4',[0,3,5,3,0])}
  ]},
  map4:{ bpm:124, div:4, parts:[
    {inst:'pad',  vol:0.15, seq:__arr('A2+E3+C4 - - - - - - - F2+C3+A3 - - - - - - -',[0,3,5,3])},
    {inst:'bass', vol:0.20, seq:__arr('A1 . . . . . F1 . . . . . C2 . . .',[0,3,5,3])},
    {inst:'bell', vol:0.14, seq:__arr('- A5 - - E5 - - - - C5 - - A4 - - -',[0,null,3,0])},
    {inst:'drum', vol:0.08, seq:__drums('. . h . . . h . . . h . . . h H',[0,0,1,1])}
  ]},
  map5:{ bpm:92, div:4, parts:[
    {inst:'pad',  vol:0.17, seq:__arr('D3+A3+F4 - - - - - - - C3+G3+E4 - - - - - - -',[0,5,0])},
    {inst:'bass', vol:0.19, seq:__arr('D2 - - - - - - - C2 - - - - - - -',[0,5,0])},
    {inst:'bell', vol:0.15, seq:__arr('D5 - - F5 - - A4 - C5 - - E5 - - D5 -',[0,null,0])}
  ]},
  map6:{ bpm:150, div:4, parts:[
    {inst:'drum', vol:0.18, seq:__drums('k . h h s . h h k . h h s . h H',[0,0,1,0,1])},
    {inst:'bass', vol:0.25, seq:__arr('F1 F1 . F1 C2 C2 . C2 G#1 G#1 . G#1 D#2 D#2 . D#2',[0,0,1,5,0])},
    {inst:'pluck',vol:0.13, seq:__arr('F4 A4 C5 F5 C5 A4 F4 A4 C4 E4 G4 C5 G4 E4 C4 E4',[0,3,5,3,0])},
    {inst:'stab', vol:0.11, seq:__arr('F3+A3+C4 . . . . . . . C#3+F3+G#3 . . . . . . .',[0,0,1,5,0])}
  ]},
  judgement:{ bpm:148, div:4, parts:[
    {inst:'drum', vol:0.30, seq:__drums('k . h k s . h . k . h k s . h s k . h k s . h . k . h k s . h H',[0,0,1,0,1])},
    {inst:'bass', vol:0.28, seq:__arr('D2 . D2 . D2 . D2 D2 G2 . G2 . G2 . G2 G2 A#2 . A#2 . A#2 . A#2 A#2 C3 . C3 . C3 . C3 C3',[0,0,3,5,0])},
    {inst:'lead', vol:0.16, seq:__arr('D5 . F5 . A5 . G5 F5 E5 . D5 . C5 . D5 . D5 . F5 . A5 . C6 A5 G5 . F5 . E5 . F5 G5',[0,3,5,3,0])},
    {inst:'pad',  vol:0.15, seq:__arr('D3+A3+F4 - - - - - - - A#2+F3+D4 - - - - - - - F3+A3+C4 - - - - - - - A2+E3+C#4 - - - - - - -',[0,0,3,5,0])},
    {inst:'bell', vol:0.13, seq:__arr('- - - - A5 - - - - - - - F5 - - - - - - - D5 - - - - - - - C#5 - - -',[0,null,3,5,0])}
  ]},
  oblivion:{ bpm:158, div:4, parts:[
    {inst:'drum', vol:0.32, seq:__drums('k k h k s s h k k . h k s . h s k k h k s s h k k . h k s . h H',[0,0,1,0,1])},
    {inst:'bass', vol:0.28, seq:__arr('C2 . C2 C2 C2 . C2 . G#1 . G#1 G#1 G#1 . G#1 . A#1 . A#1 A#1 A#1 . A#1 . D#2 . D#2 D#2 D#2 . D#2 D#2',[0,0,1,5,0])},
    {inst:'lead', vol:0.16, seq:__arr('C5 . D#5 . G5 . A#5 . C6 A#5 G5 D#5 C5 . D#5 . C5 . D#5 . G5 . C6 . A#5 G5 F5 D#5 D5 D#5 C5 D#5',[0,1,5,3,0])},
    {inst:'pad',  vol:0.16, seq:__arr('C3+G3+D#4 - - - - - - - G#2+D#3+C4 - - - - - - - A#2+F3+D4 - - - - - - - D#3+A#3+G4 - - - - - - -',[0,0,1,5,0])},
    {inst:'stab', vol:0.12, seq:__arr('C4+D#4+G4 . . . . . . . G#3+C4+D#4 . . . . . . . A#3+D4+F4 . . . . . . . D#4+G4+A#4 . . . . . . .',[0,0,1,5,0])}
  ]}
};
const MUS={track:null,name:'',want:'',step:0,nextT:0,timer:null};
/* 主界面 BGM:从全部地图专属音轨中随机开局,按 M 循环切换 */
let titleBgmIdx=-1;
let musicMuted=false;                         // 主界面按钮:关闭/开启全部背景音乐(不影响音效)
function titleBgmNext(){
  const n=Math.max(1,MAPS.length);
  titleBgmIdx=((titleBgmIdx<0?ri(0,n-1):titleBgmIdx)+1)%n;
  musicSet('map'+titleBgmIdx);
}
function musicToggleMute(){
  musicMuted=!musicMuted;
  if(musicMuted){
    if(MUS.timer){ clearInterval(MUS.timer); MUS.timer=null; }
    MUS.track=null; MUS.name='';
    if(MGAIN) MGAIN.gain.value=0;
  }else{
    if(MGAIN) MGAIN.gain.value=0.5;
    musicResume();
  }
}
function mCompile(tr){
  if(tr._steps) return tr._steps;
  const steps=[]; let len=0;
  tr.parts.forEach(p=>{
    const tk=p.seq.trim().split(/\s+/); if(tk.length>len) len=tk.length;
    let i=0;
    while(i<tk.length){
      const s=tk[i];
      if(s==='.'||s==='-'){ i++; continue; }
      let n=1; while(i+n<tk.length&&tk[i+n]==='-') n++;
      (steps[i]=steps[i]||[]).push({t:s,inst:p.inst,vol:p.vol,len:n});
      i+=n;
    }
  });
  tr._steps=steps; tr._len=len;
  return steps;
}
function mPlay(ev,t,sd){
  const dur=Math.max(sd*ev.len*0.94,sd*0.5);
  if(ev.inst==='drum'){
    if(ev.t==='k') mKick(t,ev.vol);
    else if(ev.t==='s') mSnare(t,ev.vol);
    else if(ev.t==='h') mHat(t,ev.vol,false);
    else if(ev.t==='H') mHat(t,ev.vol,true);
    return;
  }
  const fn=INST[ev.inst]; if(!fn) return;
  ev.t.split('+').forEach(nm=>{ const f=mNote(nm); if(f) fn(f,t,dur,ev.vol); });
}
function mStart(name){
  if(musicMuted) return;
  const tr=MUSIC[name]; if(!tr||!AC) return;
  if(MUS.name===name&&MUS.timer) return;      // 已在播放同一轨 → 不打断
  mCompile(tr);
  MUS.track=tr; MUS.name=name; MUS.step=0; MUS.nextT=AC.currentTime+0.06;
  if(!MUS.timer) MUS.timer=setInterval(musicTick,25);
}
function musicSet(name){
  if(!name||MUS.want===name) return;
  MUS.want=name;
  if(AC&&!musicMuted) mStart(name);           // AC 未就绪时仅记录,待 musicResume 补起
}
function musicResume(){ if(AC&&!musicMuted&&MUS.want) mStart(MUS.want); }
function musicTick(){
  if(!AC||!MUS.track) return;
  const tr=MUS.track, sd=60/tr.bpm/(tr.div||4), ahead=AC.currentTime+0.35;
  if(MUS.nextT<AC.currentTime-0.05) MUS.nextT=AC.currentTime+0.02;   // 切后台回来时重新对齐
  let guard=0;
  while(MUS.nextT<ahead&&guard++<240){
    const bucket=tr._steps[MUS.step];
    if(bucket) for(let e=0;e<bucket.length;e++) mPlay(bucket[e],MUS.nextT,sd);
    MUS.step=(MUS.step+1)%tr._len;
    MUS.nextT+=sd;
  }
}
function isBossWave(){ const w=game.storyWaves&&game.storyWaves[game.storyWave]; return !!(w&&w.boss); }
function heroMusic(){                    // 隐藏机体专属 MIDI:湮灭(终焉型) > 天罚(审判型) > null(交给地图音轨)
  let hasJ=false, hasO=false;
  const scan=ch=>{ if(!ch) return; if(ch.tag==='终焉型') hasO=true; else if(ch.tag==='审判型') hasJ=true; };
  if(game.mechs&&game.mechs.length){ for(const m of game.mechs) scan(m&&m.ch); }
  else if(game.select){
    if(game.select.idx1>=0) scan(CHARS[game.select.idx1]);
    if(game.select.idx2>=0) scan(CHARS[game.select.idx2]);
  }
  if(hasO) return 'oblivion';
  if(hasJ) return 'judgement';
  return null;
}
function desiredMusic(){
  const s=game.state;
  if(s==='title'){                                  // 主界面:随机地图 BGM(M 切换)
    if(titleBgmIdx<0) titleBgmIdx=ri(0,MAPS.length-1);
    return 'map'+titleBgmIdx;
  }
  if(s==='storyChar'||s==='story'||s==='scenario') return 'story';
  if(s==='cpuPick'||s==='map') return 'menu';
  if(s==='vs') return game.mode===3?'map'+(game.mapIdx|0):'menu';
  if(s==='select') return 'select';                 // 选人界面专属 BGM
  if(s==='intro'||s==='fight'||s==='ko'){
    if(game.mode===3) return 'map'+(game.mapIdx|0); // 观赏模式:忽略隐藏机体专属 BGM,始终使用地图音轨
    const h=heroMusic();                            // 隐藏机体专属 MIDI 优先于地图音轨
    if(h) return h;
    if(game.storyMode&&isBossWave()) return 'boss';
    return 'map'+(game.mapIdx|0);                   // 各战场专属 mini 音轨
  }
  if(s==='sresult') return game.storyMode?'story':'menu';
  if(s==='end') return game.mode===3?'map'+(game.mapIdx|0):'menu';
  return 'menu';
}
