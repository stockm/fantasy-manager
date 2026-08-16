// Week-aware lineup optimizer and AI review.
// Uses the selected NFL week, real schedule context, home/away, bye weeks,
// player status, defense-vs-position data and any game-environment fields supplied
// by the NFL schedule endpoint. The legal lineup solver remains deterministic;
// AI reviews the selected starters and close calls using the exact same context.
(function installWeeklyLineupIntelligence(){
  let lineupBusy=false;

  const posKey=p=>{
    const x=String(primaryPos(p)||'').toUpperCase();
    return x==='DST'||x==='D/ST'||x==='DEF'?'D/ST':x;
  };
  const clampFactor=(x,a=.72,b=1.28)=>Math.max(a,Math.min(b,x));
  const selectedWeek=()=>{
    const picker=Number(document.getElementById('lineup-week')?.value);
    const matchup=Number(document.getElementById('matchup-week')?.value);
    return Math.max(1,Math.min(18,picker||Number(state.currentWeek)||matchup||1));
  };

  function explicitWeeklyProjection(p,week){
    const obj=p.weeklyProjections||p.weekProjections||p.projectionsByWeek;
    const direct=num(obj?.[String(week)]??obj?.[week]??p.weeklyProjection??p.weekProjection);
    if(direct!==null)return{value:direct,source:'weekly projection'};
    const season=num(p.projection);
    if(season!==null){
      // Current draft feeds commonly store full-season fantasy points.
      // Values already in a realistic weekly range are left unchanged.
      if(season>60)return{value:season/17,source:'season projection ÷ 17'};
      return{value:season,source:'supplied projection'};
    }
    const rank=num(p.rank,250),adp=num(p.adp,rank);
    return{value:Math.max(2,18-rank*.07-adp*.015),source:'ECR/ADP fallback'};
  }

  function scheduleForWeek(week){return state.nflWeeks?.[String(week)]||null}
  function gameForPlayer(p,week){
    const schedule=scheduleForWeek(week),games=schedule?.games||[],team=nflTeamKey(p.team);
    const game=games.find(g=>nflTeamKey(g.home)===team||nflTeamKey(g.away)===team)||null;
    const scheduleLoaded=Array.isArray(games)&&games.length>0;
    if(!game)return{scheduleLoaded,game:null,bye:!!(scheduleLoaded&&team)};
    const home=nflTeamKey(game.home)===team;
    return{
      scheduleLoaded,game,bye:false,home,away:!home,
      opponent:home?game.away:game.home,
      gameTime:game.date||'',gameStatus:game.status||'',
      venue:game.venue||'',indoor:game.indoor??null,neutralSite:game.neutralSite??false,
      weather:game.weather||'',temperature:num(game.temperature),wind:num(game.wind),
      overUnder:num(game.overUnder),spread:num(game.spread),oddsDetails:game.oddsDetails||''
    };
  }

  function defenseVsPositionFactor(opponent,position){
    if(!opponent)return{factor:1,available:false};
    const bucket=state.defenseVsPos?.[nflTeamKey(opponent)]||{};
    const keys=position==='D/ST'?['D/ST','DST','DEF']:[position];
    let raw=null;
    for(const key of keys){raw=num(bucket[key]);if(raw!==null)break}
    if(raw===null)return{factor:1,available:false};
    return{factor:Math.max(.82,Math.min(1.18,raw)),available:true};
  }

  function weatherFactor(p,ctx){
    if(!ctx?.game)return 1;
    const pos=posKey(p),text=String(ctx.weather||'').toLowerCase();
    let factor=1;
    const wind=num(ctx.wind);
    if(wind!==null&&wind>=20){
      if(['QB','WR','K'].includes(pos))factor*=.94;
      else if(['RB','TE'].includes(pos))factor*=.98;
    }
    if(/rain|snow|storm|showers/.test(text)){
      if(['QB','WR','K'].includes(pos))factor*=.97;
      else if(['RB','TE'].includes(pos))factor*=.99;
    }
    return factor;
  }

  function gameEnvironmentFactor(p,ctx){
    if(!ctx?.game)return 1;
    const pos=posKey(p);
    let factor=1;
    if(ctx.home&&!ctx.neutralSite)factor*=1.01;
    if(ctx.overUnder!==null&&['QB','RB','WR','TE','K'].includes(pos)){
      factor*=Math.max(.94,Math.min(1.06,1+(ctx.overUnder-44)*.004));
    }
    factor*=weatherFactor(p,ctx);
    return factor;
  }

  function playerStatusFactor(p){
    const status=String(p.status||'').toUpperCase();
    if(/OUT|IR|SUSP|PUP|NFI/.test(status))return 0;
    if(/DOUBTFUL/.test(status))return .35;
    if(/QUESTIONABLE/.test(status))return .90;
    return 1;
  }

  function weekProjection(p,week){
    const baseInfo=explicitWeeklyProjection(p,week),ctx=gameForPlayer(p,week);
    const defense=defenseVsPositionFactor(ctx.opponent,posKey(p));
    const environment=gameEnvironmentFactor(p,ctx),statusFactor=playerStatusFactor(p);
    let factor=defense.factor*environment*statusFactor;
    if(ctx.bye)factor=0;
    const adjusted=Math.max(0,baseInfo.value*clampFactor(factor,0,1.35));
    return{
      base:baseInfo.value,projectionSource:baseInfo.source,adjusted,
      factor:baseInfo.value?adjusted/baseInfo.value:0,
      opponent:ctx.opponent||null,home:ctx.home??null,away:ctx.away??null,bye:ctx.bye,
      gameTime:ctx.gameTime||null,gameStatus:ctx.gameStatus||null,
      venue:ctx.venue||null,indoor:ctx.indoor??null,neutralSite:ctx.neutralSite??null,
      weather:ctx.weather||null,temperature:ctx.temperature??null,wind:ctx.wind??null,
      overUnder:ctx.overUnder??null,spread:ctx.spread??null,oddsDetails:ctx.oddsDetails||null,
      defenseVsPositionFactor:defense.available?defense.factor:null,
      homeAwayFactor:ctx.game?(ctx.home&&!ctx.neutralSite?1.01:1):null,
      gameEnvironmentFactor:ctx.game?environment:null,
      status:p.status||'',statusFactor,
      scheduleLoaded:ctx.scheduleLoaded
    };
  }

  // Upgrade the rest of the weekly intelligence layer to use the same factor set.
  adjustedWeeklyProjection=function(p,week){
    const x=weekProjection(p,week);
    return{
      base:x.base,adjusted:x.adjusted,factor:x.factor,opponent:x.opponent,
      home:x.home,gameTime:x.gameTime,status:x.status,bye:x.bye,
      projectionSource:x.projectionSource,venue:x.venue,indoor:x.indoor,
      neutralSite:x.neutralSite,weather:x.weather,temperature:x.temperature,wind:x.wind,
      overUnder:x.overUnder,spread:x.spread,oddsDetails:x.oddsDetails,
      defenseVsPositionFactor:x.defenseVsPositionFactor,
      homeAwayFactor:x.homeAwayFactor,gameEnvironmentFactor:x.gameEnvironmentFactor,
      statusFactor:x.statusFactor,scheduleLoaded:x.scheduleLoaded
    };
  };

  weeklyPlayerContext=function(p,week){
    const x=weekProjection(p,week);
    return{
      ...compactPlayer(p),
      week,
      nflOpponent:x.opponent,
      location:x.bye?'BYE':x.opponent?(x.home?'HOME':'AWAY'):'UNKNOWN',
      home:x.home,away:x.away,bye:x.bye,gameTime:x.gameTime,gameStatus:x.gameStatus,
      venue:x.venue,indoor:x.indoor,neutralSite:x.neutralSite,
      weather:x.weather,temperature:x.temperature,wind:x.wind,
      overUnder:x.overUnder,spread:x.spread,oddsDetails:x.oddsDetails,
      baseWeeklyProjection:Number(x.base.toFixed(2)),
      adjustedWeeklyProjection:Number(x.adjusted.toFixed(2)),
      matchupFactor:Number(x.factor.toFixed(3)),
      projectionSource:x.projectionSource,
      factors:{
        defenseVsPosition:x.defenseVsPositionFactor,
        homeAway:x.homeAwayFactor,
        gameEnvironment:x.gameEnvironmentFactor,
        playerStatus:x.statusFactor
      }
    };
  };

  function solveLegalLineup(players,week){
    const slots=slotDefinitions();
    if(!players.length||!slots.length)return{total:0,assignments:[],bench:[...players]};
    const ordered=[...slots].sort((a,b)=>{
      const ca=players.filter(p=>eligible(p,a.type)).length;
      const cb=players.filter(p=>eligible(p,b.type)).length;
      return ca-cb;
    });
    const memo=new Map();
    function solve(idx,mask){
      if(idx>=ordered.length)return{score:0,assignments:[]};
      const key=`${idx}|${mask.toString()}`;
      if(memo.has(key))return memo.get(key);
      const slot=ordered[idx],tail=solve(idx+1,mask);
      let best={score:tail.score,assignments:[{slot,player:null,weekly:null},...tail.assignments]};
      for(let i=0;i<players.length;i++){
        const bit=1n<<BigInt(i);
        if((mask&bit)!==0n||!eligible(players[i],slot.type))continue;
        const weekly=weekProjection(players[i],week),next=solve(idx+1,mask|bit);
        const score=weekly.adjusted+.0001+next.score;
        if(score>best.score)best={score,assignments:[{slot,player:players[i],weekly},...next.assignments]};
      }
      memo.set(key,best);return best;
    }
    const result=solve(0,0n);
    result.assignments.sort((a,b)=>a.slot.displayOrder-b.slot.displayOrder);
    const used=new Set(result.assignments.filter(x=>x.player).map(x=>x.player.id));
    return{
      week,
      total:result.assignments.reduce((s,x)=>s+(x.weekly?.adjusted||0),0),
      assignments:result.assignments,
      bench:players.filter(p=>!used.has(p.id))
    };
  }
  window.bestWeeklyLineup=solveLegalLineup;

  function formatGame(x){
    if(!x)return'NFL matchup unavailable';
    if(x.bye)return'BYE';
    if(!x.opponent)return'NFL matchup pending';
    return`${x.home?'vs':'@'} ${x.opponent}`;
  }

  function installWeekPicker(){
    const btn=document.getElementById('optimize-lineup');
    if(!btn||document.getElementById('lineup-week'))return;
    const wrap=document.createElement('div');wrap.className='lineup-week-actions';
    const current=Math.max(1,Math.min(18,Number(state.currentWeek)||Number(document.getElementById('matchup-week')?.value)||1));
    wrap.innerHTML=`<label class="lineup-week-label">NFL week <select id="lineup-week">${Array.from({length:18},(_,i)=>`<option value="${i+1}" ${i+1===current?'selected':''}>Week ${i+1}</option>`).join('')}</select></label>`;
    btn.parentNode.insertBefore(wrap,btn);wrap.appendChild(btn);
    document.getElementById('lineup-week')?.addEventListener('change',e=>{
      state.currentWeek=Number(e.target.value)||1;
      const other=document.getElementById('matchup-week');if(other)other.value=String(state.currentWeek);
      if(lineupResult?.week!==state.currentWeek)lineupResult=null;
      saveState();renderRoster();
    });
  }

  function ensureAiBox(){
    const out=document.getElementById('lineup-output');if(!out)return null;
    let box=document.getElementById('lineup-ai-output');
    if(!box){box=document.createElement('div');box.id='lineup-ai-output';box.className='lineup-ai-review';out.insertAdjacentElement('afterend',box)}
    return box;
  }

  function renderWeeklyResult(){
    installWeekPicker();
    if(!lineupResult?.week||!Array.isArray(lineupResult.assignments))return;
    const out=document.getElementById('lineup-output');if(!out)return;
    const total=document.getElementById('lineup-total');if(total)total.textContent=`Week ${lineupResult.week} · ${lineupResult.total.toFixed(1)} pts`;
    out.innerHTML=lineupResult.assignments.map(x=>{
      const w=x.weekly;
      return`<div class="lineup-row weekly"><span class="lineup-slot">${esc(x.slot.label)}</span><div>${x.player?`<div class="player-name">${esc(x.player.name)}</div><div class="player-meta">${esc(posKey(x.player))} · ${esc(x.player.team||'')} · ${esc(formatGame(w))}${w?.status?` · ${esc(w.status)}`:''}</div><div class="lineup-factor">${w?.projectionSource?esc(w.projectionSource):''}${w?.defenseVsPositionFactor!==null&&w?.defenseVsPositionFactor!==undefined?` · DvP ×${w.defenseVsPositionFactor.toFixed(2)}`:''}${w?.overUnder!==null&&w?.overUnder!==undefined?` · O/U ${w.overUnder}`:''}</div>`:'<span class="muted">Empty</span>'}</div><span class="lineup-points">${w?`${w.adjusted.toFixed(1)}<small>${w.factor!==1?`×${w.factor.toFixed(2)}`:''}</small>`:'—'}</span></div>`;
    }).join('');
  }

  const baseRenderRoster=renderRoster;
  renderRoster=function(){baseRenderRoster();renderWeeklyResult();ensureAiBox()};

  function lineupAiContext(week,result){
    const roster=myRoster(),oppSlot=Number(state.matchups?.[String(week)]||0);
    const opponent=oppSlot&&typeof rosterForSlot==='function'?rosterForSlot(oppSlot):[];
    const starters=result.assignments.filter(x=>x.player).map(x=>({slot:x.slot.label,player:weeklyPlayerContext(x.player,week)}));
    const starterIds=new Set(starters.map(x=>canonicalName(x.player.name)));
    const bench=roster.filter(p=>!starterIds.has(canonicalName(p.name))).map(p=>weeklyPlayerContext(p,week));
    const sim=oppSlot&&typeof simulateWeeklyMatchup==='function'?simulateWeeklyMatchup(week,10000):null;
    return{
      mode:'lineup',week,
      league:{name:state.settings.leagueName,teams:state.settings.teams,scoring:state.settings.scoring,roster:state.settings.roster,draftSlot:state.settings.draftSlot},
      nflWeek:scheduleForWeek(week),
      methodology:{
        legalRosterSlots:true,
        factorsUsed:['week-specific NFL opponent','home/away','bye week','player injury/status','defense vs position when supplied','game time/status','venue/indoor/neutral-site when supplied','weather/wind when supplied','over/under and spread when supplied','weekly projection when supplied, otherwise season projection normalized to a weekly baseline','ECR/ADP fallback when no projection exists'],
        rule:'Use only supplied factors. Missing fields are unavailable, not zero. The deterministic optimizer chose the highest adjusted legal lineup; review close calls and only prefer a bench player when supplied week-specific evidence supports it.'
      },
      selectedLineup:{projectedPoints:Number(result.total.toFixed(2)),starters},
      bench,
      fantasyOpponent:oppSlot?{slot:oppSlot,team:leagueTeamName(oppSlot),roster:opponent.map(p=>weeklyPlayerContext(p,week)),simulation:sim}:null
    };
  }

  async function requestLineupAi(week,result){
    const box=ensureAiBox();if(!box)return;
    box.innerHTML='<div class="ai-note">AI is reviewing Week '+week+' opponents, home/away, status and all available matchup factors…</div>';
    try{
      const context=lineupAiContext(week,result);
      const response=await fetch('/api/ai-advice',{method:'POST',headers:typeof authorizedJsonHeaders==='function'?await authorizedJsonHeaders():{'Content-Type':'application/json'},body:JSON.stringify({task:'lineup',context})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||`AI service returned ${response.status}`);
      const text=String(data.advice||'').trim();if(!text)throw new Error('AI service returned no lineup analysis');
      box.innerHTML=`<div class="lineup-ai-head"><span class="ai-badge">AI WEEK ${week} LINEUP REVIEW</span></div><div class="ai-response">${esc(text).replaceAll('\n','<br>')}</div>`;
    }catch(e){
      box.innerHTML=`<div class="ai-note"><strong>AI lineup review unavailable.</strong><br>${esc(e.message)}<br>The week-aware legal optimizer above still used the available matchup data.</div>`;
    }
  }

  async function optimizeForSelectedWeek(e){
    e?.preventDefault?.();e?.stopImmediatePropagation?.();
    if(lineupBusy)return;
    const week=selectedWeek(),roster=myRoster(),slots=slotDefinitions(),btn=document.getElementById('optimize-lineup');
    state.currentWeek=week;saveState();
    if(!roster.length||!slots.length){lineupResult={week,total:0,assignments:[],bench:[...roster]};renderRoster();return}
    lineupBusy=true;
    if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent=`Loading Week ${week}…`}
    const box=ensureAiBox();if(box)box.innerHTML=`<div class="ai-note">Loading the Week ${week} NFL schedule and matchup context…</div>`;
    try{
      if(typeof loadNflWeek==='function')await loadNflWeek(week,false);
      lineupResult=solveLegalLineup(roster,week);
      renderRoster();
      toast(`Week ${week} legal lineup optimized using NFL matchup context`);
      await requestLineupAi(week,lineupResult);
      if(typeof renderNflIntel==='function')renderNflIntel();
    }finally{
      lineupBusy=false;
      const live=document.getElementById('optimize-lineup');
      if(live){live.disabled=false;live.textContent=`Optimize Week ${week}`}
    }
  }

  const btn=document.getElementById('optimize-lineup');
  btn?.addEventListener('click',optimizeForSelectedWeek,true);
  installWeekPicker();

  const style=document.createElement('style');style.id='weekly-lineup-style';style.textContent=`
    .lineup-week-actions{display:flex;align-items:end;gap:10px;flex-wrap:wrap}
    .lineup-week-label{display:grid;gap:5px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#8f98aa)}
    .lineup-week-label select{min-width:110px}
    .lineup-row.weekly .player-meta{margin-top:3px}.lineup-factor{margin-top:3px;font-size:10px;color:var(--muted,#8f98aa)}
    .lineup-points small{display:block;font-size:9px;opacity:.65}.lineup-ai-review{margin-top:14px}
    .lineup-ai-head{margin-bottom:8px}
    @media(max-width:700px){.lineup-week-actions{width:100%;align-items:stretch}.lineup-week-label{flex:1}.lineup-week-actions .btn{width:100%}}
  `;document.head.appendChild(style);

  // Re-render once so the selected-week controls and richer rows are visible immediately.
  renderRoster();
})();
