// Real week-specific projection layer. Uses the projection payload returned by /api/nfl-week
// and falls back to the existing season/ECR model only when the provider has no projection.
(function installRealWeeklyProjections(){
  const legacyAdjusted=typeof adjustedWeeklyProjection==='function'?adjustedWeeklyProjection:null;
  const legacyContext=typeof weeklyPlayerContext==='function'?weeklyPlayerContext:null;
  const projectionIndexCache=new Map();

  const weekNumber=()=>Math.max(1,Math.min(18,Number(document.getElementById('lineup-week')?.value)||Number(document.getElementById('matchup-center-week')?.value)||Number(state.currentWeek)||1));
  const normName=v=>typeof canonicalName==='function'?canonicalName(v):String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const normTeam=v=>typeof nflTeamKey==='function'?nflTeamKey(v):String(v||'').trim().toUpperCase();
  const pos=p=>{const x=String(typeof primaryPos==='function'?primaryPos(p):p?.position||'').toUpperCase();return ['DST','DEF','D-ST'].includes(x)?'D/ST':x};

  function projectionRows(week){return state.nflWeeks?.[String(week)]?.projections||[]}
  function projectionIndex(week){
    const rows=projectionRows(week),key=String(week),cached=projectionIndexCache.get(key);
    if(cached&&cached.rows===rows)return cached;
    const byId=new Map(),byName=new Map(),byNameTeam=new Map(),byDefenseTeam=new Map();
    for(const row of rows){
      const id=String(row?.playerId||'');if(id)byId.set(id,row);
      const name=normName(row?.name);if(name){if(!byName.has(name))byName.set(name,[]);byName.get(name).push(row);const team=normTeam(row?.team);if(team)byNameTeam.set(`${name}|${team}`,row)}
      const position=String(row?.position||'').toUpperCase(),team=normTeam(row?.team||row?.playerId);if(team&&['D/ST','DST','DEF'].includes(position))byDefenseTeam.set(team,row);
    }
    const built={rows,byId,byName,byNameTeam,byDefenseTeam};projectionIndexCache.set(key,built);return built;
  }
  function realProjectionFor(p,week){
    const idx=projectionIndex(week);if(!idx.rows.length)return null;
    const sid=String(p?.sleeperId||'');if(sid&&idx.byId.has(sid))return idx.byId.get(sid);
    const team=normTeam(p?.team),name=normName(p?.name),position=pos(p);
    if(position==='D/ST'&&team&&idx.byDefenseTeam.has(team))return idx.byDefenseTeam.get(team);
    if(name&&team&&idx.byNameTeam.has(`${name}|${team}`))return idx.byNameTeam.get(`${name}|${team}`);
    const matches=name?(idx.byName.get(name)||[]):[];return matches.length===1?matches[0]:null;
  }

  function projectionQuality(week){
    const w=state.nflWeeks?.[String(week)]||{},ps=w.projectionStatus||{};
    return{available:!!(ps.available&&projectionRows(week).length),provider:ps.provider||'',count:Number(ps.count)||projectionRows(week).length,scoring:ps.scoring||state.settings?.scoring||'half-ppr',fetchedAt:ps.fetchedAt||w.fetchedAt||'',matchedPlayers:Number(ps.matchedPlayers)||0};
  }
  window.weeklyProjectionQuality=projectionQuality;

  window.applyRealWeeklyProjections=function(payload,week){
    if(payload&&state.nflWeeks)state.nflWeeks[String(week)]=payload;
    projectionIndexCache.delete(String(week));
    let matched=0;
    for(const p of state.players||[]){
      const hit=realProjectionFor(p,week);if(!hit||num(hit.points)===null)continue;
      if(!p.weeklyProjections||typeof p.weeklyProjections!=='object')p.weeklyProjections={};
      if(!p.weeklyProjectionMeta||typeof p.weeklyProjectionMeta!=='object')p.weeklyProjectionMeta={};
      p.weeklyProjections[String(week)]=Number(hit.points);
      p.weeklyProjectionMeta[String(week)]={source:hit.source||'Sleeper weekly projection',provider:hit.provider||'Sleeper',scoring:hit.scoring||state.settings?.scoring||'half-ppr',stats:hit.stats||null,fetchedAt:payload?.projectionStatus?.fetchedAt||payload?.fetchedAt||''};
      matched++;
    }
    if(payload?.projectionStatus)payload.projectionStatus.matchedPlayers=matched;
    return matched;
  };

  Object.entries(state.nflWeeks||{}).forEach(([week,payload])=>window.applyRealWeeklyProjections(payload,Number(week)));

  if(legacyAdjusted){
    adjustedWeeklyProjection=function(p,week){
      const legacy=legacyAdjusted(p,week),real=realProjectionFor(p,week);
      if(!real||num(real.points)===null)return{...legacy,realProjection:false};
      const factor=Number.isFinite(Number(legacy.factor))?Number(legacy.factor):1,base=Math.max(0,Number(real.points)),adjusted=Math.max(0,base*factor);
      return{...legacy,base,adjusted,factor:base?adjusted/base:0,projectionSource:real.source||'Sleeper weekly projection',projectionProvider:real.provider||'Sleeper',projectionScoring:real.scoring||state.settings?.scoring||'half-ppr',projectionStats:real.stats||null,realProjection:true};
    };
  }

  weeklyPlayerContext=function(p,week){
    const legacy=legacyContext?legacyContext(p,week):{...compactPlayer(p)},x=adjustedWeeklyProjection(p,week),meta=p?.weeklyProjectionMeta?.[String(week)]||{};
    return{...legacy,week,nflOpponent:x.opponent??legacy.nflOpponent??null,home:x.home??legacy.home??null,bye:x.bye??legacy.bye??false,gameTime:x.gameTime??legacy.gameTime??null,baseWeeklyProjection:Number(Number(x.base||0).toFixed(2)),adjustedWeeklyProjection:Number(Number(x.adjusted||0).toFixed(2)),matchupFactor:Number(Number(x.factor||0).toFixed(3)),projectionSource:x.realProjection?(meta.source||x.projectionSource||'Sleeper weekly projection'):(x.projectionSource||legacy.projectionSource||''),projectionProvider:x.realProjection?(meta.provider||x.projectionProvider||'Sleeper'):null,projectionScoring:x.realProjection?(meta.scoring||x.projectionScoring||state.settings?.scoring||'half-ppr'):null,realWeeklyProjection:!!x.realProjection};
  };

  function solve(players,week){
    const slots=typeof slotDefinitions==='function'?slotDefinitions():[];
    if(!players.length||!slots.length)return{week,total:0,assignments:[],bench:[...players],projectionQuality:projectionQuality(week)};
    const values=players.map(p=>adjustedWeeklyProjection(p,week));
    const ordered=[...slots].sort((a,b)=>players.filter(p=>eligible(p,a.type)).length-players.filter(p=>eligible(p,b.type)).length),memo=new Map();
    function go(idx,mask){
      if(idx>=ordered.length)return{score:0,assignments:[]};
      const key=`${idx}|${mask.toString()}`;if(memo.has(key))return memo.get(key);
      const slot=ordered[idx],tail=go(idx+1,mask);let best={score:tail.score,assignments:[{slot,player:null,weekly:null},...tail.assignments]};
      for(let i=0;i<players.length;i++){
        const bit=1n<<BigInt(i);if((mask&bit)!==0n||!eligible(players[i],slot.type))continue;
        const weekly=values[i],next=go(idx+1,mask|bit),score=Number(weekly.adjusted||0)+.0001+next.score;
        if(score>best.score)best={score,assignments:[{slot,player:players[i],weekly},...next.assignments]};
      }
      memo.set(key,best);return best;
    }
    const result=go(0,0n);result.assignments.sort((a,b)=>a.slot.displayOrder-b.slot.displayOrder);const used=new Set(result.assignments.filter(x=>x.player).map(x=>x.player.id));
    return{week,total:result.assignments.reduce((s,x)=>s+Number(x.weekly?.adjusted||0),0),assignments:result.assignments,bench:players.filter(p=>!used.has(p.id)),projectionQuality:projectionQuality(week)};
  }
  window.bestWeeklyLineup=solve;

  optimizeLineup=async function(){
    const week=weekNumber(),btn=document.getElementById('optimize-lineup');
    if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent=`Loading Week ${week} projections…`}
    try{
      if(typeof loadNflWeek==='function')await loadNflWeek(week,false);
      lineupResult=solve(typeof myRoster==='function'?myRoster():[],week);state.currentWeek=week;saveState();renderRoster();renderQuality();
      const q=projectionQuality(week);if(typeof toast==='function')toast(q.available?`Week ${week} lineup optimized with ${q.provider||'weekly'} projections`:`Week ${week} projection feed unavailable — using fallback values`,q.available?undefined:'error');
    }finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'Optimize lineup'}}
  };

  function renderQuality(){
    const week=weekNumber(),q=projectionQuality(week),html=q.available?`<span class="quality-dot live"></span><strong>Real Week ${week} projections</strong><small>${q.provider} · ${q.matchedPlayers||q.count} matched · ${String(q.scoring).toUpperCase()}</small>`:`<span class="quality-dot fallback"></span><strong>Weekly projection fallback</strong><small>Provider data is not available yet; estimates are clearly marked as fallback.</small>`;
    document.querySelectorAll('#mc-lineup,#lineup-output').forEach(host=>{
      if(!host)return;let badge=host.parentElement?.querySelector(':scope > .weekly-projection-quality');
      if(!badge){badge=document.createElement('div');badge.className='weekly-projection-quality';host.parentElement?.insertBefore(badge,host)}
      if(badge&&badge.innerHTML!==html)badge.innerHTML=html;
    });
  }
  window.renderWeeklyProjectionQuality=renderQuality;
  const style=document.createElement('style');style.textContent='.weekly-projection-quality{display:flex;align-items:center;gap:8px;margin:10px 0 12px;padding:9px 11px;border:1px solid #29352b;border-radius:10px;background:#09100b;color:#dce5d9;font-size:11px}.weekly-projection-quality strong{margin-right:4px}.weekly-projection-quality small{color:#7f8c80}.quality-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}.quality-dot.live{background:#a8ff45;box-shadow:0 0 10px rgba(168,255,69,.45)}.quality-dot.fallback{background:#d5a84a}';document.head.appendChild(style);

  // Do not watch the entire DOM. The previous MutationObserver rewrote the badge in response to
  // its own DOM mutation and could create a render feedback loop that froze Weekly Matchups.
  const baseMatchupRender=window.renderMatchupCenter;
  if(typeof baseMatchupRender==='function')window.renderMatchupCenter=function(){const result=baseMatchupRender.apply(this,arguments);renderQuality();return result};
  const baseRosterRender=typeof renderRoster==='function'?renderRoster:null;
  if(baseRosterRender)renderRoster=function(){const result=baseRosterRender.apply(this,arguments);renderQuality();return result};
  setTimeout(renderQuality,0);
})();
