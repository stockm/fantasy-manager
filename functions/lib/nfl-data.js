const { admin, db } = require('./firebase');

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function weatherSummary(weather) {
  if (!weather || typeof weather !== 'object') return { weather: '', temperature: null, wind: null };
  const display = weather.displayValue || weather.conditionId || weather.type || weather.conditions || '';
  const temperature = numberOrNull(weather.temperature);
  let wind = numberOrNull(weather.windSpeed);
  if (wind === null && typeof weather.wind === 'string') {
    const m = weather.wind.match(/(\d+(?:\.\d+)?)/);
    wind = m ? Number(m[1]) : null;
  }
  return { weather: String(display || ''), temperature, wind };
}

function normalizeScoring(v) {
  const s = String(v || 'half-ppr').toLowerCase();
  return s === 'ppr' ? 'ppr' : s === 'standard' ? 'standard' : 'half-ppr';
}

function sleeperPointField(scoring) {
  return scoring === 'ppr' ? 'pts_ppr' : scoring === 'standard' ? 'pts_std' : 'pts_half_ppr';
}

function normalizeProjectionRows(data, scoring) {
  const raw = Array.isArray(data) ? data : Array.isArray(data?.projections) ? data.projections : Array.isArray(data?.data) ? data.data : [];
  const field = sleeperPointField(scoring);
  return raw.map(row => {
    const stats = row?.stats || row?.projection || row || {};
    const player = row?.player || row?.metadata || {};
    const points = numberOrNull(stats[field]) ?? numberOrNull(row?.[field]) ?? numberOrNull(stats.pts_half_ppr) ?? numberOrNull(stats.pts_ppr) ?? numberOrNull(stats.pts_std);
    if (points === null) return null;
    const playerId = String(row?.player_id || row?.playerId || player?.player_id || player?.playerId || '');
    const name = String(player?.full_name || player?.name || row?.full_name || row?.name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || '').trim();
    const team = String(player?.team || row?.team || stats?.team || '').trim().toUpperCase();
    let position = String(player?.position || row?.position || stats?.position || '').toUpperCase();
    if (['DST', 'DEF', 'D-ST'].includes(position)) position = 'D/ST';
    return {
      playerId,
      name,
      team,
      position,
      points: Number(points.toFixed(3)),
      scoring,
      source: 'Sleeper weekly projection',
      provider: 'Sleeper',
      stats: {
        pts_std: numberOrNull(stats.pts_std),
        pts_half_ppr: numberOrNull(stats.pts_half_ppr),
        pts_ppr: numberOrNull(stats.pts_ppr)
      }
    };
  }).filter(Boolean);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSleeperWeeklyProjections(season, week, scoring) {
  const field = sleeperPointField(scoring);
  const urls = [
    `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&order_by=${field}`,
    `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular`
  ];
  let lastError = '';
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'FantasyManager/1.0', Accept: 'application/json' } });
      if (!r.ok) {
        lastError = `Sleeper projection provider ${r.status}`;
        continue;
      }
      const rows = normalizeProjectionRows(await r.json(), scoring);
      if (rows.length) return { rows, url };
      lastError = 'Sleeper projection feed returned no Week rows';
    } catch (e) {
      lastError = e?.name === 'AbortError' ? 'Sleeper projection request timed out' : String(e?.message || e);
    }
  }
  return { rows: [], error: lastError || 'Sleeper projection feed unavailable' };
}

function cacheDocId(season, week, scoring) {
  return `${Number(season)}-week-${Number(week)}-${normalizeScoring(scoring)}`;
}

async function readNflWeekCache(season, week, scoring, maxAgeMs) {
  const ref = db().doc(`publicCache/nflWeeks/items/${cacheDocId(season, week, scoring)}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const cached = snap.data()?.payload;
  const cachedAt = snap.data()?.cachedAt?.toDate?.() || null;
  if (!cached || !cachedAt || Date.now() - cachedAt.getTime() > maxAgeMs) return null;
  return { ...cached, cache: { hit: true, cachedAt: cachedAt.toISOString() } };
}

async function writeNflWeekCache(payload, scoring) {
  const ref = db().doc(`publicCache/nflWeeks/items/${cacheDocId(payload.season, payload.week, scoring)}`);
  await ref.set({
    payload,
    scoring: normalizeScoring(scoring),
    cachedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 60 * 1000)
  }, { merge: true });
}

async function fetchNflWeekData({ season, week, scoring }) {
  const normalizedScoring = normalizeScoring(scoring);
  const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const [scheduleResult, projectionResult] = await Promise.allSettled([
    fetchWithTimeout(scheduleUrl, { headers: { 'User-Agent': 'FantasyManager/1.0' } }).then(async r => {
      if (!r.ok) throw new Error(`Schedule provider ${r.status}`);
      return r.json();
    }),
    fetchSleeperWeeklyProjections(season, week, normalizedScoring)
  ]);
  if (scheduleResult.status !== 'fulfilled') throw scheduleResult.reason;
  const data = scheduleResult.value;
  const games = (data.events || []).map(e => {
    const c = e.competitions?.[0];
    const teams = c?.competitors || [];
    const home = teams.find(t => t.homeAway === 'home');
    const away = teams.find(t => t.homeAway === 'away');
    const odds = c?.odds?.[0] || {};
    const weather = weatherSummary(c?.weather || e?.weather);
    const venue = c?.venue || {};
    const broadcasts = (c?.broadcasts || []).flatMap(b => b.names || []).filter(Boolean);
    return {
      id: e.id,
      date: e.date || '',
      home: home?.team?.abbreviation || '',
      away: away?.team?.abbreviation || '',
      status: e.status?.type?.description || '',
      completed: !!e.status?.type?.completed,
      venue: venue.fullName || venue.name || '',
      indoor: typeof venue.indoor === 'boolean' ? venue.indoor : null,
      neutralSite: typeof c?.neutralSite === 'boolean' ? c.neutralSite : false,
      weather: weather.weather,
      temperature: weather.temperature,
      wind: weather.wind,
      overUnder: numberOrNull(odds.overUnder),
      spread: numberOrNull(odds.spread),
      oddsDetails: odds.details || '',
      broadcast: [...new Set(broadcasts)].join(', ')
    };
  }).filter(g => g.home && g.away);
  const projection = projectionResult.status === 'fulfilled' ? projectionResult.value : { rows: [], error: String(projectionResult.reason?.message || projectionResult.reason || 'Projection provider unavailable') };
  const fetchedAt = new Date().toISOString();
  return {
    season,
    week,
    source: 'ESPN public NFL scoreboard + Sleeper weekly projections',
    fetchedAt,
    games,
    projections: projection.rows,
    projectionStatus: {
      attempted: true,
      available: projection.rows.length > 0,
      provider: 'Sleeper weekly projections',
      count: projection.rows.length,
      scoring: normalizedScoring,
      fetchedAt,
      error: projection.rows.length ? '' : projection.error || 'Weekly projections unavailable'
    }
  };
}

module.exports = {
  fetchNflWeekData,
  normalizeScoring,
  readNflWeekCache,
  writeNflWeekCache
};
