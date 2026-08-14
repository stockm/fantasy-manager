// Active-draft roster integrity.
// During a live draft, state.picks is the source of truth. Season/weekly roster
// state from an earlier draft must never leak into draft recommendations or AI.
function draftTotalPickCount(){return Math.max(1,Number(state.settings?.teams||14))*Math.max(1,Number(state.settings?.rounds||1))}
function draftIsActive(){return (state.picks||[]).length<draftTotalPickCount()}
function currentDraftRosterIds(slot){return (state.picks||[]).filter(p=>Number(p.teamSlot)===Number(slot)&&!p.rosterRemoved).map(p=>p.playerId)}
function draftRosterForSlot(slot){return currentDraftRosterIds(slot).map(getPlayer).filter(Boolean)}
function sameIdList(a,b){if(!Array.isArray(a)||a.length!==b.length)return false;const x=[...a].map(String).sort(),y=[...b].map(String).sort();return x.every((v,i)=>v===y[i])}
function repairActiveDraftRosters({persist=true}={}){
  if(!draftIsActive())return false;
  if(!state.teamRosters||typeof state.teamRosters!=='object')state.teamRosters={};
  let changed=false;
  const teams=Math.max(2,Number(state.settings?.teams||14));
  for(let slot=1;slot<=teams;slot++){
    const key=String(slot),ids=currentDraftRosterIds(slot);
    if(!sameIdList(state.teamRosters[key],ids)){state.teamRosters[key]=ids;changed=true}
  }
  for(const key of Object.keys(state.teamRosters)){
    const n=Number(key);if(!Number.isInteger(n)||n<1||n>teams){delete state.teamRosters[key];changed=true}
  }
  if(changed&&persist&&typeof saveState==='function')saveState();
  return changed
}

// app-advice.js normally preserves teamRosters so weekly adds/drops can carry
// forward. While the draft is active, replace that behavior with exact draft picks.
if(typeof syncDraftRosters==='function'){
  const seasonSyncDraftRosters=syncDraftRosters;
  syncDraftRosters=function(){if(draftIsActive())return repairActiveDraftRosters({persist:false});return seasonSyncDraftRosters()}
}
if(typeof rosterIdsForSlot==='function'){
  const seasonRosterIdsForSlot=rosterIdsForSlot;
  rosterIdsForSlot=function(slot){
    if(!draftIsActive())return seasonRosterIdsForSlot(slot);
    const ids=currentDraftRosterIds(slot);
    // Manual roster additions are only a fallback for the user's own roster UI;
    // draft AI uses draftRosterForSlot() so only recorded draft picks are considered.
    if(Number(slot)===Number(state.settings.draftSlot))return [...new Set([...ids,...(state.manualRosterIds||[])])];
    return [...new Set(ids)]
  }
}

// Firestore loads asynchronously after this script. Repair immediately before
// every render so an old persisted teamRosters object is cleaned as soon as it loads.
const integrityBaseRenderAll=renderAll;
renderAll=function(){repairActiveDraftRosters({persist:true});integrityBaseRenderAll()};
