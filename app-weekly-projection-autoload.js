// Load the selected Week's schedule + projection feed when the Matchup Center is opened.
(function installWeeklyProjectionAutoload(){
  const loaded=new Set();
  const selectedWeek=()=>Math.max(1,Math.min(18,Number(document.getElementById('matchup-center-week')?.value)||Number(state.currentWeek)||1));
  const scoring=()=>String(state.settings?.scoring||'half-ppr');
  async function refreshSelected(force=false){
    const week=selectedWeek(),key=`${week}:${scoring()}`;
    if(!force&&loaded.has(key))return;
    loaded.add(key);
    try{
      if(typeof loadNflWeek==='function')await loadNflWeek(week,force);
      if(typeof window.renderMatchupCenter==='function')window.renderMatchupCenter();
    }catch(e){loaded.delete(key);console.warn('Weekly projections could not be preloaded',e)}
  }
  function bind(){
    const nav=document.querySelector('.nav-item[data-tab="matchups"]');
    if(nav&&nav.dataset.weekProjectionBound!=='1'){nav.dataset.weekProjectionBound='1';nav.addEventListener('click',()=>setTimeout(()=>refreshSelected(false),0))}
    const picker=document.getElementById('matchup-center-week');
    if(picker&&picker.dataset.weekProjectionBound!=='1'){picker.dataset.weekProjectionBound='1';picker.addEventListener('change',()=>setTimeout(()=>refreshSelected(false),0))}
  }
  bind();
  const observer=new MutationObserver(()=>bind());observer.observe(document.body,{subtree:true,childList:true});
  setTimeout(()=>{bind();if(document.getElementById('view-matchups')?.classList.contains('active'))refreshSelected(false)},80);
})();
