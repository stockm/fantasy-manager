// Post-draft team-first dashboard. Keeps the draft dashboard before completion and switches to a season control center afterwards.
(function installSeasonDashboard(){
  const baseRenderDashboard=renderDashboard;
  const complete=()=>typeof isDraftComplete==='function'?isDraftComplete():teamForOverall(currentOverallPick()).round>Number(state.settings.rounds||0);
  const week=()=>Math.max(1,Math.min(18,Number(state.currentWeek)||1));
  const teamName=()=>typeof leagueTeamName==='function'?leagueTeamName(Number(state.settings.draftSlot)):(state.settings.teamName||'My Team');
  const roster=()=>typeof rosterForSlot==='function'?rosterForSlot(Number(state.settings.draftSlot)):myRoster();
  const val=p=>Number(typeof playerWeeklyValue==='function'?playerWeeklyValue(p):(num(p?.projection)??0))||0;
  function leagueRank(){
    if(typeof rosterForSlot!=='function'||!(state.leagueTeams||[]).length)return{rank:null,total:0,leader:null};
    const rows=(state.leagueTeams||[]).map(t=>({slot:Number(t.slot),name:t.name,total:rosterForSlot(t.slot).reduce((s,p)=>s+val(p),0)})).sort((a,b)=>b.total-a.total);
    return{rank:rows.findIndex(x=>x.slot===Number(state.settings.draftSlot))+1,total:rows.find(x=>x.slot===Number(state.settings.draftSlot))?.total||0,leader:rows[0]||null};
  }
  function topFreeAgents(limit=4){
    const owned=new Set(Object.values(state.teamRosters||{}).flat());
    (state.picks||[]).forEach(p=>owned.add(p.playerId));
    (state.manualRosterIds||[]).forEach(id=>owned.add(id));
    return(state.players||[]).filter(p=>!owned.has(p.id)&&!/(OUT|IR|SUSP)/i.test(String(p.status||''))).sort((a,b)=>{
      const ar=num(a.rank,99999),br=num(b.rank,99999);if(ar!==br)return ar-br;return val(b)-val(a)
    }).slice(0,limit);
  }
  function watchList(){return roster().filter(p=>p.status&&!/ACTIVE|HEALTHY/i.test(String(p.status))).slice(0,4)}
  function bindActions(root){root.querySelectorAll('[data-season-go]').forEach(b=>b.addEventListener('click',()=>{const tab=b.dataset.seasonGo;if(tab==='matchups'){state.currentWeek=week();saveState()}switchTab(tab)}))}
  function renderSeason(){
    const root=document.getElementById('view-dashboard');if(!root)return;
    const w=week(),myRoster=roster(),rank=leagueRank(),opp=Number(state.matchups?.[String(w)]||0),free=topFreeAgents(),watch=watchList();
    let lineup=null;try{if(typeof window.bestWeeklyLineup==='function')lineup=window.bestWeeklyLineup(myRoster,w)}catch(e){}
    const lineupTotal=Number(lineup?.total||0),topStarter=(lineup?.assignments||[]).filter(x=>x.player).sort((a,b)=>Number(b.weekly?.adjusted||0)-Number(a.weekly?.adjusted||0))[0];
    const bench=(lineup?.bench||[]).slice().sort((a,b)=>val(b)-val(a));
    root.classList.add('season-dashboard');
    root.innerHTML=`
      <div class="season-hero"><div><div class="eyebrow">SEASON COMMAND CENTER · WEEK ${w}</div><h1>${esc(teamName())}</h1><p>Manage your lineup, matchup, waivers and trades from one team-first dashboard.</p></div><div class="season-hero-actions"><button class="btn secondary" data-season-go="roster">My Roster</button><button class="btn primary" data-season-go="matchups">Analyze Week ${w}</button></div></div>
      <div class="season-kpis">
        <button class="season-kpi" data-season-go="roster"><span>ROSTER</span><strong>${myRoster.length}</strong><small>${myRoster.length} players · review lineup</small></button>
        <button class="season-kpi" data-season-go="matchups"><span>LEAGUE POWER</span><strong>${rank.rank?`#${rank.rank}`:'—'}</strong><small>${rank.leader?`Leader: ${esc(rank.leader.name)}`:'League rosters needed'}</small></button>
        <button class="season-kpi" data-season-go="matchups"><span>WEEK ${w} PROJECTION</span><strong>${lineupTotal?lineupTotal.toFixed(1):'—'}</strong><small>${topStarter?`Top: ${esc(topStarter.player.name)}`:'Optimize your lineup'}</small></button>
        <button class="season-kpi" data-season-go="matchups"><span>OPPONENT</span><strong>${opp?esc(leagueTeamName(opp)):'—'}</strong><small>${opp?'Open matchup intelligence':'Import weekly matchup'}</small></button>
      </div>
      <div class="season-main-grid">
        <article class="surface season-feature season-matchup-card"><div class="season-card-head"><div><span class="section-label">THIS WEEK</span><h2>${opp?`${esc(teamName())} vs ${esc(leagueTeamName(opp))}`:`Week ${w} matchup`}</h2></div><button class="btn secondary small" data-season-go="matchups">Open matchup →</button></div><div class="season-matchup-body"><div><span>Best legal lineup</span><strong>${lineupTotal?lineupTotal.toFixed(1):'—'}</strong><small>Adjusted Week ${w} points</small></div><div><span>Top projected starter</span><strong>${topStarter?esc(topStarter.player.name):'—'}</strong><small>${topStarter?`${Number(topStarter.weekly?.adjusted||0).toFixed(1)} pts`:''}</small></div><div><span>Opponent</span><strong>${opp?esc(leagueTeamName(opp)):'Not imported'}</strong><small>${opp?'Ready for AI analysis':'Use Screenshot Import'}</small></div></div></article>
        <article class="surface season-feature"><div class="season-card-head"><div><span class="section-label">ROSTER HEALTH</span><h2>${watch.length?`${watch.length} player${watch.length===1?'':'s'} to watch`:'Roster looks healthy'}</h2></div><button class="btn secondary small" data-season-go="roster">Review roster →</button></div><div class="season-list">${watch.length?watch.map(p=>`<div><span><b>${esc(p.name)}</b><small>${esc(primaryPos(p))} · ${esc(p.team||'')}</small></span><em>${esc(p.status)}</em></div>`).join(''):`<div class="season-good">No injury/status flags on your current roster.</div>`}</div></article>
        <article class="surface season-feature season-free-agents"><div class="season-card-head"><div><span class="section-label">WAIVER WIRE</span><h2>Best available players</h2></div><button class="btn secondary small" data-season-go="trades">Waivers & trades →</button></div><div class="season-list">${free.map((p,i)=>`<div><span class="season-rank">${i+1}</span><span><b>${esc(p.name)}</b><small>${esc(primaryPos(p))} · ${esc(p.team||'')} · ECR ${formatRank(p.rank)}</small></span><strong>${num(p.projection)!==null?Number(p.projection).toFixed(1):'—'}</strong></div>`).join('')||'<div class="season-good">No free-agent data available.</div>'}</div></article>
        <article class="surface season-feature"><div class="season-card-head"><div><span class="section-label">TEAM DEPTH</span><h2>Bench assets</h2></div><button class="btn secondary small" data-season-go="roster">Full roster →</button></div><div class="season-list">${bench.slice(0,4).map(p=>`<div><span><b>${esc(p.name)}</b><small>${esc(primaryPos(p))} · ${esc(p.team||'')}</small></span><strong>${num(p.rank)!==null?'#'+formatRank(p.rank):''}</strong></div>`).join('')||'<div class="season-good">Optimize the lineup to identify bench depth.</div>'}</div></article>
      </div>
      <div class="season-actions-grid">
        <button class="season-action primary" data-season-go="matchups"><span>01</span><div><b>Weekly Matchups</b><small>Win probability, best lineup and AI strategy</small></div><i>→</i></button>
        <button class="season-action" data-season-go="roster"><span>02</span><div><b>Optimize My Roster</b><small>Set starters and evaluate your bench</small></div><i>→</i></button>
        <button class="season-action" data-season-go="trades"><span>03</span><div><b>Trade Center</b><small>Targets, waiver upgrades and completed trades</small></div><i>→</i></button>
        <button class="season-action" data-season-go="import"><span>04</span><div><b>Import Yahoo Screenshot</b><small>Update weekly matchups and league rosters</small></div><i>→</i></button>
      </div>`;
    bindActions(root);renderFeedStatus?.();
  }
  renderDashboard=function(){if(!complete())return baseRenderDashboard();renderSeason()};
  window.renderSeasonDashboard=renderSeason;
  if(document.getElementById('view-dashboard')?.classList.contains('active'))setTimeout(()=>renderDashboard(),0);
})();
