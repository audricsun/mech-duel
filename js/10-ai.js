/* =========================================================================
 * 机甲对决 MECH DUEL · 10-ai.js
 * AI 控制器(轻量决策,带反应间隔)
 * -------------------------------------------------------------------------
 * 由 index.html 内联脚本按逻辑模块拆分而来。各文件以普通 <script> 顺序加载,
 * 共享同一个全局作用域,故必须保持 index.html 中的引入顺序。
 * ========================================================================= */
'use strict';
/* ---------------- 8. AI 控制器(轻量决策,带反应间隔) ---------------- */
function cpuInput(m,opp,game,dt){
  const o={left:false,right:false,guard:false,up:false,down:false,leftEdge:false,rightEdge:false,upEdge:false,downEdge:false,jump:false,atk:false,shoot:false,ult:false};
  if(m.passive) return o;                   // 训练靶机:完全被动,只挨打不还手
  if(!opp) return o;                        // 无敌人:待机
  const D=game.diffObj||DIFFS[0];           // 难度参数驱动(主界面统一设置)
  const aiMem=m.ai||(m.ai={t:0,move:0,guardT:0,castCd:0});  // 每机体独立记忆
  aiMem.t-=dt; aiMem.guardT-=dt; aiMem.castCd=(aiMem.castCd||0)-dt;
  let casted=false;                         // 本帧是否已通过组合键施放技能
  const toRight=opp.x>m.x, dist=Math.abs(opp.x-m.x);
  if(m.ult>=ULT_MAX && Math.random()<0.05){
    const closeUlt=['ultEarthbreaker','ultZero','ultSupernova'].includes(m.ch.ult);
    if(!closeUlt||dist<150) o.ult=true;   // 自身范围终结技:贴近后再放
  }
  // 技能施放:模拟 防御(开窗)+方向+攻击 组合键
  const castSlot=(slot)=>{
    const id=m.ch.skills&&m.ch.skills[slot];
    if(!id||(m.cds[id]||0)>0) return false;
    o.guard=true; o.downEdge=true; aiMem.move=0;
    if(slot[0]==='f'){ if(m.facing>0) o.right=true; else o.left=true; }
    else if(slot[0]==='b'){ if(m.facing>0) o.left=true; else o.right=true; }
    if(slot[1]==='J') o.atk=true; else o.shoot=true;
    casted=true;
    aiMem.castCd=rnd(0.55,1.25);            // 全局技能节流:避免 AI 连续倾泻技能
    return true;
  };
  if(aiMem.guardT>0){ o.guard=true; return o; }
  // 飞行姿态控制:跟随对手高度,燃料不足时主动下降
  if(m.flying){
    if(m.flyFuel<0.7) o.down=true;
    else if(opp.y<m.y-16) o.up=true;
    else if(opp.y>m.y+34) o.down=true;
  }
  if(aiMem.t<=0){
    aiMem.t=rnd(D.react[0],D.react[1]);
    // —— 技能决策:从可用槽位中按局势随机挑选一个施放(受全局节流限制)——
    if(aiMem.castCd<=0){
      const el=[];
      for(const s of m.skillSlots){
        const id=s.id; if((m.cds[id]||0)>0) continue;
        let ok=false;
        switch(id){
          case 'dash':       ok=dist>90&&dist<170&&Math.random()<0.5; break;
          case 'triple':     ok=dist>60&&dist<200&&Math.random()<0.45; break;
          case 'tumble':     ok=dist<70&&Math.random()<0.5; break;
          case 'fortify':    ok=dist<150&&Math.random()<0.4; break;
          case 'rocketsalvo':ok=dist>110&&dist<280&&Math.random()<0.55; break;
          case 'mortarBarrage':ok=dist>90&&dist<330&&Math.random()<0.55; break;
          case 'blinkF':     ok=dist>130&&Math.random()<0.6; break;
          case 'blinkB':     ok=dist<60&&Math.random()<0.5; break;
          case 'spin':       ok=dist<60&&Math.random()<0.6; break;
          case 'eshield':    ok=(m.hp<m.maxHp*0.5||opp.atkT>0.14)&&Math.random()<0.5; break;
          case 'shieldbash': ok=dist>80&&dist<170&&Math.random()<0.5; break;
          case 'vulcan':     ok=dist>130&&m.energy>40&&Math.random()<0.6; break;
          case 'overcharge': ok=dist<180&&Math.random()<0.45; break;
          case 'twinlaser':  ok=dist>130&&dist<280&&Math.random()<0.5; break;
          case 'leapblast':  ok=dist<95&&Math.random()<0.5; break;
          case 'cloak':      ok=m.hp<m.maxHp*0.6&&Math.random()<0.6; break;
          case 'shadow':     ok=dist>90&&Math.random()<0.5; break;
          case 'shadowdash': ok=dist>100&&dist<200&&Math.random()<0.55; break;
          case 'trample':    ok=dist>100&&dist<210&&Math.random()<0.55; break;
          case 'roar':       ok=dist<80&&Math.random()<0.5; break;
          case 'burst':      ok=m.energy<40; break;
          case 'arcburst':   ok=dist>70&&dist<170&&Math.random()<0.5; break;
          case 'judgement':  ok=dist>70&&Math.random()<0.55; break;
          case 'oblivion':   ok=dist<130&&Math.random()<0.6; break;
          case 'hellfire':   ok=dist>110&&dist<340&&Math.random()<0.6; break;
          case 'incendiary': ok=dist>70&&dist<260&&Math.random()<0.55; break;
          case 'drone':      ok=Math.random()<0.5; break;
          case 'cover':      ok=(dist>60&&opp.atkT>0)||(dist>110&&Math.random()<0.4); break;
          case 'healDrone':  ok=m.hp<m.maxHp*0.6&&Math.random()<0.6; break;
          case 'lightning':  ok=dist<320&&Math.random()<0.55; break;
          case 'iceball':    ok=dist>80&&dist<230&&Math.random()<0.5; break;
          case 'emorb':      ok=dist>60&&dist<240&&Math.random()<0.5; break;
          case 'missileSalvo':ok=dist>120&&dist<340&&Math.random()<0.55; break;
          case 'rocketBarrage':ok=dist>110&&dist<280&&Math.random()<0.55; break;
          case 'drone3':     ok=Math.random()<0.55; break;
          case 'magnetpull': ok=dist>70&&dist<190&&Math.random()<0.5; break;
          case 'marklock':   ok=dist>110&&Math.random()<0.6; break;
          case 'rebuildfield':ok=m.hp<m.maxHp*0.65&&Math.random()<0.6; break;
          case 'fullburst':  ok=dist>110&&dist<320&&Math.random()<0.55; break;
          case 'judgementpillar':ok=dist>70&&dist<360&&Math.random()<0.55; break;
          case 'sonicdash':  ok=dist>90&&dist<200&&Math.random()<0.6; break;
          case 'hammerorbit':ok=dist<70&&Math.random()<0.55; break;
          case 'quakewave':  ok=dist>70&&dist<300&&Math.random()<0.55; break;
          case 'groundburst':ok=dist>60&&dist<280&&Math.random()<0.5; break;
          case 'mechbird':   ok=Math.random()<0.5; break;
          case 'shieldbreak':ok=dist<130&&Math.random()<0.55; break;
          case 'antidrone':  ok=dist<150&&Math.random()<0.5; break;
          case 'reveal':     ok=Math.random()<0.4; break;
          default: {
            const v=SKILL_VARIANTS[id];
            if(v&&v.aiR) ok=dist>=v.aiR[0]&&dist<=v.aiR[1]&&Math.random()<(v.aiP||0.5);
            break;
          }
        }
        if(ok) el.push(s.slot);
      }
      if(el.length) castSlot(el[ri(0,el.length-1)]);
    }
    const shootP=m.flying?D.shootP*2.2:D.shootP;      // 飞行锁定:射弹倾向提升
    const vis=opp.cloakT<=0;                          // 对手隐身:停火且丢失锁定
    const rl=roleOf(m.ch);                             // 战斗定位:近战贴脸 / 远程拉开
    const pref=(WEAPONS[m.weapon].range||120)*rl.pref; // 机体交战距离偏好(按定位缩放)
    const ranged=pref>=140;                           // 远程特化:保持距离火力输出
    const meleeBias=rl.melee>1;                        // 近战定位:贴身更主动
    if(dist>46){
      if(dist>pref+55){                               // 距离过远:逼近
        aiMem.move=toRight?1:-1;
        if(vis&&m.energy>=ENERGY_COST+20&&Math.random()<shootP*1.4) o.shoot=true;
      }else if(ranged&&dist<pref-45){                 // 远程机体被逼近:后撤周旋
        aiMem.move=toRight?-1:1;
        if(vis&&m.energy>=ENERGY_COST&&Math.random()<shootP*1.7) o.shoot=true;
        if(dist<80&&m.onGround&&Math.random()<0.35) o.jump=true;
      }else{                                          // 交战区间:小幅走位+持续输出
        aiMem.move=Math.random()<0.3?(Math.random()<.5?1:-1):0;
        if(vis&&m.shootCd<=0&&m.energy>=ENERGY_COST&&Math.random()<shootP*(ranged?1.9:1.1)) o.shoot=true;
        if(!ranged&&Math.random()<0.12) o.jump=true;
      }
    }else{
      aiMem.move=0;
      if(ranged&&Math.random()<0.72){                 // 远程机体近身:拉开距离反击
        aiMem.move=toRight?-1:1; aiMem.t=rnd(0.18,0.35);
        if(vis&&m.energy>=ENERGY_COST&&Math.random()<shootP*1.5) o.shoot=true;
      }else if(opp.atkT>0.14&&Math.random()<D.guardP*(meleeBias?0.8:1)){ aiMem.guardT=rnd(0.25,0.45); }
      else if(m.atkCd<=0&&Math.random()<D.atkP*(meleeBias?1.4:1)) o.atk=true;
      else if(vis&&m.shootCd<=0&&m.energy>=ENERGY_COST&&Math.random()<shootP) o.shoot=true;
      else if(Math.random()<0.15) o.jump=true;
      else if(Math.random()<D.retreat*(meleeBias?0.35:1)){ aiMem.move=toRight?-1:1; aiMem.t=rnd(0.15,0.3); }
    }
    // 空中特化武装:飞行中概率发射追踪弹/迫击炮
    if(m.flying&&m.ch.airW&&dist>110&&m.energy>=WEAPONS[m.ch.airW].cost&&Math.random()<0.4){ o.down=true; o.shoot=true; }
    if(!m.onGround&&Math.random()<0.05) o.jump=true;
  }
  // 可飞行机体:空中概率补第二段上键起飞
  if(m.canFly&&!m.onGround&&!m.flying&&m.flyFuel>1.2&&Math.random()<dt*6) o.upEdge=true;
  if(!casted){                              // 已施放技能:保留组合键方向,不再被走位/格挡覆盖
    if(aiMem.move===1) o.right=true; else if(aiMem.move===-1) o.left=true;
    // 对手近身挥砍时概率举盾
    if(dist<60&&opp.atkT>0.1&&aiMem.guardT<=0&&Math.random()<D.guardP*0.7) aiMem.guardT=0.3;
    if(aiMem.guardT>0){ o.guard=true; o.left=o.right=false; }
  }
  return o;
}
