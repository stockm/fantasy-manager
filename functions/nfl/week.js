const { onRequest } = require('firebase-functions/v2/https');

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

const nflWeek=onRequest({timeoutSeconds:30,memory:'256MiB'},async(req,res)=>{
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
    return res.status(200).json({season,week,source:'ESPN public NFL scoreboard + Sleeper weekly projections',fetchedAt,games,projections:projection.rows,projectionStatus:{attempted:true,available:projection.rows.length>0,provider:'Sleeper weekly projections',count:projection.rows.length,scoring,fetchedAt,error:projection.rows.length?'':projection.error||'Weekly projections unavailable'}});
  }catch(error){console.error('nflWeek failure',error);return res.status(502).json({error:'NFL week data temporarily unavailable'})}
});

module.exports={nflWeek};
