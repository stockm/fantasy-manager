const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getNflWeekData, normalizeScoring } = require('../nfl/week');
const { computeDerivedCache, stateSignature } = require('./derived');
if(!getApps().length)initializeApp();

const refreshFantasyCacheOnStateWrite=onDocumentWritten({document:'users/{uid}/fantasy/state',timeoutSeconds:120,memory:'512MiB'},async event=>{
  const after=event.data?.after;if(!after?.exists)return;
  const state=after.data()?.state;if(!state||typeof state!=='object')return;
  const signature=stateSignature(state),embedded=state.derivedCache,cacheRef=after.ref.parent.doc('derived-cache');
  // Scheduled/manual refreshes already wrote a matching cache into state; mirror it
  // into the small cache document without repeating any calculations.
  if(embedded?.signature===signature&&Number(embedded?.version)===1){await cacheRef.set({cache:embedded,updatedAt:new Date().toISOString()},{merge:true});return}
  const week=Math.max(1,Math.min(18,Number(state.currentWeek)||1)),season=Number(state.settings?.season)||new Date().getFullYear(),scoring=normalizeScoring(state.settings?.scoring);
  try{const weekData=await getNflWeekData({season,week,scoring,force:false}),cache=computeDerivedCache(state,weekData);await cacheRef.set({cache,updatedAt:new Date().toISOString()},{merge:true})}catch(e){console.error('State-write derived cache refresh failed',after.ref.path,e)}
});
module.exports={refreshFantasyCacheOnStateWrite};
