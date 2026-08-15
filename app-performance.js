// Startup/render performance layer.
// Avoids building large hidden player/draft/trade DOM trees during initial load and
// prevents the pre-auth auto-refresh timer from downloading public feeds before
// Firestore has supplied the user's already-cached state.
(function installPerformanceLayer(){
  function activeTab(){
    const view=document.querySelector('.view.active');
    return view?.id?.replace(/^view-/,'')||'dashboard';
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
    note:'Large player, draft and trade views render only when opened; silent live-data refresh waits for Firestore.'
  };
})();
