const { onRequest } = require('firebase-functions/v2/https');
const { fetchNflWeekData, normalizeScoring, readNflWeekCache, writeNflWeekCache } = require('../lib/nfl-data');

const CACHE_MAX_AGE_MS = Number(process.env.NFL_WEEK_CACHE_MAX_AGE_MS || 30 * 60 * 1000);

const nflWeek=onRequest({timeoutSeconds:30,memory:'256MiB'},async(req,res)=>{
  res.set('Cache-Control','public, max-age=1800');
  const week=Math.max(1,Math.min(18,Number(req.query.week)||1));const season=Number(req.query.season)||new Date().getFullYear();const scoring=normalizeScoring(req.query.scoring);
  try{
    const cached=await readNflWeekCache(season,week,scoring,CACHE_MAX_AGE_MS);
    if(cached)return res.status(200).json(cached);
    const payload=await fetchNflWeekData({season,week,scoring});
    await writeNflWeekCache(payload,scoring).catch(e=>console.warn('NFL week cache write failed',e?.message||e));
    return res.status(200).json({...payload,cache:{hit:false}});
  }catch(error){console.error('nflWeek failure',error);return res.status(502).json({error:'NFL week data temporarily unavailable'})}
});

module.exports={nflWeek};
