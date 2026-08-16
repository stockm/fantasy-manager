// Warm the selected Week's schedule + projection feed in the background so weekly
// views are already using scheduled/cache data by the time the user opens them.
(function installWeeklyProjectionAutoload(){
  const inflight=new Map();
  let timer=null;
  const clampWeek=v=>Math.max(1,Math.min(18,Number(v)||1));
  const selectedWeek=()=>clampWeek(
    document.getElementById('matchup-center-week')?.value||
    document.getElementById('lineup-week')?.value||
    document.getElementById('matchup-week')?.value||
    state.currentWeek||
    1
  );
  const scoring=()=>typeof weeklyScoringKey==='function'?weeklyScoringKey():String(state.settings?.scoring||'half-ppr');
  const weeklyViewActive=()=>{
    const active=document.querySelector('.view.active')?.id||'';
    return active==='view-matchups'||active==='view-roster'||active==='view-league';
  };
  const cloudStateReady=()=>typeof firestoreLoaded==='undefined'||firestoreLoaded;
  const authOverlayBlocking=()=>{
    const overlay=document.getElementById('auth-overlay');
    if(!overlay)return false;
    return getComputedStyle(overlay).display!=='none';
  };
  function renderWeeklyViews(){
    if(typeof window.renderWeeklyProjectionQuality==='function')window.renderWeeklyProjectionQuality();
    if(document.getElementById('view-matchups')?.classList.contains('active')&&typeof window.renderMatchupCenter==='function')window.renderMatchupCenter();
    if(document.getElementById('view-roster')?.classList.contains('active')&&typeof renderRoster==='function')renderRoster();
    if(document.getElementById('view-league')?.classList.contains('active')){
      if(typeof renderAdvice==='function')renderAdvice();
      if(typeof renderNflIntel==='function')renderNflIntel();
    }
  }
  async function refreshWeek(week=selectedWeek(),{force=false,render=true}={}){
    const safeWeek=clampWeek(week),key=`${safeWeek}:${scoring()}:${force?'force':'cache'}`;
    if(inflight.has(key))return inflight.get(key);
    const task=(async()=>{
      if(typeof loadNflWeek==='function')await loadNflWeek(safeWeek,force);
      if(render)renderWeeklyViews();
      return state.nflWeeks?.[String(safeWeek)]||null;
    })().finally(()=>inflight.delete(key));
    inflight.set(key,task);
    return task;
  }
  function scheduleBackgroundRefresh({force=false,delay=600}={}){
    clearTimeout(timer);
    timer=setTimeout(async()=>{
      if(!cloudStateReady()||authOverlayBlocking()){
        scheduleBackgroundRefresh({force,delay:900});
        return;
      }
      const week=selectedWeek();
      state.currentWeek=week;
      saveState();
      try{
        await refreshWeek(week,{force,render:weeklyViewActive()});
        renderWeeklyViews();
      }catch(e){console.warn('Weekly projections could not be preloaded',e)}
    },delay);
  }
  async function refreshSelected(force=false){
    try{
      await refreshWeek(selectedWeek(),{force,render:true});
    }catch(e){console.warn('Weekly projections could not be preloaded',e)}
  }
  function bind(){
    const nav=document.querySelector('.nav-item[data-tab="matchups"]');
    if(nav&&nav.dataset.weekProjectionBound!=='1'){nav.dataset.weekProjectionBound='1';nav.addEventListener('click',()=>setTimeout(()=>refreshSelected(false),0))}
    const picker=document.getElementById('matchup-center-week');
    if(picker&&picker.dataset.weekProjectionBound!=='1'){picker.dataset.weekProjectionBound='1';picker.addEventListener('change',()=>setTimeout(()=>refreshSelected(false),0))}
    const lineupPicker=document.getElementById('lineup-week');
    if(lineupPicker&&lineupPicker.dataset.weekProjectionBound!=='1'){lineupPicker.dataset.weekProjectionBound='1';lineupPicker.addEventListener('change',()=>scheduleBackgroundRefresh({force:false,delay:0}))}
  }
  window.refreshWeeklyData=(week=selectedWeek(),options={})=>refreshWeek(week,options);
  window.preloadWeeklyData=()=>scheduleBackgroundRefresh({force:false,delay:0});
  window.addEventListener('fm:state-ready',()=>scheduleBackgroundRefresh({force:false,delay:150}));
  window.addEventListener('focus',()=>scheduleBackgroundRefresh({force:false,delay:300}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleBackgroundRefresh({force:false,delay:300})});
  bind();
  const observer=new MutationObserver(()=>bind());observer.observe(document.body,{subtree:true,childList:true});
  setTimeout(()=>{bind();scheduleBackgroundRefresh({force:false,delay:0})},900);
})();
