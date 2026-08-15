// Apply the D/ST score only as a tie-break/value signal among defenses.
// The main draft engine's strong early-round K/DST penalty remains authoritative.
(function integrateDefenseScore(){
  if(typeof recommendationScore!=='function'||typeof defenseScore!=='function')return;
  const baseScore=recommendationScore;
  const baseReason=typeof recommendationReason==='function'?recommendationReason:null;
  const baseContext=typeof draftValueContext==='function'?draftValueContext:null;
  const isDst=p=>{const x=String(primaryPos(p)||'').toUpperCase();return x==='DST'||x==='D/ST'||x==='DEF'};
  recommendationScore=function(p,target){
    const score=baseScore(p,target);if(!isDst(p))return score;
    const d=defenseScore(p);return score+(d?(d.score-50)*.9:0);
  };
  if(baseReason)recommendationReason=function(p,target){const r=baseReason(p,target);if(!isDst(p))return r;const d=defenseScore(p);return d?`${r} · D/ST score ${d.score}/100`:r};
  if(baseContext)draftValueContext=function(p,target){const c=baseContext(p,target);if(!isDst(p))return c;const d=defenseScore(p);return{...c,defenseScore:d?.score??null,defenseScoreSource:d?.source||null}};
})();
