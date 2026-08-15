// TEST ONLY: rapidly simulate opponent picks until the user's next turn.
// Opponent teams fill configured required starter slots before taking bench depth,
// while scarce positions are reserved league-wide so every team can still finish legally.
(function installTestAutoDraft(){
  let autoDraftBusy=false;
  const NFL_TEAMS=['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAC','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'];

  const posKey=p=>{const x=String(primaryPos(p)||'').toUpperCase();return x==='D/ST'||x==='DEF'?'DST':x};
  const req=()=>{const r=state.settings.roster||{};return{QB:Number(r.QB||r.qb||0),RB:Number(r.RB||r.rb||0),WR:Number(r.WR||r.wr||0),TE:Number(r.TE||r.te||0),FLEX:Number(r.FLEX||r.flex||0),SFLEX:Number(r.SFLEX||r.sflex||0),K:Number(r.K||r.k||0),DST:Number(r.DST||r.dst||r.DEF||r.def||0),BENCH:Number(r.BENCH||r.BN||r.bench||0)}};
  const teamPicks=slot=>(state.picks||[]).filter(p=>Number(p.teamSlot)===Number(slot));
  const teamPlayers=slot=>teamPicks(slot).map(p=>getPlayer(p.playerId)).filter(Boolean);

  function teamRequirementStatus(slot){
    const r=req(),players=teamPlayers(slot),counts={QB:0,RB:0,WR:0,TE:0,K:0,DST:0};
    players.forEach(p=>{const x=posKey(p);if(counts[x]!=null)counts[x]++});
    const direct={};
    ['QB','RB','WR','TE','K','DST'].forEach(x=>direct[x]=Math.max(0,r[x]-counts[x]));

    // Allocate excess players to flexible slots without double-counting one player
    // as both FLEX and Superflex.
    const left={QB:Math.max(0,counts.QB-r.QB),RB:Math.max(0,counts.RB-r.RB),WR:Math.max(0,counts.WR-r.WR),TE:Math.max(0,counts.TE-r.TE)};
    let skillLeft=left.RB+left.WR+left.TE;
    const flexFilled=Math.min(r.FLEX,skillLeft);
    skillLeft-=flexFilled;
    const flexMissing=Math.max(0,r.FLEX-flexFilled);
    const sflexFilled=Math.min(r.SFLEX,left.QB+skillLeft);
    const sflexMissing=Math.max(0,r.SFLEX-sflexFilled);
    const missing=[...Object.entries(direct).flatMap(([x,n])=>Array(n).fill(x)),...Array(flexMissing).fill('FLEX'),...Array(sflexMissing).fill('SFLEX')];
    const picksMade=teamPicks(slot).length;
    const picksRemaining=Math.max(0,Number(state.settings.rounds||0)-picksMade);
    return{slot,r,counts,direct,missing,missingCount:missing.length,picksMade,picksRemaining,complete:missing.length===0};
  }

  function fillsSlot(player,slotName){
    const x=posKey(player);
    if(slotName==='FLEX')return['RB','WR','TE'].includes(x);
    if(slotName==='SFLEX')return['QB','RB','WR','TE'].includes(x);
    return x===slotName;
  }

  function remainingDirectDemand(position){
    const teams=Number(state.settings.teams||14);
    let total=0;
    for(let slot=1;slot<=teams;slot++)total+=Number(teamRequirementStatus(slot).direct[position]||0);
    return total;
  }

  function availableAt(position){return availablePlayers().filter(p=>posKey(p)===position)}

  function ensureScarceRequiredPool(){
    let generated=0;
    for(const position of ['K','DST']){
      const demand=remainingDirectDemand(position);
      let available=availableAt(position);
      let shortage=Math.max(0,demand-available.length);
      if(!shortage)continue;

      const represented=new Set(state.players.filter(p=>posKey(p)===position).map(p=>String(p.team||'').toUpperCase()).filter(Boolean));
      const teamPool=NFL_TEAMS.filter(team=>!represented.has(team));
      let i=0;
      while(shortage>0){
        const team=teamPool.shift()||`T${i+1}`;
        const id=`autotest-${position.toLowerCase()}-${String(team).toLowerCase()}-${i}`;
        if(!state.players.some(p=>p.id===id)){
          state.players.push({
            id,
            name:position==='DST'?`${team} D/ST`:`${team} Test Kicker`,
            team:team.startsWith('T')?'':team,
            position:position==='DST'?'D/ST':'K',
            positions:[position==='DST'?'D/ST':'K'],
            rank:null,
            adp:null,
            projection:0,
            status:'TEST ONLY',
            autoTestGenerated:true
          });
          generated++;
          shortage--;
        }
        i++;
        if(i>80)break;
      }
    }
    return generated;
  }

  function baseBotScore(player,overall,status){
    const rank=num(player.rank),adp=num(player.adp),projection=num(player.projection);
    let score=0;
    if(rank!==null)score+=2200-rank*7;
    if(adp!==null)score+=1000-adp*2.6+clamp(overall-adp,-30,30)*3.2;
    if(projection!==null)score+=projection*.18;
    if(player.status&&/out|ir|susp|pup|nfi/i.test(player.status))score-=90;
    const x=posKey(player);
    if(status.missing.some(s=>s===x))score+=160;
    if(status.missing.includes('FLEX')&&['RB','WR','TE'].includes(x))score+=95;
    if(status.missing.includes('SFLEX')&&['QB','RB','WR','TE'].includes(x))score+=80;
    if(player.autoTestGenerated)score-=600; // real loaded players always win unless a required pool is exhausted.
    return score;
  }

  function scarceRequiredTargets(status){
    const targets=[];
    for(const position of ['QB','RB','WR','TE','K','DST']){
      if(Number(status.direct[position]||0)<=0)continue;
      const supply=availableAt(position).length;
      const demand=remainingDirectDemand(position);
      // Once supply approaches league-wide outstanding demand, reserve the position
      // immediately instead of allowing early teams to consume the last legal options.
      if(supply<=demand+1)targets.push(position);
    }
    return targets;
  }

  function chooseAutoPlayer(slot,overall){
    const status=teamRequirementStatus(slot),available=availablePlayers();
    if(!available.length)return{player:null,status,error:'No available players remain.'};
    if(status.missingCount>status.picksRemaining)return{player:null,status,error:`${typeof leagueTeamName==='function'?leagueTeamName(slot):`Team ${slot}`} no longer has enough picks to fill ${status.missingCount} required slots.`};

    let candidates=[];
    if(status.missing.length){
      const scarce=scarceRequiredTargets(status);
      const coreMissing=status.missing.filter(x=>x!=='K'&&x!=='DST');
      const targetSlots=scarce.length?scarce:(coreMissing.length?coreMissing:status.missing);
      candidates=available.filter(p=>targetSlots.some(s=>fillsSlot(p,s)));
      if(!candidates.length)candidates=available.filter(p=>status.missing.some(s=>fillsSlot(p,s)));
      if(!candidates.length)return{player:null,status,error:`No available player can fill ${typeof leagueTeamName==='function'?leagueTeamName(slot):`Team ${slot}`}'s remaining required slots: ${status.missing.join(', ')}.`};
    }else{
      // Bench: never consume K/DST depth needed by another team's required slot.
      candidates=available.filter(p=>!['K','DST'].includes(posKey(p)));
      if(!candidates.length)candidates=available;
    }

    candidates.sort((a,b)=>{
      let as=baseBotScore(a,overall,status),bs=baseBotScore(b,overall,status);
      if(status.complete){
        const ax=posKey(a),bx=posKey(b),superflex=Number(status.r.SFLEX||0)>0;
        const benchAdj=x=>x==='RB'?80:x==='WR'?75:x==='TE'?20:x==='QB'?(superflex?35:-120):0;
        as+=benchAdj(ax);bs+=benchAdj(bx);
      }
      return bs-as||num(a.rank,9999)-num(b.rank,9999)||num(a.adp,9999)-num(b.adp,9999);
    });
    return{player:candidates[0],status,error:''};
  }

  function requiredCount(){const r=req();return r.QB+r.RB+r.WR+r.TE+r.FLEX+r.SFLEX+r.K+r.DST}
  const yieldUi=()=>new Promise(resolve=>setTimeout(resolve,0));

  async function autoDraftToMyTurn(){
    if(autoDraftBusy)return;
    const teams=Number(state.settings.teams||14),rounds=Number(state.settings.rounds||0),mySlot=Number(state.settings.draftSlot),maxPick=teams*rounds;
    let info=teamForOverall(currentOverallPick());
    if(info.round>rounds)return toast('Draft is already complete','error');
    if(info.teamSlot===mySlot)return toast(`You are already on the clock at ${pickLabel(info.overall)}.`);
    if(requiredCount()>rounds)return toast(`Roster requires ${requiredCount()} starter slots but the draft only has ${rounds} rounds.`,'error');

    autoDraftBusy=true;
    const button=document.getElementById('test-auto-to-my-turn');
    if(button){button.disabled=true;button.innerHTML='<span class="test-auto-spinner"></span> Auto-drafting…'}
    const aiOut=document.getElementById('ai-draft-output');
    if(aiOut)aiOut.innerHTML='<div class="ai-note">Simulating opponent picks until your turn…</div>';
    await yieldUi();

    const generated=ensureScarceRequiredPool();
    let made=0,error='';
    while(currentOverallPick()<=maxPick){
      info=teamForOverall(currentOverallPick());
      if(Number(info.teamSlot)===mySlot)break;
      const choice=chooseAutoPlayer(info.teamSlot,info.overall);
      if(!choice.player){error=choice.error||'Unable to find a legal test pick.';break}
      state.picks.push({playerId:choice.player.id,overall:info.overall,round:info.round,teamSlot:info.teamSlot,createdAt:new Date().toISOString(),autoTest:true});
      made++;
      if(made%4===0){
        const b=document.getElementById('test-auto-to-my-turn');
        if(b)b.textContent=`Auto-drafting… ${made} picks`;
        await yieldUi();
      }
    }

    if(typeof syncDraftRosters==='function')syncDraftRosters();
    saveState();
    lineupResult=null;
    autoDraftBusy=false;
    renderAll();

    if(error)return toast(error,'error');
    const now=teamForOverall(currentOverallPick());
    const poolNote=generated?` · added ${generated} test-only K/DST fallback${generated===1?'':'s'}`:'';
    if(made)toast(`${made} test picks simulated — you're on the clock at ${pickLabel(now.overall)}${poolNote}.`);
    else toast('No opponent picks needed.');
  }

  function installButton(){
    const card=document.querySelector('#draft-turn-banner .draft-turn-card');
    if(!card||document.getElementById('test-auto-to-my-turn'))return;
    const now=teamForOverall(currentOverallPick()),mine=Number(now.teamSlot)===Number(state.settings.draftSlot),complete=now.round>Number(state.settings.rounds);
    const wrap=document.createElement('div');
    wrap.className='draft-test-autodraft';
    wrap.innerHTML=`<span class="draft-test-badge">TEST</span><button class="btn secondary small" id="test-auto-to-my-turn" ${mine||complete?'disabled':''}>⚡ ${complete?'Draft complete':mine?'You are on the clock':'Auto-draft to my turn'}</button><span class="draft-test-help">Required roster slots are reserved league-wide for every team.</span>`;
    card.appendChild(wrap);
    document.getElementById('test-auto-to-my-turn')?.addEventListener('click',autoDraftToMyTurn);
  }

  const style=document.createElement('style');
  style.textContent=`.draft-test-autodraft{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid rgba(145,128,190,.18)}.draft-test-badge{font-size:9px;font-weight:950;letter-spacing:.12em;color:#c8b7ff;border:1px solid #554379;background:#1c1730;border-radius:999px;padding:4px 7px}.draft-test-autodraft .btn{min-height:38px}.draft-test-help{color:#778399;font-size:10px}.test-auto-spinner{display:inline-block;width:12px;height:12px;margin-right:6px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:testAutoSpin .7s linear infinite}@keyframes testAutoSpin{to{transform:rotate(360deg)}}@media(max-width:600px){.draft-test-autodraft{align-items:stretch}.draft-test-autodraft .btn{width:100%}.draft-test-help{width:100%}}`;
  document.head.appendChild(style);

  const priorRenderDraft=renderDraft;
  renderDraft=function(){priorRenderDraft();installButton()};
  installButton();
  window.autoDraftToMyTurn=autoDraftToMyTurn;
  window.testTeamRequirementStatus=teamRequirementStatus;
})();
