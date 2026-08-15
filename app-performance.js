// Startup/render performance layer.
// Avoids building large hidden player/draft/trade DOM trees during initial load and
// prevents the pre-auth auto-refresh timer from downloading public feeds before
// Firestore has supplied the user's already-cached state.
(function installPerformanceLayer(){
  let matchupRenderToken=0;
  function activeTab(){
    const view=document.querySelector('.view.active');
    return view?.id?.replace(/^view-/,'')||'dashboard';
  }
  function ensureMatchupLoaderStyles(){
    if(document.getElementById('matchup-loading-style'))return;
    const s=document.createElement('style');s.id='matchup-loading-style';s.textContent=`
      #view-matchups{position:relative}
      .matchup-loading-overlay{position:absolute;inset:0;z-index:50;min-height:560px;display:flex;align-items:flex-start;justify-content:center;padding:120px 24px;background:rgba(5,7,6,.93);backdrop-filter:blur(3px);border-radius:16px}
      .matchup-loading-card{width:min(430px,92vw);display:flex;align-items:center;gap:16px;padding:20px 22px;border:1px solid #304034;border-radius:16px;background:linear-gradient(145deg,#0d120e,#090c0a);box-shadow:0 22px 60px rgba(0,0,0,.38)}
      .matchup-loading-spinner{width:30px;height:30px;flex:0 0 auto;border-radius:50%;border:3px solid #263128;border-top-color:#a8ff45;animation:matchupSpin .75s linear infinite}
      .matchup-loading-copy strong{display:block;color:#f7f8f4;font-size:15px;margin-bottom:4px}.matchup-loading-copy span{display:block;color:#8f988f;font-size:12px;line-height:1.45}
      @keyframes matchupSpin{to{transform:rotate(360deg)}}
      @media(max-width:720px){.matchup-loading-overlay{padding-top:80px}.matchup-loading-card{padding:17px 18px}}
    `;document.head.appendChild(s);
  }
  function showMatchupLoader(){
    const view=document.getElementById('view-matchups');if(!view)return;
    ensureMatchupLoaderStyles();
    let loader=document.getElementById('matchup-screen-loader');
    if(!loader){loader=document.createElement('div');loader.id='matchup-screen-loader';loader.className='matchup-loading-overlay';loader.innerHTML='<div class="matchup-loading-card"><span class="matchup-loading-spinner" aria-hidden="true"></span><div class="matchup-loading-copy"><strong>Loading Weekly Matchups…</strong><span>Building your best lineup, league power rankings and matchup simulation.</span></div></div>';view.appendChild(loader)}
    loader.hidden=false;
  }
  function hideMatchupLoader(){const loader=document.getElementById('matchup-screen-loader');if(loader)loader.hidden=true}
  function scheduleMatchupRender(){
    const token=++matchupRenderToken;showMatchupLoader();
    // Give the browser two paint opportunities so the loader is visible before
    // the lineup optimizer/power rankings/simulation perform their synchronous work.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(token!==matchupRenderToken||activeTab()!=='matchups'){hideMatchupLoader();return}
      try{if(typeof window.renderMatchupCenter==='function')window.renderMatchupCenter()}
      finally{hideMatchupLoader()}
    }));
  }

  // By the time this file loads, draft-integrity and Trade Center have wrapped
  // renderAll(). Replace the eager all-tabs render with an equivalent visible-view
  // render while explicitly preserving draft roster repair.
  renderAll=function(){
    if(typeof repairActiveDraftRosters==='function')repairActiveDraftRosters({persist:true});
    if(typeof renderDashboard==='function')renderDashboard();
    const tab=activeTab();
    if(tab==='players'&&typeof renderPlayers==='function')renderPlayers();
    else if(tab==='draft'&&typeof renderDraft==='function')renderDraft();
    else if(tab==='roster'&&typeof renderRoster==='function')renderRoster();
    else if(tab==='league'&&typeof renderLeagueTeams==='function')renderLeagueTeams();
    else if(tab==='matchups')scheduleMatchupRender();
    else if(tab==='trades'&&typeof window.renderTradeCenter==='function')window.renderTradeCenter();
    else if(tab==='import'&&typeof window.renderScreenshotImport==='function')window.renderScreenshotImport();
    if(typeof renderFeedStatus==='function')renderFeedStatus();
  };

  // Keep programmatic tab changes lazy too. The original switchTab already renders
  // Players/Draft/Roster; these additions cover lightweight/custom tabs.
  const baseSwitchTab=switchTab;
  switchTab=function(tab){
    baseSwitchTab(tab);
    if(tab==='dashboard'&&typeof renderDashboard==='function')renderDashboard();
    if(tab==='league'&&typeof renderLeagueTeams==='function')renderLeagueTeams();
    if(tab==='matchups')scheduleMatchupRender();
    else if(activeTab()!=='matchups'){matchupRenderToken++;hideMatchupLoader()}
    if(tab==='trades'&&typeof window.renderTradeCenter==='function')window.renderTradeCenter();
    if(tab==='import'&&typeof window.renderScreenshotImport==='function')window.renderScreenshotImport();
    if(typeof renderFeedStatus==='function')renderFeedStatus();
  };

  // app-ui-c schedules a silent refresh 500ms after boot based on the empty local
  // shell. Authenticated installs then load the real state from Firestore, so that
  // early request is usually unnecessary and can include the large Sleeper player
  // endpoint. Gate silent refreshes until Firestore is ready and skip them when the
  // loaded ranking cache is already fresh.
  const baseRefreshRankings=refreshRankings;
  refreshRankings=async function(options={}){
    if(options?.silent){
      if(typeof firestoreLoaded!=='undefined'&&!firestoreLoaded)return false;
      const last=state.feed?.rankingsUpdatedAt?new Date(state.feed.rankingsUpdatedAt).getTime():0;
      const fresh=last&&Date.now()-last<AUTO_RANKINGS_REFRESH_MS;
      if((state.players||[]).length&&fresh)return false;
    }
    return baseRefreshRankings(options);
  };

  // If the initial 500ms timer was suppressed because Firestore was still loading,
  // re-evaluate auto-refresh once the cloud state is available. Fresh data exits
  // immediately; stale/missing data refreshes in the background.
  if(typeof loadFirestoreState==='function'){
    const baseLoadFirestoreState=loadFirestoreState;
    loadFirestoreState=async function(){
      const result=await baseLoadFirestoreState();
      setTimeout(()=>{try{maybeAutoRefresh()}catch(e){console.warn('Deferred rankings refresh skipped',e)}},75);
      return result;
    };
  }

  window.fmPerf={
    activeTab,
    showMatchupLoader,
    hideMatchupLoader,
    scheduleMatchupRender,
    note:'Large player, draft, matchup and trade views render only when opened; Weekly Matchups paints a loader before heavy calculations; silent live-data refresh waits for Firestore.'
  };
})();
