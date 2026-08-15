// D/ST ranking engine. Blends prior-season stability with current-season evidence,
// then folds in supplied market/projection context. It never invents live stats.
(function installDefenseScoreEngine(){
  const isDst=p=>{const x=String(primaryPos(p)||'').toUpperCase();return x==='DST'||x==='D/ST'||x==='DEF'};
  const n=(v,d=null)=>{const x=Number(v);return Number.isFinite(x)?x:d};
  const clamp01=x=>Math.max(0,Math.min(1,x));
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function percentile(value,values,{lowerBetter=false}={}){
    const clean=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!clean.length||!Number.isFinite(Number(value)))return null;
    let idx=0;while(idx<clean.length&&clean[idx]<=Number(value))idx++;let p=clean.length===1?0.5:(idx-1)/(clean.length-1);p=clamp01(p);return lowerBetter?1-p:p
  }
  function seasonWeek(){
    const explicit=n(state?.currentWeek??state?.settings?.currentWeek??state?.nflWeek);
    if(explicit!==null)return clamp(Math.round(explicit),0,18);
    const weeks=Object.keys(state?.nflWeeks||{}).map(Number).filter(Number.isFinite);
    return weeks.length?clamp(Math.max(...weeks),0,18):0;
  }
  function blendWeights(){
    const week=seasonWeek();
    if(week<=0)return{week,prior:.60,current:0,offseason:.25,market:.15,label:'preseason'};
    const current=clamp(.20+week*.10,.30,.78);
    const prior=clamp(.62-week*.075,.12,.55);
    const offseason=clamp(.18-week*.02,.03,.16);
    const market=Math.max(.07,1-prior-current-offseason);
    const total=prior+current+offseason+market;
    return{week,prior:prior/total,current:current/total,offseason:offseason/total,market:market/total,label:week<=4?'early season':week<=8?'midseason transition':'current-season led'};
  }
  function bucket(p,bucket,...keys){for(const k of keys){const v=n(p?.[bucket]?.[k]??p?.defenseStats?.[bucket]?.[k]);if(v!==null)return v}return null}
  function legacyMetric(p,...keys){for(const k of keys){const v=n(p?.defenseStats?.[k]??p?.[k]);if(v!==null)return v}return null}
  function allDefenses(){return (state.players||[]).filter(isDst)}
  function percentileFor(p,getter,lowerBetter=false){const defs=allDefenses(),value=getter(p),values=defs.map(getter).filter(v=>v!==null);return value===null?null:percentile(value,values,{lowerBetter})}
  function metricPercentile(p,bucketName,keys,lowerBetter=false){return percentileFor(p,d=>bucket(d,bucketName,...keys),lowerBetter)}
  function legacyPercentile(p,keys,lowerBetter=false){return percentileFor(p,d=>legacyMetric(d,...keys),lowerBetter)}
  function rankPercentile(p,key,lowerBetter=true){const defs=allDefenses(),v=n(p[key]),vals=defs.map(d=>n(d[key])).filter(v=>v!==null);return v===null?null:percentile(v,vals,{lowerBetter})}
  function componentSet(p,bucketName){
    const out={};
    const set=(name,val,weight)=>{if(val!==null&&Number.isFinite(val))out[name]={value:clamp01(val),weight}};
    set('passRush',metricPercentile(p,bucketName,['sacks','sackRate','pressureRate']),.30);
    set('takeaways',metricPercentile(p,bucketName,['takeaways','turnovers','interceptions']),.25);
    set('pointsAllowed',metricPercentile(p,bucketName,['pointsAllowed','pointsAllowedPerGame'],true),.20);
    set('defensiveTd',metricPercentile(p,bucketName,['defensiveTds','defTd','tds']),.10);
    set('efficiency',metricPercentile(p,bucketName,['epaPerPlayAllowed','yardsPerPlayAllowed'],true),.10);
    set('schedule',metricPercentile(p,bucketName,['scheduleScore','strengthOfSchedule'],false),.05);
    return out
  }
  function scoreComponents(components){let weighted=0,total=0;for(const c of Object.values(components)){weighted+=c.value*c.weight;total+=c.weight}return total?weighted/total:null}
  function legacyDefenseScore(p){
    const components={};
    const set=(name,val,weight)=>{if(val!==null&&Number.isFinite(val))components[name]={value:clamp01(val),weight}};
    set('passRush',legacyPercentile(p,['sacks','sackRate','pressureRate']),.30);
    set('takeaways',legacyPercentile(p,['takeaways','turnovers','interceptions']),.25);
    set('pointsAllowed',legacyPercentile(p,['pointsAllowed','pointsAllowedPerGame'],true),.20);
    set('defensiveTd',legacyPercentile(p,['defensiveTds','defTd','tds']),.10);
    set('efficiency',legacyPercentile(p,['epaPerPlayAllowed','yardsPerPlayAllowed'],true),.10);
    set('schedule',legacyPercentile(p,['scheduleScore','strengthOfSchedule'],false),.05);
    return{score:scoreComponents(components),components}
  }
  function marketScore(p){
    const components={};
    const set=(name,val,weight)=>{if(val!==null&&Number.isFinite(val))components[name]={value:clamp01(val),weight}};
    set('ecr',rankPercentile(p,'rank',true),.36);
    set('adp',rankPercentile(p,'adp',true),.24);
    set('projection',rankPercentile(p,'projection',false),.40);
    return{score:scoreComponents(components),components}
  }
  function offseasonScore(p){
    const direct=n(p?.offseasonAdjustment??p?.defenseStats?.offseasonAdjustment);
    if(direct!==null)return clamp01((direct+1)/2);
    const grade=n(p?.offseasonGrade??p?.defenseStats?.offseasonGrade);
    if(grade!==null)return clamp01(grade>1?grade/100:grade);
    return null
  }
  function defenseScore(p){
    if(!isDst(p))return null;
    const weights=blendWeights(),prior=componentSet(p,'priorSeasonStats'),current=componentSet(p,'currentSeasonStats'),legacy=legacyDefenseScore(p),market=marketScore(p),offseason=offseasonScore(p);
    let priorScore=scoreComponents(prior),currentScore=scoreComponents(current);
    // Backward compatibility: if stats are present but not season-bucketed, treat them
    // as the best available defensive evidence rather than discarding them.
    if(priorScore===null&&currentScore===null&&legacy.score!==null){if(weights.week<=0)priorScore=legacy.score;else currentScore=legacy.score}
    const pieces=[];
    if(priorScore!==null)pieces.push({name:'priorSeason',value:priorScore,weight:weights.prior});
    if(currentScore!==null)pieces.push({name:'currentSeason',value:currentScore,weight:weights.current});
    if(offseason!==null)pieces.push({name:'offseason',value:offseason,weight:weights.offseason});
    if(market.score!==null)pieces.push({name:'market',value:market.score,weight:weights.market});
    // Re-normalize only across evidence actually present.
    let weighted=0,total=0;for(const x of pieces){weighted+=x.value*x.weight;total+=x.weight}
    const score=Math.round((total?weighted/total:.5)*100);
    return{score,team:p.team||String(p.name||'').replace(/\s+D\/ST$/i,''),label:`${score}/100`,source:pieces.map(x=>x.name).join(' + ')||'neutral fallback',seasonBlend:weights,evidence:{priorSeason:prior,currentSeason:current,legacy:legacy.components,market:market.components,offseason:offseason},inputsPresent:{priorSeason:priorScore!==null,currentSeason:currentScore!==null,offseason:offseason!==null,market:market.score!==null}}
  }
  function rankedDefenses(){return allDefenses().map(p=>({player:p,...defenseScore(p)})).sort((a,b)=>b.score-a.score||n(a.player.rank,9999)-n(b.player.rank,9999))}
  window.defenseScore=defenseScore;
  window.rankedDefenses=rankedDefenses;
  window.defenseBlendWeights=blendWeights;
})();
