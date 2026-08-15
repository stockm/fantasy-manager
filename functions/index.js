const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6';
const SYSTEM = `You are an expert fantasy football GM for a competitive 14-team half-PPR league. Use only supplied data and distinguish measured inputs from inference. Never invent injuries, news, odds, projections, players, schedules or facts. For draft analysis recommend one best pick plus two alternatives using roster construction, scarcity, ECR, ADP and projections. For weekly analysis prioritize the actual NFL opponent for each player, true week-specific projections when supplied, matchup-adjusted projections and simulated fantasy win probability. For lineup analysis, review the supplied legal starting lineup against the bench using every week-specific factor actually present: NFL opponent, home/away, bye, player status, defense-vs-position factor, game time/status, venue/indoor/neutral-site, weather/wind, over-under/spread and projection source. Do not infer a missing factor. Treat a projection explicitly marked realWeeklyProjection=true as a genuine provider Week projection; do not describe it as season projection divided by 17. Prefer the supplied legal lineup unless a bench alternative has stronger supplied week-specific evidence. Explain the most important start/sit choices and close calls. For trade analysis, evaluate the supplied completed trade or acquisition target specifically from the user's roster perspective. Consider roster needs, player value, ECR/ADP/projection evidence, current ownership, positional scarcity, depth and any supplied Week context. If the user's team was not part of the completed trade, determine whether the transaction creates a realistic acquisition opportunity and identify which moved or affected player is worth targeting. If the user's team was involved, assess what was gained and lost and the best next roster action. Never assume another manager will accept a particular offer; describe reasonable offer structure only from the supplied values and rosters. For weekly matchup analysis explain whether the manager should prefer floor or ceiling based on win probability. Identify start/sit priorities, exploitable roster mismatches and realistic trades using all league rosters. Clearly separate one-week matchup value from rest-of-season value. If a data field is absent, explicitly say it is unavailable rather than guessing.`;
function taskPrompt(task){
  if(task==='draft')return 'Analyze the current draft state and recommend the best selection now.';
  if(task==='lineup')return 'Review the Week-specific legal lineup and bench. Validate or challenge the starters using only the supplied NFL matchup, home/away, status, projection and game-environment evidence. Give the recommended lineup decisions first, then the key reasons and close calls.';
  if(task==='trade')return 'Act as the trade analyst for my fantasy team. Evaluate the supplied completed trade or target against my current roster. State first whether I should pursue any involved/target player, why, and what type of player/value I could reasonably offer without assuming acceptance. Then explain roster impact and the next-best move.';
  return 'Act as the AI Fantasy GM. Analyze this exact NFL week, the fantasy opponent, adjusted projections, simulation and league rosters. Give the highest-impact actions first.';
}
function extractText(data){const found=[];const add=v=>{if(typeof v==='string'&&v.trim())found.push(v.trim())};add(data?.output_text);for(const item of data?.output||[]){add(item?.output_text);add(item?.text);for(const part of item?.content||[]){add(part?.text);add(part?.output_text);if(typeof part?.text==='object')add(part.text.value);if(typeof part?.content==='string')add(part.content)}}return[...new Set(found)].join('\n').trim()}
function responseSummary(data){return{status:data?.status||null,incompleteReason:data?.incomplete_details?.reason||null,error:data?.error?.message||null,outputTypes:(data?.output||[]).map(x=>({type:x?.type||null,status:x?.status||null,contentTypes:(x?.content||[]).map(c=>c?.type||null)})),usage:data?.usage||null}}
function flattenPlayers(value){
  if(Array.isArray(value))return value;
  if(value&&typeof value==='object')return Object.values(value).flatMap(v=>Array.isArray(v)?v:[v]);
  return [];
}
function weeklyContextStatus(context){
  const schedule=context?.nflWeek||context?.weekContext||context?.schedule||null;
  const games=Array.isArray(schedule?.games)?schedule.games:[];
  const candidates=[...(context?.selectedLineup?.starters||[]),...(context?.bench||[]),...(context?.players||[]),...(context?.adjustedProjections||[]),...(context?.weeklyProjections||[])];
  const playerRows=flattenPlayers(candidates).map(x=>x?.player||x).filter(Boolean);
  const providerAvailable=!!schedule?.projectionStatus?.available;
  const hasReal=providerAvailable||playerRows.some(p=>p?.realWeeklyProjection===true||/sleeper weekly projection|weekly projection/i.test(String(p?.projectionSource||'')));
  const simulation=context?.simulation||context?.matchupSimulation||context?.fantasyOpponent?.simulation||null;
  return{hasSchedule:games.length>0,gameCount:games.length,hasProjectionData:hasReal,projectionProvider:schedule?.projectionStatus?.provider||null,projectionCount:Number(schedule?.projectionStatus?.count)||0,hasSimulation:!!simulation,simulationUsesRealProjections:!!simulation&&hasReal};
}
exports.aiAdvice=onRequest({secrets:[OPENAI_API_KEY],timeoutSeconds:60,memory:'256MiB'},async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const{task,context}=req.body||{};
  if(!['draft','weekly','lineup','trade'].includes(task)||!context||typeof context!=='object')return res.status(400).json({error:'Invalid request'});
  const weeklyStatus=['weekly','lineup'].includes(task)?weeklyContextStatus(context):null;
  const serialized=JSON.stringify(context);
  if(serialized.length>220000)return res.status(413).json({error:'Analysis context too large'});
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:`Bearer ${OPENAI_API_KEY.value()}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:OPENAI_MODEL,instructions:SYSTEM,input:`${taskPrompt(task)}${weeklyStatus?`\nWEEKLY DATA STATUS: ${JSON.stringify(weeklyStatus)}. If hasProjectionData is true, the supplied values include real week-specific provider projections and must not be described as season/17 estimates. If projection inputs are absent, state that clearly.`:''}\n\nLEAGUE DATA:\n${serialized}`,max_output_tokens:2400})
    });
    let data;try{data=await response.json()}catch(parseError){const raw=await response.text().catch(()=> '');console.error('OpenAI non-JSON response',response.status,raw.slice(0,1000));return res.status(502).json({error:'AI service returned an unreadable response'})}
    if(!response.ok){console.error('OpenAI error',response.status,data?.error?.message||'unknown',responseSummary(data));return res.status(response.status>=500?502:response.status).json({error:data?.error?.message||'AI request failed'})}
    const advice=extractText(data);if(!advice){const summary=responseSummary(data);console.error('OpenAI response contained no extractable advice',summary);const reason=summary.incompleteReason?` (${summary.incompleteReason})`:'';return res.status(502).json({error:`AI completed without usable text${reason}`,diagnostic:{status:summary.status,outputTypes:summary.outputTypes,weeklyData:weeklyStatus}})}
    return res.status(200).json({advice,model:OPENAI_MODEL,weeklyData:weeklyStatus})
  }catch(error){console.error('aiAdvice failure',error);return res.status(500).json({error:'AI analysis temporarily unavailable'})}
});
function numberOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null}
function weatherSummary(weather){if(!weather||typeof weather!=='object')return{weather:'',temperature:null,wind:null};const display=weather.displayValue||weather.conditionId||weather.type||weather.conditions||'';const temperature=numberOrNull(weather.temperature);let wind=numberOrNull(weather.windSpeed);if(wind===null&&typeof weather.wind==='string'){const m=weather.wind.match(/(\d+(?:\.\d+)?)/);wind=m?Number(m[1]):null}return{weather:String(display||''),temperature,wind}}
function normalizeScoring(v){const s=String(v||'half-ppr').toLowerCase();return s==='ppr'?'ppr':s==='standard'?'standard':'half-ppr'}
function sleeperPointField(scoring){return scoring==='ppr'?'pts_ppr':scoring==='standard'?'pts_std':'pts_half_ppr'}
function normalizeProjectionRows(data,scoring){
  const raw=Array.isArray(data)?data:Array.isArray(data?.projections)?data.projections:Array.isArray(data?.data)?data.data:[];
  const field=sleeperPointField(scoring);
  return raw.map(row=>{
    const stats=row?.stats||row?.projection||row||{},player=row?.player||row?.metadata||{};
    const points=numberOrNull(stats[field])??numberOrNull(row?.[field])??numberOrNull(stats.pts_half_ppr)??numberOrNull(stats.pts_ppr)??numberOrNull(stats.pts_std);
    if(points===null)return null;
    const playerId=String(row?.player_id||row?.playerId||player?.player_id||player?.playerId||'');
    const name=String(player?.full_name||player?.name||row?.full_name||row?.name||[player?.first_name,player?.last_name].filter(Boolean).join(' ')||'').trim();
    const team=String(player?.team||row?.team||stats?.team||'').trim().toUpperCase();
    let position=String(player?.position||row?.position||stats?.position||'').toUpperCase();if(['DST','DEF','D-ST'].includes(position))position='D/ST';
    return{playerId,name,team,position,points:Number(points.toFixed(3)),scoring,source:'Sleeper weekly projection',provider:'Sleeper',stats:{pts_std:numberOrNull(stats.pts_std),pts_half_ppr:numberOrNull(stats.pts_half_ppr),pts_ppr:numberOrNull(stats.pts_ppr)}};
  }).filter(Boolean);
}
async function fetchSleeperWeeklyProjections(season,week,scoring){
  const field=sleeperPointField(scoring),urls=[
    `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&order_by=${field}`,
    `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`
  ];
  let lastError='';
  for(const url of urls){
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      const r=await fetch(url,{headers:{'User-Agent':'FantasyManager/1.0','Accept':'application/json'},signal:controller.signal});clearTimeout(timer);
      if(!r.ok){lastError=`Sleeper projection provider ${r.status}`;continue}
      const data=await r.json(),rows=normalizeProjectionRows(data,scoring);if(rows.length)return{rows,url};lastError='Sleeper projection feed returned no Week rows';
    }catch(e){lastError=e?.name==='AbortError'?'Sleeper projection request timed out':String(e?.message||e)}
  }
  return{rows:[],error:lastError||'Sleeper projection feed unavailable'};
}
exports.nflWeek=onRequest({timeoutSeconds:30,memory:'256MiB'},async(req,res)=>{
  res.set('Cache-Control','public, max-age=1800');
  const week=Math.max(1,Math.min(18,Number(req.query.week)||1));const season=Number(req.query.season)||new Date().getFullYear();const scoring=normalizeScoring(req.query.scoring);
  try{
    const scheduleUrl=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
    const [scheduleResult,projectionResult]=await Promise.allSettled([
      fetch(scheduleUrl,{headers:{'User-Agent':'FantasyManager/1.0'}}).then(async r=>{if(!r.ok)throw new Error(`Schedule provider ${r.status}`);return r.json()}),
      fetchSleeperWeeklyProjections(season,week,scoring)
    ]);
    if(scheduleResult.status!=='fulfilled')throw scheduleResult.reason;
    const data=scheduleResult.value;
    const games=(data.events||[]).map(e=>{const c=e.competitions?.[0],teams=c?.competitors||[],home=teams.find(t=>t.homeAway==='home'),away=teams.find(t=>t.homeAway==='away');const odds=c?.odds?.[0]||{},weather=weatherSummary(c?.weather||e?.weather),venue=c?.venue||{};const broadcasts=(c?.broadcasts||[]).flatMap(b=>b.names||[]).filter(Boolean);return{id:e.id,date:e.date||'',home:home?.team?.abbreviation||'',away:away?.team?.abbreviation||'',status:e.status?.type?.description||'',completed:!!e.status?.type?.completed,venue:venue.fullName||venue.name||'',indoor:typeof venue.indoor==='boolean'?venue.indoor:null,neutralSite:typeof c?.neutralSite==='boolean'?c.neutralSite:false,weather:weather.weather,temperature:weather.temperature,wind:weather.wind,overUnder:numberOrNull(odds.overUnder),spread:numberOrNull(odds.spread),oddsDetails:odds.details||'',broadcast:[...new Set(broadcasts)].join(', ')}}).filter(g=>g.home&&g.away);
    const projection=projectionResult.status==='fulfilled'?projectionResult.value:{rows:[],error:String(projectionResult.reason?.message||projectionResult.reason||'Projection provider unavailable')};
    const fetchedAt=new Date().toISOString();
    return res.status(200).json({season,week,source:'ESPN public NFL scoreboard + Sleeper weekly projections',fetchedAt,games,projections:projection.rows,projectionStatus:{attempted:true,available:projection.rows.length>0,provider:'Sleeper weekly projections',count:projection.rows.length,scoring,fetchedAt,error:projection.rows.length?'':projection.error||'Weekly projections unavailable'}})
  }catch(error){console.error('nflWeek failure',error);return res.status(502).json({error:'NFL week data temporarily unavailable'})}
});

exports.screenshotImport=require('./screenshot-import').screenshotImport;
