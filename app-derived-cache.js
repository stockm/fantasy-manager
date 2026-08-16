// Scheduled/server-derived fantasy cache. Heavy weekly calculations are rendered from Firestore immediately;
// users can still force a fresh provider + cache calculation from any season-management screen.
(function installDerivedCache(){
  const CACHE_VERSION=1;
  const clampWeek=v=>Math.max(1,Math.min(18,Number(v)||1));
  function hash(input){let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)}
  function signature(week){
    const players=(state.players||[]).map(p=>[p.id,p.team,p.position,p.positions,p.rank,p.adp,p.projection,p.status,p.weeklyProjections?.[String(week)]]);
    return hash(JSON.stringify({settings:{teams:state.settings?.teams,draftSlot:state.settings?.draftSlot,scoring:state.settings?.scoring,season:state.settings?.season,roster:state.settings?.roster},picks:(state.picks||[]).map(p=>[p.playerId,p.teamSlot,!!p.rosterRemoved]),teamRosters:state.teamRosters||{},manualRosterIds:state.manualRosterIds||[],matchups:state.matchups||{},weeklyMatchups:state.weeklyMatchups||{},defenseVsPos:state.defenseVsPos||{},players}));
  }
  function currentWeek(){return clampWeek(document.getElementById('matchup-center-week')?.value||document.getElementById('lineup-week')?.value||state.currentWeek||1)}
  function cacheFor(week=currentWeek()){
    const c=state.derivedCache;if(!c||Number(c.version)!==CACHE_VERSION||Number(c.week)!==Number(week))return null;
    if(c.signature!==signature(week))return null;
    const expiry=new Date(c.expiresAt||0).getTime();if(Number.isFinite(expiry)&&expiry&&Date.now()>expiry)return null;
    return c;
  }
  function ageText(c){if(!c?.generatedAt)return'Precomputed cache';const mins=Math.max(0,Math.round((Date.now()-new Date(c.generatedAt).getTime())/60000));return mins<1?'Precomputed just now':mins<60?`Precomputed ${mins}m ago`:`Precomputed ${Math.floor(mins/60)}h ago`}
  function ensureStyle(){if(document.getElementById('derived-cache-style'))return;const s=document.createElement('style');s.id='derived-cache-style';s.textContent=`
    .derived-refresh-wrap{display:flex;align-items:center;gap:9px;margin-left:auto}.derived-cache-age{font-size:10px;color:#728075;white-space:nowrap}.derived-refresh{min-width:104px}.derived-refresh.busy{cursor:wait;opacity:.8}.derived-refresh .spin{display:inline-block;width:11px;height:11px;margin-right:6px;vertical-align:-1px;border:2px solid rgba(168,255,69,.22);border-top-color:#a8ff45;border-radius:50%;animation:derivedSpin .7s linear infinite}@keyframes derivedSpin{to{transform:rotate(360deg)}}
    .derived-cache-banner{display:flex;align-items:center;gap:8px;margin:0 0 13px;padding:8px 11px;border:1px solid #29372c;border-radius:10px;background:#09100b;color:#849187;font-size:10px}.derived-cache-banner:before{content:'';width:6px;height:6px;border-radius:50%;background:#a8ff45;box-shadow:0 0 9px rgba(168,255,69,.35)}
    @media(max-width:760px){.derived-refresh-wrap{width:100%;justify-content:space-between}.derived-cache-age{white-space:normal}}
  `;document.head.appendChild(s)}
  function refreshHost(viewId){const view=document.getElementById(viewId);if(!view)return null;return view.querySelector('.page-head,.season-hero,.trade-page-head,.matchup-center-head')||view.firstElementChild}
  function ensureRefreshControl(viewId){
    const host=refreshHost(viewId);if(!host)return;const id=`derived-refresh-${viewId}`;if(document.getElementById(id))return;
    const wrap=document.createElement('div');wrap.className='derived-refresh-wrap';wrap.id=id;wrap.innerHTML=`<span class="derived-cache-age"></span><button class="btn secondary small derived-refresh">Refresh now</button>`;host.appendChild(wrap);wrap.querySelector('button').addEventListener('click',()=>refreshNow());updateRefreshLabels();
  }
  function updateRefreshLabels(){const c=cacheFor();document.querySelectorAll('.derived-cache-age').forEach(el=>el.textContent=c?ageText(c):'No precomputed cache yet')}
  async function refreshNow(){
    if(!currentFirebaseUser)return toast?.('Sign in to refresh cached analysis','error');const buttons=[...document.querySelectorAll('.derived-refresh')];buttons.forEach(b=>{b.disabled=true;b.classList.add('busy');b.dataset.label=b.textContent;b.innerHTML='<span class="spin"></span>Refreshing…'});
    try{
      const token=await currentFirebaseUser.getIdToken();const r=await fetch('/api/refresh-derived-cache',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'}),data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`Refresh failed (${r.status})`);
      if(data.cache){state.derivedCache=data.cache;state.tradeRecommendations=data.cache.tradeRecommendations||state.tradeRecommendations||[]}
      if(typeof loadNflWeek==='function')await loadNflWeek(currentWeek(),true);
      saveState?.();renderActive();toast?.('Fantasy analysis cache refreshed');
    }catch(e){console.error('Derived cache refresh failed',e);toast?.(e.message||'Could not refresh analysis','error')}
    finally{buttons.forEach(b=>{b.disabled=false;b.classList.remove('busy');b.textContent=b.dataset.label||'Refresh now'});updateRefreshLabels()}
  }
  function renderActive(){const active=document.querySelector('.view.active')?.id;if(active==='view-dashboard')renderDashboard?.();else if(active==='view-matchups')window.renderMatchupCenter?.();else if(active==='view-roster')renderRoster?.();else if(active==='view-trades')window.renderTradeCenter?.()}
  function cacheBanner(root,c){if(!root)return;let b=root.querySelector(':scope > .derived-cache-banner');if(!b){b=document.createElement('div');b.className='derived-cache-banner';root.prepend(b)}b.textContent=`${ageText(c)} · scheduled refresh every 3 hours · use Refresh now for live recalculation`}
  function renderMatchupCache(c){
    const week=Number(c.week),mySlot=Number(state.settings?.draftSlot||1),opp=Number(c.opponentSlot||0),powers=c.power||[],mine=powers.find(x=>Number(x.slot)===mySlot),oppPower=powers.find(x=>Number(x.slot)===opp),sim=c.simulation;
    state.currentWeek=week;const picker=document.getElementById('matchup-center-week');if(picker)picker.value=String(week);const hidden=document.getElementById('matchup-week');if(hidden)hidden.value=String(week);
    const view=document.getElementById('view-matchups');cacheBanner(view,c);ensureRefreshControl('view-matchups');
    const k=document.getElementById('matchup-kpis');if(k)k.innerHTML=`<div class="mc-kpi"><span>MY MATCHUP</span><strong>${opp?esc(leagueTeamName(opp)):'Not imported'}</strong><small>${opp?`Week ${week} opponent`:`Upload the Week ${week} slate`}</small></div><div class="mc-kpi"><span>MY BEST LINEUP</span><strong>${mine?Number(mine.total).toFixed(1):'—'}</strong><small>Precomputed Week ${week} projection</small></div><div class="mc-kpi"><span>LEAGUE POWER RANK</span><strong>${mine?`#${powers.findIndex(x=>Number(x.slot)===mySlot)+1}`:'—'}</strong><small>${powers[0]?`Strongest: ${esc(powers[0].name)}`:'Roster data needed'}</small></div><div class="mc-kpi"><span>WIN PROBABILITY</span><strong>${sim?`${Math.round(Number(sim.winProbability||0)*100)}%`:'—'}</strong><small>${oppPower&&mine?`${Number(mine.total).toFixed(1)} vs ${Number(oppPower.total).toFixed(1)}`:'Opponent roster needed'}</small></div>`;
    const title=document.getElementById('mc-slate-title');if(title)title.textContent=`Week ${week} matchups`;
    const slate=document.getElementById('mc-slate');if(slate)slate.innerHTML=(c.rows||[]).length?`<div class="mc-slate-grid">${c.rows.map(r=>{const a=powers.find(x=>Number(x.slot)===Number(r.teamA)),b=powers.find(x=>Number(x.slot)===Number(r.teamB)),isMine=Number(r.teamA)===mySlot||Number(r.teamB)===mySlot;return`<div class="mc-match ${isMine?'mine':''}"><div class="mc-team"><strong>${esc(leagueTeamName(r.teamA))}</strong><small>${a?Number(a.total).toFixed(1)+' projected':'Roster unavailable'}</small></div><span class="mc-vs">VS</span><div class="mc-team"><strong>${esc(leagueTeamName(r.teamB))}</strong><small>${b?Number(b.total).toFixed(1)+' projected':'Roster unavailable'}</small></div></div>`}).join('')}</div>`:`<div class="mc-empty">No full Week ${week} matchup slate has been imported yet.</div>`;
    const lineup=document.getElementById('mc-lineup'),chosen=(c.myLineup?.assignments||[]).filter(x=>x.player);if(lineup)lineup.innerHTML=chosen.length?chosen.map(x=>`<div class="mc-lineup-row"><span>${esc(x.slot?.label||x.slot?.type||'START')}</span><div><strong>${esc(x.player.name)}</strong><small>${esc(x.player.position||'')} · ${esc(x.player.team||'')}${x.weekly?.opponent?` · ${x.weekly.home?'vs':'@'} ${esc(x.weekly.opponent)}`:''}${x.player.status?` · ${esc(x.player.status)}`:''}</small></div><b>${Number(x.weekly?.adjusted||0).toFixed(1)}</b></div>`).join(''):'<div class="mc-empty">Add your current roster to calculate the strongest legal lineup.</div>';
    const power=document.getElementById('mc-power');if(power)power.innerHTML=powers.map((x,i)=>`<div class="mc-power-row ${Number(x.slot)===mySlot?'mine':''}"><span class="rank">${i+1}</span><div><b>${esc(x.name)}</b><small>${Number(x.slot)===mySlot?'MY TEAM':i===0?'STRONGEST PROJECTED TEAM':`Draft slot ${x.slot}`}</small></div><strong>${Number(x.total).toFixed(1)}</strong></div>`).join('');
    const pick=document.getElementById('mc-pickups');if(pick)pick.innerHTML=(c.pickups||[]).length?`<div class="mc-pickups">${c.pickups.slice(0,5).map(x=>`<div class="mc-pickup-row"><b>${esc(x.player.name)}</b><small>${esc(x.player.position||'')} · ${esc(x.player.team||'')}${x.weekly?.opponent?` · ${x.weekly.home?'vs':'@'} ${esc(x.weekly.opponent)}`:''}</small><strong>${Number(x.weekly?.adjusted||0).toFixed(1)} pts</strong></div>`).join('')}</div>`:'<div class="mc-empty">No available-player suggestions in the current cache.</div>';
    const nfl=document.getElementById('nfl-intelligence');if(nfl&&sim)nfl.innerHTML=`<div class="intel-head"><div><span class="section-label">NFL WEEK ${week} INTELLIGENCE</span><h3>${Math.round(Number(sim.winProbability||0)*100)}% simulated win probability</h3><small>${esc(c.projectionStatus?.provider||'Cached weekly projections')} · ${ageText(c)}</small></div><button class="btn secondary small derived-refresh">Refresh now</button></div><div class="intel-metrics"><b>${Number(sim.myMean||0).toFixed(1)}<small>Starting-lineup projection</small></b><b>${Number(sim.opponentMean||0).toFixed(1)}<small>Opponent projection</small></b><b>${Number(sim.runs||0).toLocaleString()}<small>Simulations</small></b></div>`;
    nfl?.querySelector('.derived-refresh')?.addEventListener('click',()=>refreshNow());
    if(typeof window.renderWeeklyProjectionQuality==='function')window.renderWeeklyProjectionQuality();updateRefreshLabels();return true;
  }
  const baseMatchup=window.renderMatchupCenter;if(typeof baseMatchup==='function')window.renderMatchupCenter=function(){const c=cacheFor(currentWeek());if(c)return renderMatchupCache(c);return baseMatchup.apply(this,arguments)};
  const baseRoster=typeof renderRoster==='function'?renderRoster:null;if(baseRoster)renderRoster=function(){const c=cacheFor(currentWeek());if(c?.myLineup){lineupResult={week:c.week,total:Number(c.myLineup.total||0),assignments:(c.myLineup.assignments||[]).map(x=>({...x,player:x.player?getPlayer(x.player.id)||x.player:null})),bench:(c.myLineup.bench||[]).map(getPlayer).filter(Boolean)}}const result=baseRoster.apply(this,arguments);ensureRefreshControl('view-roster');updateRefreshLabels();return result};
  function installControls(){ensureStyle();['view-dashboard','view-matchups','view-roster','view-trades'].forEach(id=>{if(document.getElementById(id)?.classList.contains('active'))ensureRefreshControl(id)});updateRefreshLabels()}
  const observer=new MutationObserver(()=>installControls());observer.observe(document.body,{childList:true,subtree:true});setTimeout(installControls,0);
  window.fmDerivedCache={cacheFor,signature,refreshNow,ageText,renderMatchupCache,ensureRefreshControl};
})();
