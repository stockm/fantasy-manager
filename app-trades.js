// Trade Center: maintain league rosters, record trades, and keep acquisition recommendations current.
(function installTradeCenter(){
  const mySlot=()=>Number(state.settings.draftSlot||1);
  const leagueSize=()=>Math.max(2,Number(state.settings.teams||14));
  const draftTargetPicks=()=>leagueSize()*Math.max(1,Number(state.settings.rounds||1));
  const draftLogComplete=()=>Number((state.picks||[]).length)>=draftTargetPicks();
  const posKey=p=>{const x=String(primaryPos(p)||'').toUpperCase();return ['DST','DEF','D/ST','D-ST'].includes(x)?'D/ST':x};

  function ensureTradeData(){
    if(!state.teamRosters||typeof state.teamRosters!=='object')state.teamRosters={};
    if(!Array.isArray(state.trades))state.trades=[];
    if(!Array.isArray(state.tradeRecommendations))state.tradeRecommendations=[];
    if(!state.tradeTargetAnalyses||typeof state.tradeTargetAnalyses!=='object')state.tradeTargetAnalyses={};
    if(!state.tradeWeeklyAi||typeof state.tradeWeeklyAi!=='object')state.tradeWeeklyAi={};
    if(typeof state.seasonRosterMode!=='boolean')state.seasonRosterMode=false;
  }

  // Once a drafted player leaves the team that drafted him, keep him out of that
  // team's season roster even if legacy draft-roster sync runs again later.
  if(typeof syncDraftRosters==='function'){
    const tradeBaseSyncDraftRosters=syncDraftRosters;
    syncDraftRosters=function(){
      tradeBaseSyncDraftRosters();
      ensureTradeData();
      for(const pick of state.picks||[]){
        if(!pick.rosterRemoved)continue;
        const key=String(pick.teamSlot);
        state.teamRosters[key]=(state.teamRosters[key]||[]).filter(id=>id!==pick.playerId);
      }
    };
  }

  // My Roster should reflect post-draft transactions instead of permanently
  // retaining every player originally drafted by the user's team.
  if(typeof myDraftPicks==='function'){
    const tradeBaseMyDraftPicks=myDraftPicks;
    myDraftPicks=function(){return tradeBaseMyDraftPicks().filter(p=>!p.rosterRemoved)};
  }

  // A user may import/manage season rosters without a complete draft log. Season
  // roster mode explicitly tells the draft-state integrity layer not to overwrite
  // those maintained rosters with an incomplete historical pick log.
  if(typeof activeDraftInProgress==='function'){
    const tradeBaseActiveDraftInProgress=activeDraftInProgress;
    activeDraftInProgress=function(){return state.seasonRosterMode?false:tradeBaseActiveDraftInProgress()};
  }

  function ensureSeasonModeForTransactions(){
    ensureTradeData();
    if(draftLogComplete()||state.seasonRosterMode)return true;
    const ok=confirm('Your recorded draft pick log is not complete. Enable Season roster mode so roster moves and trades are not overwritten by the draft-state repair logic?');
    if(!ok)return false;
    state.seasonRosterMode=true;
    saveState();
    toast('Season roster mode enabled');
    return true;
  }

  function seasonRosterIds(slot){
    ensureTradeData();
    const key=String(slot);
    const maintained=Array.isArray(state.teamRosters[key])?state.teamRosters[key]:[];
    if(maintained.length||state.seasonRosterMode||draftLogComplete())return [...new Set(maintained)];
    return [...new Set((state.picks||[]).filter(p=>Number(p.teamSlot)===Number(slot)&&!p.rosterRemoved).map(p=>p.playerId))];
  }

  function seasonRoster(slot){return seasonRosterIds(slot).map(getPlayer).filter(Boolean)}

  function ownerSlotOf(playerId){
    ensureTradeData();
    for(let slot=1;slot<=leagueSize();slot++)if(seasonRosterIds(slot).includes(playerId))return slot;
    const pick=(state.picks||[]).find(p=>p.playerId===playerId&&!p.rosterRemoved);
    return pick?Number(pick.teamSlot):null;
  }

  function setPlayerOwner(playerId,targetSlot){
    ensureTradeData();
    const target=targetSlot?Number(targetSlot):null;
    for(let slot=1;slot<=leagueSize();slot++){
      const key=String(slot);
      state.teamRosters[key]=(state.teamRosters[key]||[]).filter(id=>id!==playerId);
    }
    const originalPick=(state.picks||[]).find(p=>p.playerId===playerId);
    if(originalPick)originalPick.rosterRemoved=!(target&&Number(originalPick.teamSlot)===target);
    state.manualRosterIds=(state.manualRosterIds||[]).filter(id=>id!==playerId);
    if(target){
      const key=String(target);
      state.teamRosters[key]=[...(state.teamRosters[key]||[]),playerId];
      if(target===mySlot()&&(!originalPick||Number(originalPick.teamSlot)!==mySlot()))state.manualRosterIds.push(playerId);
    }
  }

  function playerTradeValue(p){
    const rank=num(p.rank),adp=num(p.adp),proj=num(p.projection);
    let value=52;
    if(rank!==null)value+=Math.max(-25,72-rank*.48);
    if(adp!==null)value+=Math.max(-18,40-adp*.19);
    if(proj!==null)value+=Math.min(26,Math.max(0,proj*.065));
    const status=String(p.status||'').toUpperCase();
    if(/OUT|IR|SUSP|PUP|NFI/.test(status))value-=18;
    else if(/DOUBTFUL/.test(status))value-=8;
    else if(/QUESTIONABLE/.test(status))value-=3;
    if(posKey(p)==='K')value-=18;
    if(posKey(p)==='D/ST')value-=14;
    return Math.max(1,value);
  }

  function myPositionNeed(player){
    const pos=posKey(player),roster=myRoster(),r=state.settings.roster||{};
    const count=roster.filter(p=>posKey(p)===pos).length;
    let required=Number((pos==='D/ST'?r.DST:r[pos])||0);
    if(['RB','WR','TE'].includes(pos)&&Number(r.FLEX||0)>0)required+=Math.ceil(Number(r.FLEX||0)/3);
    if(pos==='QB'&&Number(r.SFLEX||0)>0)required+=Number(r.SFLEX||0);
    if(count<required)return{bonus:24,label:`fills starting ${pos} need`};
    if(count===required)return{bonus:12,label:`adds needed ${pos} depth`};
    if(count===required+1)return{bonus:5,label:`improves ${pos} competition`};
    return{bonus:0,label:`luxury ${pos} depth`};
  }

  function comparableWorstValue(player){
    const pos=posKey(player),eligible=myRoster().filter(p=>posKey(p)===pos);
    if(!eligible.length)return 0;
    return Math.min(...eligible.map(playerTradeValue));
  }

  function recentTradeForPlayer(id){
    return [...(state.trades||[])].reverse().find(t=>[...(t.aToB||[]),...(t.bToA||[])].includes(id))||null;
  }

  function buildTradeRecommendations(){
    ensureTradeData();
    const mine=mySlot(),out=[];
    for(const player of state.players||[]){
      const owner=ownerSlotOf(player.id);
      if(!owner||owner===mine)continue;
      const base=playerTradeValue(player),need=myPositionNeed(player),worst=comparableWorstValue(player),upgrade=base-worst,recent=recentTradeForPlayer(player.id);
      let score=base+need.bonus+Math.max(-8,Math.min(20,upgrade*.35));
      if(recent)score+=5;
      if(posKey(player)==='K'||posKey(player)==='D/ST')score-=need.bonus?4:20;
      const reasons=[need.label];
      if(upgrade>10)reasons.push(`clear upgrade over current ${posKey(player)} depth`);
      else if(upgrade>2)reasons.push(`small roster upgrade`);
      if(recent)reasons.push(`recently moved to ${leagueTeamName(owner)}`);
      out.push({playerId:player.id,ownerSlot:owner,score:Number(score.toFixed(2)),value:Number(base.toFixed(2)),upgrade:Number(upgrade.toFixed(2)),reason:reasons.join(' · '),updatedAt:new Date().toISOString()});
    }
    return out.sort((a,b)=>b.score-a.score).slice(0,12);
  }

  function currentTradeWeek(){
    return Math.max(1,Math.min(18,Number(state.currentWeek)||Number(document.getElementById('matchup-center-week')?.value)||Number(document.getElementById('lineup-week')?.value)||Number(document.getElementById('matchup-week')?.value)||1));
  }

  function playerWeekValue(p,week){
    if(typeof adjustedWeeklyProjection==='function'){
      try{return Number(adjustedWeeklyProjection(p,week)?.adjusted||0)}
      catch(_){/* no-op */}
    }
    if(typeof weeklyPlayerContext==='function'){
      try{return Number(weeklyPlayerContext(p,week)?.adjustedWeeklyProjection||0)}
      catch(_){/* no-op */}
    }
    return playerWeeklyValue(p);
  }

  function legalLineupFor(players,week){
    if(typeof window.bestWeeklyLineup==='function'){
      try{return window.bestWeeklyLineup(players,week)}
      catch(e){console.warn('Trade Center lineup comparison fell back',e)}
    }
    return{week,total:players.reduce((s,p)=>s+playerWeekValue(p,week),0),assignments:[],bench:[]};
  }

  function freeAgentUpgradeIdeas(week=currentTradeWeek()){
    ensureTradeData();
    const owned=new Set();
    for(let slot=1;slot<=leagueSize();slot++)seasonRosterIds(slot).forEach(id=>owned.add(id));
    (state.manualRosterIds||[]).forEach(id=>owned.add(id));
    const roster=seasonRoster(mySlot()),baseLineup=legalLineupFor(roster,week),baseTotal=Number(baseLineup.total||0);
    const bench=(baseLineup.bench&&baseLineup.bench.length?baseLineup.bench:roster).slice().sort((a,b)=>playerWeekValue(a,week)-playerWeekValue(b,week)||playerTradeValue(a)-playerTradeValue(b));
    const baseDrop=bench[0]||null;
    const pool=(state.players||[]).filter(p=>!owned.has(p.id)&&!/OUT|IR|SUSP|PUP|NFI/i.test(String(p.status||''))).map(p=>({p,weekly:playerWeekValue(p,week),rank:num(p.rank,9999),tradeValue:playerTradeValue(p)})).sort((a,b)=>b.weekly-a.weekly||a.rank-b.rank||b.tradeValue-a.tradeValue).slice(0,90);
    return pool.map(x=>{
      const candidateRoster=baseDrop?roster.filter(p=>p.id!==baseDrop.id).concat([x.p]):roster.concat([x.p]);
      const next=legalLineupFor(candidateRoster,week),gain=Number(next.total||0)-baseTotal;
      const need=myPositionNeed(x.p),reasonParts=[];
      if(gain>.25)reasonParts.push(`adds ${gain.toFixed(1)} projected Week ${week} points`);
      else reasonParts.push('bench depth or stash candidate');
      reasonParts.push(need.label);
      if(baseDrop)reasonParts.push(`drop comparison: ${baseDrop.name}`);
      return{playerId:x.p.id,week,score:Number((gain*5+x.weekly+need.bonus*.35+x.tradeValue*.08).toFixed(2)),weeklyProjection:Number(x.weekly.toFixed(2)),lineupGain:Number(gain.toFixed(2)),dropPlayerId:baseDrop?.id||null,reason:reasonParts.join(' · ')};
    }).filter(x=>x.lineupGain>-2||x.weeklyProjection>=8).sort((a,b)=>b.score-a.score||b.lineupGain-a.lineupGain).slice(0,10);
  }

  function refreshTradeRecommendations({persist=false}={}){
    state.tradeRecommendations=buildTradeRecommendations();
    if(persist)saveState();
    return state.tradeRecommendations;
  }

  function compactTradeNflWeek(week){
    if(typeof compactNflWeek==='function')return compactNflWeek(week);
    const raw=state.nflWeeks?.[String(week)]||null;if(!raw)return null;
    const ps=raw.projectionStatus||{};
    return{season:raw.season||state.settings?.season||null,week:Number(raw.week)||Number(week),source:raw.source||'',fetchedAt:raw.fetchedAt||'',projectionStatus:ps?{available:!!ps.available,provider:ps.provider||'',count:Number(ps.count)||0,matchedPlayers:Number(ps.matchedPlayers)||0,scoring:ps.scoring||'',fetchedAt:ps.fetchedAt||'',error:ps.error||''}:null,games:(raw.games||[]).map(g=>({home:g.home,away:g.away,date:g.date||'',status:g.status||'',venue:g.venue||'',indoor:g.indoor??null,neutralSite:!!g.neutralSite,weather:g.weather||'',temperature:g.temperature??null,wind:g.wind??null,overUnder:g.overUnder??null,spread:g.spread??null}))};
  }

  function tradeWeekContext(p,week){
    let x=null;
    if(typeof adjustedWeeklyProjection==='function'){
      try{x=adjustedWeeklyProjection(p,week)}catch(_){x=null}
    }
    if(!x&&typeof weeklyPlayerContext==='function'){
      try{x=weeklyPlayerContext(p,week)}catch(_){x=null}
    }
    if(!x)return null;
    const base=x.base??x.baseWeeklyProjection,adjusted=x.adjusted??x.adjustedWeeklyProjection;
    return{week,baseWeekProjection:num(base),adjustedWeekProjection:num(adjusted),matchupFactor:num(x.factor??x.matchupFactor),projectionSource:x.projectionSource||'',realWeeklyProjection:!!(x.realProjection||x.realWeeklyProjection),nflOpponent:x.opponent||x.nflOpponent||null,home:x.home??null,bye:!!x.bye,gameTime:x.gameTime||null,status:x.status||p.status||'',defenseVsPositionFactor:num(x.defenseVsPositionFactor??x.factors?.defenseVsPosition),overUnder:num(x.overUnder),spread:num(x.spread),wind:num(x.wind),weather:x.weather||null};
  }

  function tradeCompactPlayer(p,options={}){
    if(!p)return null;
    const opts=typeof options==='number'?{week:options}:options;
    const week=Math.max(1,Math.min(18,Number(opts.week)||Number(state.currentWeek)||Number(document.getElementById('lineup-week')?.value)||Number(document.getElementById('matchup-week')?.value)||1));
    const base={name:p.name,position:posKey(p),nflTeam:p.team||'',rank:num(p.rank),adp:num(p.adp),seasonProjection:num(p.projection),status:p.status||'',tradeValue:Number(playerTradeValue(p).toFixed(2))};
    if(opts.includeWeek!==false)base.weekContext=tradeWeekContext(p,week);
    return base;
  }

  function fitTradeAiContext(context){
    const withBudget=ctx=>{ctx.contextBytes=JSON.stringify(ctx).length;return ctx};
    if(JSON.stringify(context).length<=175000)return withBudget(context);
    context.contextTrimmed=true;
    context.currentAcquisitionBoard=(context.currentAcquisitionBoard||[]).slice(0,8);
    context.freeAgentUpgradeBoard=(context.freeAgentUpgradeBoard||[]).slice(0,8);
    context.involvedTeamRosters=(context.involvedTeamRosters||[]).map(team=>({...team,roster:(team.roster||[]).slice(0,16)}));
    if(JSON.stringify(context).length<=175000)return withBudget(context);
    if(context.myTeam?.roster)context.myTeam.roster=context.myTeam.roster.slice().sort((a,b)=>Number(b.tradeValue||0)-Number(a.tradeValue||0)).slice(0,18);
    if(JSON.stringify(context).length<=175000)return withBudget(context);
    if(context.nflWeek?.games)context.nflWeek.games=context.nflWeek.games.map(g=>({home:g.home,away:g.away,date:g.date,status:g.status,overUnder:g.overUnder,spread:g.spread,wind:g.wind,weather:g.weather}));
    return withBudget(context);
  }

  function installTradeUI(){
    ensureTradeData();
    const leagueNav=document.querySelector('.nav-item[data-tab="league"]');
    const backupNav=document.querySelector('.nav-item[data-tab="backup"]');
    const anchor=leagueNav||backupNav;
    if(anchor&&!document.querySelector('[data-tab="trades"]'))anchor.insertAdjacentHTML('beforebegin','<button class="nav-item" data-tab="trades">Trade Center</button>');

    const leagueView=document.getElementById('view-league'),backupView=document.getElementById('view-backup'),viewAnchor=leagueView||backupView;
    if(viewAnchor&&!document.getElementById('view-trades'))viewAnchor.insertAdjacentHTML('beforebegin',`
      <section class="view trade-view" id="view-trades">
        <div class="page-head compact-head trade-page-head">
          <div><div class="eyebrow">LEAGUE TRANSACTIONS</div><h1>Trade Center</h1><p class="page-copy">Keep every roster current, record completed trades, and continuously surface acquisition targets that improve ${esc(leagueTeamName(mySlot()))}.</p></div>
          <span class="trade-season-mode" id="trade-season-mode"></span>
        </div>

        <article class="surface trade-rec-surface">
          <div class="surface-head"><div><span class="section-label">MY ROSTER · ACQUISITION BOARD</span><h2>Recommended trade targets</h2><p class="trade-helper">Re-ranked automatically after every trade, add, drop or roster correction.</p></div><button class="btn secondary small" id="refresh-trade-recs">Refresh targets</button></div>
          <div id="trade-recommendations" class="trade-recommendations"></div>
        </article>

        <article class="surface trade-weekly-surface">
          <div class="surface-head"><div><span class="section-label">WEEKLY MOVES</span><h2 id="trade-weekly-title">Waivers & trades</h2><p class="trade-helper">AI compares free agents, trade targets, your lineup and this week's matchup.</p></div><button class="btn primary small" id="trade-ai-weekly">AI weekly plan</button></div>
          <div id="trade-free-agents" class="trade-free-agents"></div>
          <div id="trade-weekly-ai-output" class="trade-weekly-ai"></div>
        </article>

        <div class="trade-grid-main">
          <article class="surface trade-record-surface">
            <div class="surface-head"><div><span class="section-label">RECORD TRANSACTION</span><h2>Completed trade</h2><p class="trade-helper">Choose the two teams and the players moving each way. Rosters update immediately.</p></div></div>
            <div class="trade-team-selects"><label>Team A<select id="trade-team-a"></select></label><span class="trade-swap">⇄</span><label>Team B<select id="trade-team-b"></select></label></div>
            <div class="trade-player-columns"><div><div class="trade-column-title" id="trade-a-title">Team A sends</div><div id="trade-a-players" class="trade-player-picker"></div></div><div><div class="trade-column-title" id="trade-b-title">Team B sends</div><div id="trade-b-players" class="trade-player-picker"></div></div></div>
            <label class="trade-notes-label">Notes<input id="trade-notes" placeholder="Optional trade notes" /></label>
            <button class="btn primary" id="record-trade">Record trade & analyze</button>
          </article>

          <article class="surface roster-manager-surface">
            <div class="surface-head"><div><span class="section-label">ROSTER MANAGER</span><h2>League roster maintenance</h2><p class="trade-helper">Use this for waivers, drops or corrections outside a trade.</p></div></div>
            <label class="trade-roster-team-label">Team<select id="trade-roster-team"></select></label>
            <div id="trade-roster-list" class="trade-roster-list"></div>
            <div class="trade-add-player"><select id="trade-add-player"></select><button class="btn secondary" id="trade-add-player-btn">Add player</button></div>
          </article>
        </div>

        <article class="surface trade-history-surface">
          <div class="surface-head"><div><span class="section-label">TRADE LEDGER</span><h2>History & AI analysis</h2><p class="trade-helper">Every recorded trade stays in league state with its roster impact and AI review.</p></div></div>
          <div id="trade-history"></div>
        </article>
      </section>`);

    if(!document.getElementById('trade-center-style')){
      const s=document.createElement('style');s.id='trade-center-style';s.textContent=`
        .trade-view{max-width:1500px}.trade-page-head{align-items:flex-start}.trade-season-mode{font-size:10px;font-weight:900;letter-spacing:.06em;border:1px solid #334055;border-radius:999px;padding:7px 10px;color:#98a5ba;white-space:nowrap}
        .trade-rec-surface,.trade-weekly-surface{margin-bottom:16px;background:linear-gradient(145deg,#111620,#0c1119)!important;border-color:#2e394c!important}.trade-helper{margin:5px 0 0;color:#8591a5;font-size:12px;line-height:1.5}.trade-recommendations,.trade-free-agents{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.trade-target,.trade-free-agent{min-width:0;border:1px solid #2d394c;border-radius:14px;background:#0b1119;padding:14px;display:flex;flex-direction:column;gap:9px}.trade-target-top,.trade-free-agent-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.trade-target strong,.trade-free-agent strong{font-size:16px}.trade-target small,.trade-free-agent small{display:block;color:#7f8ca1;margin-top:3px}.trade-target-score,.trade-free-agent-score{font-weight:900;color:#73e59a;background:#10271a;border:1px solid #275b39;border-radius:999px;padding:5px 8px;white-space:nowrap}.trade-target-reason,.trade-free-agent-reason{font-size:11px;color:#9aa6b9;line-height:1.45;min-height:31px}.trade-target-actions{display:flex;gap:7px;align-items:center;margin-top:auto}.trade-target-ai{font-size:11px;line-height:1.5;border-top:1px solid #263144;padding-top:9px;color:#c2cad7}.trade-weekly-ai{margin-top:12px}.trade-weekly-ai .ai-note,.trade-weekly-ai .ai-response{margin-top:0}.trade-free-agent-gain{color:#a8ff45;font-weight:900}
        .trade-grid-main{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);gap:16px}.trade-record-surface,.roster-manager-surface,.trade-history-surface{overflow:hidden}.trade-team-selects{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:10px}.trade-team-selects label,.trade-roster-team-label,.trade-notes-label{display:flex;flex-direction:column;gap:6px;font-size:10px;font-weight:900;letter-spacing:.07em;color:#8f9caf;text-transform:uppercase}.trade-team-selects select,.trade-roster-team-label select,.trade-notes-label input,.trade-add-player select{width:100%;box-sizing:border-box}.trade-swap{padding-bottom:11px;color:#8e70ef;font-size:20px}.trade-player-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:15px 0}.trade-column-title{font-size:11px;font-weight:900;letter-spacing:.06em;color:#b6c0d0;margin-bottom:7px}.trade-player-picker{height:290px;overflow:auto;border:1px solid #2b3649;border-radius:12px;background:#0a0f17;padding:5px}.trade-pick-player{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:9px;padding:9px 8px;border-bottom:1px solid #202a39;cursor:pointer}.trade-pick-player:last-child{border-bottom:0}.trade-pick-player input{margin:0}.trade-pick-player span{min-width:0}.trade-pick-player strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.trade-pick-player small{display:block;color:#748197;font-size:10px}.trade-pick-value{font-size:10px;font-weight:900;color:#9aa8bb}.trade-notes-label{margin:8px 0 12px}
        .trade-roster-list{height:372px;overflow:auto;border:1px solid #2b3649;border-radius:12px;background:#0a0f17;margin:12px 0}.trade-roster-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:10px;border-bottom:1px solid #202a39}.trade-roster-row:last-child{border-bottom:0}.trade-roster-row strong{display:block;font-size:12px}.trade-roster-row small{display:block;font-size:10px;color:#748197}.trade-roster-value{font-size:10px;font-weight:900;color:#a9b4c5}.trade-add-player{display:grid;grid-template-columns:1fr auto;gap:8px}
        .trade-history-surface{margin-top:16px}.trade-history-card{border:1px solid #2d394c;border-radius:14px;background:#0b1119;margin-top:10px;overflow:hidden}.trade-history-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:14px 16px;border-bottom:1px solid #263144}.trade-history-head strong{display:block}.trade-history-head small{display:block;color:#79869a;margin-top:3px}.trade-history-actions{display:flex;gap:7px}.trade-flow{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px 16px}.trade-flow>div{border:1px solid #263144;border-radius:10px;padding:10px}.trade-flow span{display:block;font-size:9px;font-weight:900;color:#78869b;letter-spacing:.06em}.trade-flow b{display:block;margin-top:4px;font-size:12px}.trade-ai-analysis{margin:0 16px 15px;padding:12px;border:1px dashed #37445a;border-radius:11px;color:#c4ccd8;font-size:12px;line-height:1.55}.trade-ai-analysis.pending{color:#929eb1}.trade-empty{padding:18px;color:#78869b;text-align:center;font-size:12px}
        @media(max-width:1150px){.trade-recommendations,.trade-free-agents{grid-template-columns:repeat(2,minmax(0,1fr))}.trade-grid-main{grid-template-columns:1fr}}
        @media(max-width:700px){.trade-recommendations,.trade-free-agents{grid-template-columns:1fr}.trade-team-selects{grid-template-columns:1fr}.trade-swap{display:none}.trade-player-columns,.trade-flow{grid-template-columns:1fr}.trade-player-picker{height:220px}.trade-history-head{flex-direction:column}.trade-history-actions{width:100%}.trade-history-actions .btn{flex:1}.trade-add-player{grid-template-columns:1fr}.trade-target-actions{flex-wrap:wrap}}
      `;document.head.appendChild(s);
    }
  }

  function teamOptions(selected){
    ensureLeagueData();
    return state.leagueTeams.map(t=>`<option value="${t.slot}" ${Number(selected)===Number(t.slot)?'selected':''}>${esc(t.name)} · Slot ${t.slot}${t.slot===mySlot()?' · MY TEAM':''}</option>`).join('');
  }

  function renderTradePickers(){
    const a=Number(document.getElementById('trade-team-a')?.value||1),b=Number(document.getElementById('trade-team-b')?.value||2);
    const render=(slot,rootId,titleId,direction)=>{
      const root=document.getElementById(rootId),title=document.getElementById(titleId);if(!root)return;
      if(title)title.textContent=`${leagueTeamName(slot)} sends to ${leagueTeamName(direction)}`;
      const roster=seasonRoster(slot).sort((x,y)=>playerTradeValue(y)-playerTradeValue(x));
      root.innerHTML=roster.length?roster.map(p=>`<label class="trade-pick-player"><input type="checkbox" value="${esc(p.id)}" data-trade-send="${slot}"><span><strong>${esc(p.name)}</strong><small>${esc(posKey(p))} · ${esc(p.team||'')}</small></span><em class="trade-pick-value">${playerTradeValue(p).toFixed(0)}</em></label>`).join(''):'<div class="trade-empty">No maintained players on this roster.</div>';
    };
    render(a,'trade-a-players','trade-a-title',b);render(b,'trade-b-players','trade-b-title',a);
  }

  function renderRosterManager(){
    const select=document.getElementById('trade-roster-team');if(!select)return;
    const slot=Number(select.value||mySlot());
    const root=document.getElementById('trade-roster-list');
    const roster=seasonRoster(slot).sort((a,b)=>playerTradeValue(b)-playerTradeValue(a));
    if(root)root.innerHTML=roster.length?roster.map(p=>`<div class="trade-roster-row"><span><strong>${esc(p.name)}</strong><small>${esc(posKey(p))} · ${esc(p.team||'')} ${p.status?`· ${esc(p.status)}`:''}</small></span><em class="trade-roster-value">${playerTradeValue(p).toFixed(0)}</em><button class="btn secondary small" data-trade-drop="${esc(p.id)}" data-slot="${slot}">Drop</button></div>`).join(''):'<div class="trade-empty">No players maintained for this team.</div>';
    const owned=new Set();for(let s=1;s<=leagueSize();s++)seasonRosterIds(s).forEach(id=>owned.add(id));
    const available=(state.players||[]).filter(p=>!owned.has(p.id)).sort((a,b)=>num(a.rank,9999)-num(b.rank,9999)).slice(0,650);
    const add=document.getElementById('trade-add-player');if(add)add.innerHTML='<option value="">Add free agent / unassigned player…</option>'+available.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(posKey(p))} · ${esc(p.team||'')}</option>`).join('');
  }

  function recommendationMarkup(rec){
    const p=getPlayer(rec.playerId);if(!p)return'';
    const analysis=state.tradeTargetAnalyses?.[p.id];
    return`<div class="trade-target"><div class="trade-target-top"><div><strong>${esc(p.name)}</strong><small>${esc(posKey(p))} · ${esc(p.team||'')} · ${esc(leagueTeamName(rec.ownerSlot))}</small></div><span class="trade-target-score">${Math.round(rec.score)}</span></div><div class="trade-target-reason">${esc(rec.reason)}</div><div class="trade-target-actions"><span class="mini-pill">Value ${Math.round(rec.value)}</span><button class="btn secondary small" data-analyze-target="${esc(p.id)}">${analysis?'Re-analyze':'AI analyze'}</button></div>${analysis?`<div class="trade-target-ai">${esc(analysis.text||'').replaceAll('\n','<br>')}</div>`:''}</div>`;
  }

  function renderRecommendations(){
    const root=document.getElementById('trade-recommendations');if(!root)return;
    const recs=refreshTradeRecommendations();
    root.innerHTML=recs.length?recs.slice(0,9).map(recommendationMarkup).join(''):'<div class="trade-empty">Maintain opponent rosters to generate acquisition targets.</div>';
  }

  function freeAgentMarkup(rec){
    const p=getPlayer(rec.playerId),drop=getPlayer(rec.dropPlayerId);if(!p)return'';
    return`<div class="trade-free-agent"><div class="trade-free-agent-top"><div><strong>${esc(p.name)}</strong><small>${esc(posKey(p))} · ${esc(p.team||'')} · Free agent</small></div><span class="trade-free-agent-score">${rec.weeklyProjection.toFixed(1)}</span></div><div class="trade-free-agent-reason">${esc(rec.reason)}</div><div><span class="mini-pill">Week ${rec.week}</span> <span class="mini-pill trade-free-agent-gain">${rec.lineupGain>=0?'+':''}${rec.lineupGain.toFixed(1)}</span>${drop?` <span class="mini-pill">Drop ${esc(drop.name)}</span>`:''}</div></div>`;
  }

  function renderWeeklyMoves(){
    const week=currentTradeWeek(),title=document.getElementById('trade-weekly-title'),freeRoot=document.getElementById('trade-free-agents'),aiRoot=document.getElementById('trade-weekly-ai-output');
    if(title)title.textContent=`Waivers & trades for Week ${week}`;
    const ideas=freeAgentUpgradeIdeas(week);
    if(freeRoot)freeRoot.innerHTML=ideas.length?ideas.slice(0,6).map(freeAgentMarkup).join(''):'<div class="trade-empty">No free-agent upgrades found from the current player pool.</div>';
    if(aiRoot){
      const ai=state.tradeWeeklyAi?.[String(week)];
      aiRoot.innerHTML=ai?.text?`<div class="${ai.status==='error'?'ai-note':'ai-response'}">${esc(ai.text).replaceAll('\n','<br>')}</div>`:'';
    }
  }

  function playerNames(ids){return(ids||[]).map(getPlayer).filter(Boolean).map(p=>p.name)}

  function renderTradeHistory(){
    const root=document.getElementById('trade-history');if(!root)return;
    const trades=[...(state.trades||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    root.innerHTML=trades.length?trades.map(t=>{
      const aNames=playerNames(t.aToB),bNames=playerNames(t.bToA),analysis=t.aiAnalysis||'';
      const stateText=t.aiStatus==='loading'?'AI is evaluating roster impact and acquisition opportunities…':analysis||'AI analysis has not run yet.';
      return`<div class="trade-history-card"><div class="trade-history-head"><div><strong>${esc(leagueTeamName(t.teamA))} ⇄ ${esc(leagueTeamName(t.teamB))}</strong><small>${prettyDateTime(t.createdAt)}${t.notes?` · ${esc(t.notes)}`:''}</small></div><div class="trade-history-actions"><button class="btn secondary small" data-reanalyze-trade="${esc(t.id)}">Analyze</button><button class="btn secondary small" data-undo-trade="${esc(t.id)}">Undo</button></div></div><div class="trade-flow"><div><span>${esc(leagueTeamName(t.teamB))} RECEIVED</span><b>${aNames.length?esc(aNames.join(', ')):'—'}</b></div><div><span>${esc(leagueTeamName(t.teamA))} RECEIVED</span><b>${bNames.length?esc(bNames.join(', ')):'—'}</b></div></div><div class="trade-ai-analysis ${t.aiStatus==='loading'?'pending':''}">${esc(stateText).replaceAll('\n','<br>')}</div></div>`;
    }).join(''):'<div class="trade-empty">No trades recorded yet.</div>';
  }

  function renderTradeCenter(){
    ensureTradeData();ensureLeagueData();
    const mode=document.getElementById('trade-season-mode');if(mode)mode.textContent=state.seasonRosterMode?'SEASON ROSTER MODE':draftLogComplete()?'DRAFT COMPLETE':'DRAFT LOG INCOMPLETE';
    const a=document.getElementById('trade-team-a'),b=document.getElementById('trade-team-b'),r=document.getElementById('trade-roster-team');
    if(a&&!a.options.length)a.innerHTML=teamOptions(mySlot());
    if(b&&!b.options.length)b.innerHTML=teamOptions(mySlot()===1?2:1);
    if(r&&!r.options.length)r.innerHTML=teamOptions(mySlot());
    if(a&&b&&Number(a.value)===Number(b.value)){const alt=state.leagueTeams.find(t=>t.slot!==Number(a.value));if(alt)b.value=String(alt.slot)}
    renderRecommendations();renderWeeklyMoves();renderTradePickers();renderRosterManager();renderTradeHistory();
  }

  function selectedTradeIds(slot){return[...document.querySelectorAll(`[data-trade-send="${slot}"]:checked`)].map(x=>x.value)}

  function postRosterMutation(message){
    refreshTradeRecommendations({persist:true});
    lineupResult=null;
    if(typeof renderRoster==='function')renderRoster();
    if(typeof renderOpponentRosterEditor==='function')renderOpponentRosterEditor();
    if(typeof renderAdvice==='function')renderAdvice();
    renderTradeCenter();toast(message);
  }

  async function recordTrade(){
    if(!ensureSeasonModeForTransactions())return;
    const a=Number(document.getElementById('trade-team-a')?.value||0),b=Number(document.getElementById('trade-team-b')?.value||0);
    if(!a||!b||a===b)return toast('Choose two different teams','error');
    const aToB=selectedTradeIds(a),bToA=selectedTradeIds(b);
    if(!aToB.length&&!bToA.length)return toast('Select at least one player moving in the trade','error');
    for(const id of aToB)if(ownerSlotOf(id)!==a)return toast(`${getPlayer(id)?.name||'A player'} is no longer on ${leagueTeamName(a)}`,'error');
    for(const id of bToA)if(ownerSlotOf(id)!==b)return toast(`${getPlayer(id)?.name||'A player'} is no longer on ${leagueTeamName(b)}`,'error');
    aToB.forEach(id=>setPlayerOwner(id,b));bToA.forEach(id=>setPlayerOwner(id,a));
    const trade={id:`trade-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,createdAt:new Date().toISOString(),teamA:a,teamB:b,aToB,bToA,notes:document.getElementById('trade-notes')?.value?.trim()||'',aiStatus:'loading',aiAnalysis:''};
    state.trades.push(trade);refreshTradeRecommendations();saveState();
    const notes=document.getElementById('trade-notes');if(notes)notes.value='';
    postRosterMutation('Trade recorded — AI analysis running');
    analyzeRecordedTrade(trade.id).catch(()=>{});
  }

  function tradeContext(trade,focusTarget=null,intent='trade'){
    refreshTradeRecommendations();
    const week=currentTradeWeek();
    const recommendations=(state.tradeRecommendations||[]).slice(0,8).map(r=>({player:tradeCompactPlayer(getPlayer(r.playerId),{week}),ownerTeam:leagueTeamName(r.ownerSlot),ownerSlot:r.ownerSlot,acquisitionScore:r.score,upgradeVsCurrentDepth:r.upgrade,reason:r.reason}));
    const freeAgents=freeAgentUpgradeIdeas(week).slice(0,8).map(r=>({player:tradeCompactPlayer(getPlayer(r.playerId),{week}),projectedWeekPoints:r.weeklyProjection,lineupGainIfAdded:r.lineupGain,dropCandidate:r.dropPlayerId?tradeCompactPlayer(getPlayer(r.dropPlayerId),{week}):null,score:r.score,reason:r.reason}));
    const matchup=typeof matchupAnalysis==='function'?matchupAnalysis(week):null;
    const sim=matchup?.opponent&&typeof simulateWeeklyMatchup==='function'?simulateWeeklyMatchup(week,2500):null;
    const bestLineup=typeof window.bestWeeklyLineup==='function'?window.bestWeeklyLineup(seasonRoster(mySlot()),week):null;
    const event=trade?{id:trade.id,teamA:{slot:trade.teamA,name:leagueTeamName(trade.teamA)},teamB:{slot:trade.teamB,name:leagueTeamName(trade.teamB)},teamAToTeamB:(trade.aToB||[]).map(id=>tradeCompactPlayer(getPlayer(id),{week})),teamBToTeamA:(trade.bToA||[]).map(id=>tradeCompactPlayer(getPlayer(id),{week})),notes:trade.notes||'',completedAt:trade.createdAt}:null;
    const involvedSlots=trade?[trade.teamA,trade.teamB]:focusTarget?[ownerSlotOf(focusTarget.id)]:[];
    return fitTradeAiContext({mode:intent==='weekly-moves'?'weeklyTradeAndWaiverPlan':'trade',week,league:{name:state.settings.leagueName,teams:state.settings.teams,scoring:state.settings.scoring,roster:state.settings.roster},myTeam:{slot:mySlot(),name:leagueTeamName(mySlot()),roster:seasonRoster(mySlot()).map(p=>tradeCompactPlayer(p,{week})),bestLegalLineup:bestLineup?{projectedPoints:Number(bestLineup.total.toFixed(2)),starters:(bestLineup.assignments||[]).filter(x=>x.player).map(x=>({slot:x.slot.label,player:tradeCompactPlayer(x.player,{week,includeWeek:false}),weekContext:tradeWeekContext(x.player,week),weekProjection:x.weekly?Number(Number(x.weekly.adjusted||0).toFixed(2)):null}))}:null},weeklyMatchup:matchup?{opponentSlot:matchup.opponent||null,opponentName:matchup.opponent?leagueTeamName(matchup.opponent):null,myRosterProjection:Number(Number(matchup.myScore||0).toFixed(2)),opponentRosterProjection:Number(Number(matchup.theirScore||0).toFixed(2)),simulation:sim?{runs:sim.runs,myMean:Number(sim.myMean.toFixed(2)),opponentMean:Number(sim.opponentMean.toFixed(2)),winProbability:Number(sim.winProbability.toFixed(4))}:null}:null,completedTrade:event,focusTarget:focusTarget?{player:tradeCompactPlayer(focusTarget,{week}),currentOwnerSlot:ownerSlotOf(focusTarget.id),currentOwnerName:leagueTeamName(ownerSlotOf(focusTarget.id))}:null,involvedTeamRosters:[...new Set(involvedSlots.filter(Boolean))].map(slot=>({slot,name:leagueTeamName(slot),roster:seasonRoster(slot).map(p=>tradeCompactPlayer(p,{week}))})),currentAcquisitionBoard:recommendations,freeAgentUpgradeBoard:freeAgents,nflWeek:compactTradeNflWeek(week),instruction:intent==='weekly-moves'?'Create a prioritized action plan for this week. Compare free-agent adds/drops and trade targets against my current best legal lineup and weekly matchup. Put immediate waiver upgrades first, then trade targets with realistic offer ideas, and clearly say when holding is better. Use only supplied projections, rosters, ownership and matchup data.':trade&&[trade.teamA,trade.teamB].includes(mySlot())?'Evaluate the completed trade for my team, including what I gained/lost and what move should follow.':focusTarget?'Evaluate whether this specific target is worth acquiring for my roster and what type of offer is justified from the supplied data. Include whether a free-agent alternative is better for this week.':'A trade occurred between other teams. Assess whether any moved player, free agent, or newly changed roster situation creates an acquisition opportunity for my team.'});
  }

  async function callTradeAi(context){
    const res=await fetch(typeof aiEndpoint==='function'?aiEndpoint():'/api/ai-advice',{method:'POST',headers:typeof authorizedJsonHeaders==='function'?await authorizedJsonHeaders():{'Content-Type':'application/json'},body:JSON.stringify({task:'trade',context})});
    const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`AI service returned ${res.status}`);const text=String(data.advice||'').trim();if(!text)throw new Error('AI service returned no advice');return text;
  }

  async function analyzeRecordedTrade(id){
    const trade=(state.trades||[]).find(t=>t.id===id);if(!trade)return;
    trade.aiStatus='loading';saveState();renderTradeHistory();
    try{trade.aiAnalysis=await callTradeAi(tradeContext(trade));trade.aiStatus='done';trade.aiAnalyzedAt=new Date().toISOString();saveState();renderTradeHistory();renderRecommendations()}
    catch(e){trade.aiStatus='error';trade.aiAnalysis=`AI analysis unavailable: ${e.message}`;saveState();renderTradeHistory()}
  }

  async function analyzeTarget(id){
    const p=getPlayer(id);if(!p)return;
    state.tradeTargetAnalyses[id]={text:'Analyzing target…',status:'loading',updatedAt:new Date().toISOString()};saveState();renderRecommendations();
    try{const text=await callTradeAi(tradeContext(null,p));state.tradeTargetAnalyses[id]={text,status:'done',updatedAt:new Date().toISOString()};saveState();renderRecommendations()}
    catch(e){state.tradeTargetAnalyses[id]={text:`AI analysis unavailable: ${e.message}`,status:'error',updatedAt:new Date().toISOString()};saveState();renderRecommendations()}
  }

  async function analyzeWeeklyMoves(){
    const week=currentTradeWeek(),btn=document.getElementById('trade-ai-weekly'),out=document.getElementById('trade-weekly-ai-output');
    if(btn){btn.disabled=true;btn.dataset.originalText=btn.dataset.originalText||btn.textContent;btn.textContent=`Analyzing Week ${week}…`}
    if(out)out.innerHTML=`<div class="ai-note">Analyzing Week ${week} waivers, trade targets, lineup fit and matchup context…</div>`;
    try{
      if(typeof loadNflWeek==='function')await loadNflWeek(week,false);
      const text=await callTradeAi(tradeContext(null,null,'weekly-moves'));
      state.tradeWeeklyAi[String(week)]={text,status:'done',updatedAt:new Date().toISOString()};
      saveState();renderWeeklyMoves();
    }catch(e){
      state.tradeWeeklyAi[String(week)]={text:`AI weekly plan unavailable: ${e.message}`,status:'error',updatedAt:new Date().toISOString()};
      saveState();renderWeeklyMoves();
    }finally{
      const live=document.getElementById('trade-ai-weekly');if(live){live.disabled=false;live.textContent=live.dataset.originalText||'AI weekly plan'}
    }
  }

  function undoTrade(id){
    if(!ensureSeasonModeForTransactions())return;
    const trade=(state.trades||[]).find(t=>t.id===id);if(!trade)return;
    for(const playerId of trade.aToB||[])if(ownerSlotOf(playerId)!==Number(trade.teamB))return toast(`Cannot undo: ${getPlayer(playerId)?.name||'a player'} has moved again since this trade.`,'error');
    for(const playerId of trade.bToA||[])if(ownerSlotOf(playerId)!==Number(trade.teamA))return toast(`Cannot undo: ${getPlayer(playerId)?.name||'a player'} has moved again since this trade.`,'error');
    if(!confirm(`Undo the trade between ${leagueTeamName(trade.teamA)} and ${leagueTeamName(trade.teamB)}?`))return;
    (trade.aToB||[]).forEach(playerId=>setPlayerOwner(playerId,trade.teamA));(trade.bToA||[]).forEach(playerId=>setPlayerOwner(playerId,trade.teamB));
    state.trades=state.trades.filter(t=>t.id!==id);postRosterMutation('Trade undone');
  }

  function dropPlayer(id,slot){
    if(!ensureSeasonModeForTransactions())return;
    const p=getPlayer(id);if(!p)return;if(!confirm(`Drop ${p.name} from ${leagueTeamName(slot)}?`))return;
    setPlayerOwner(id,null);postRosterMutation(`${p.name} removed from ${leagueTeamName(slot)}`);
  }

  function addPlayerToManagedRoster(){
    if(!ensureSeasonModeForTransactions())return;
    const slot=Number(document.getElementById('trade-roster-team')?.value||0),id=document.getElementById('trade-add-player')?.value;
    if(!slot||!id)return toast('Choose a player to add','error');const p=getPlayer(id);if(!p)return;
    setPlayerOwner(id,slot);postRosterMutation(`${p.name} added to ${leagueTeamName(slot)}`);
  }

  function bindTradeControls(){
    document.querySelector('.nav-item[data-tab="trades"]')?.addEventListener('click',()=>{switchTab('trades');renderTradeCenter()});
    document.getElementById('trade-team-a')?.addEventListener('change',()=>{const a=Number(document.getElementById('trade-team-a').value),b=document.getElementById('trade-team-b');if(b&&Number(b.value)===a){const alt=state.leagueTeams.find(t=>t.slot!==a);if(alt)b.value=String(alt.slot)}renderTradePickers()});
    document.getElementById('trade-team-b')?.addEventListener('change',()=>{const b=Number(document.getElementById('trade-team-b').value),a=document.getElementById('trade-team-a');if(a&&Number(a.value)===b){const alt=state.leagueTeams.find(t=>t.slot!==b);if(alt)a.value=String(alt.slot)}renderTradePickers()});
    document.getElementById('trade-roster-team')?.addEventListener('change',renderRosterManager);
    document.getElementById('record-trade')?.addEventListener('click',recordTrade);
    document.getElementById('trade-add-player-btn')?.addEventListener('click',addPlayerToManagedRoster);
    document.getElementById('refresh-trade-recs')?.addEventListener('click',()=>{refreshTradeRecommendations({persist:true});renderRecommendations();toast('Trade targets refreshed')});
    document.getElementById('trade-ai-weekly')?.addEventListener('click',()=>analyzeWeeklyMoves().catch(()=>{}));
    document.getElementById('view-trades')?.addEventListener('click',e=>{const drop=e.target.closest('[data-trade-drop]');if(drop)return dropPlayer(drop.dataset.tradeDrop,Number(drop.dataset.slot));const undo=e.target.closest('[data-undo-trade]');if(undo)return undoTrade(undo.dataset.undoTrade);const re=e.target.closest('[data-reanalyze-trade]');if(re)return analyzeRecordedTrade(re.dataset.reanalyzeTrade).catch(()=>{});const target=e.target.closest('[data-analyze-target]');if(target)return analyzeTarget(target.dataset.analyzeTarget).catch(()=>{})});
  }

  ensureTradeData();installTradeUI();bindTradeControls();refreshTradeRecommendations();renderTradeCenter();
  const tradeBaseRenderAll=renderAll;
  renderAll=function(){tradeBaseRenderAll();renderTradeCenter()};
  window.renderTradeCenter=renderTradeCenter;
  window.refreshTradeRecommendations=refreshTradeRecommendations;
  window.ownerSlotOf=ownerSlotOf;
  window.freeAgentUpgradeIdeas=freeAgentUpgradeIdeas;
})();
