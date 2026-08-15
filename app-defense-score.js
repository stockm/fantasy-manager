// D/ST ranking engine. Uses supplied defensive metrics when present and falls back
// to existing ECR/ADP/projection data. It never invents live stats.
(function installDefenseScoreEngine(){
  const isDst=p=>{const x=String(primaryPos(p)||'').toUpperCase();return x==='DST'||x==='D/ST'||x==='DEF'};
  const n=(v,d=null)=>{const x=Number(v);return Number.isFinite(x)?x:d};
  const clamp01=x=>Math.max(0,Math.min(1,x));
  function percentile(value,values,{lowerBetter=false}={}){
    const clean=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!clean.length||!Number.isFinite(Number(value)))return null;
    let idx=0;while(idx<clean.length&&clean[idx]<=Number(value))idx++;let p=clean.length===1?0.5:(idx-1)/(clean.length-1);p=clamp01(p);return lowerBetter?1-p:p
  }
  function metric(p,...keys){for(const k of keys){const v=n(p?.defenseStats?.[k]??p?.[k]);if(v!==null)return v}return null}
  function allDefenses(){return (state.players||[]).filter(isDst)}
  function metricPercentile(p,keys,lowerBetter=false){const defs=allDefenses(),value=metric(p,...keys),values=defs.map(d=>metric(d,...keys)).filter(v=>v!==null);return value===null?null:percentile(value,values,{lowerBetter})}
  function rankPercentile(p,key,lowerBetter=true){const defs=allDefenses(),v=n(p[key]),vals=defs.map(d=>n(d[key])).filter(v=>v!==null);return v===null?null:percentile(v,vals,{lowerBetter})}
  function defenseScore(p){
    if(!isDst(p))return null;
    const components={};
    const set=(name,val,weight)=>{if(val!==null&&Number.isFinite(val))components[name]={value:clamp01(val),weight}};
    set('passRush',metricPercentile(p,['sacks','sackRate','pressureRate']),.30);
    set('takeaways',metricPercentile(p,['takeaways','turnovers','interceptions']),.25);
    set('pointsAllowed',metricPercentile(p,['pointsAllowed','pointsAllowedPerGame'],true),.20);
    set('defensiveTd',metricPercentile(p,['defensiveTds','defTd','tds']),.10);
    set('efficiency',metricPercentile(p,['epaPerPlayAllowed','yardsPerPlayAllowed'],true),.10);
    set('schedule',metricPercentile(p,['scheduleScore','strengthOfSchedule'],false),.05);
    // Existing fantasy-market data is a safe fallback when advanced defensive stats
    // are not loaded yet. These are normalized only against other D/ST entries.
    if(Object.keys(components).length<3){
      set('ecr',rankPercentile(p,'rank',true),.36);
      set('adp',rankPercentile(p,'adp',true),.24);
      set('projection',rankPercentile(p,'projection',false),.40);
    }
    let weighted=0,total=0;for(const c of Object.values(components)){weighted+=c.value*c.weight;total+=c.weight}
    const score=total?Math.round((weighted/total)*100):50;
    return{score,components,source:Object.keys(components).some(k=>['passRush','takeaways','pointsAllowed','defensiveTd','efficiency','schedule'].includes(k))?'defensive metrics + fantasy market':'fantasy market fallback',team:p.team||String(p.name||'').replace(/\s+D\/ST$/i,''),label:`${score}/100`}
  }
  function rankedDefenses(){return allDefenses().map(p=>({player:p,...defenseScore(p)})).sort((a,b)=>b.score-a.score||n(a.player.rank,9999)-n(b.player.rank,9999))}
  window.defenseScore=defenseScore;
  window.rankedDefenses=rankedDefenses;
})();
