const { onSchedule } = require('firebase-functions/v2/scheduler');
const { admin, db } = require('./lib/firebase');
const { fetchNflWeekData, writeNflWeekCache } = require('./lib/nfl-data');

function activeSeason(now = new Date()) {
  return Number(process.env.NFL_SEASON || now.getFullYear());
}

function activeWeeks() {
  const configured = String(process.env.NFL_CACHE_WEEKS || '').split(',').map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n >= 1 && n <= 18);
  if (configured.length) return [...new Set(configured)].slice(0, 6);
  const current = Math.max(1, Math.min(18, Number(process.env.NFL_CURRENT_WEEK || 1)));
  return [...new Set([current, current + 1].filter(w => w <= 18))];
}

exports.refreshNflWeekCache = onSchedule({ schedule: 'every 30 minutes', timeZone: 'America/Los_Angeles', timeoutSeconds: 120, memory: '512MiB' }, async () => {
  const season = activeSeason();
  const scorings = ['standard', 'half-ppr', 'ppr'];
  for (const week of activeWeeks()) {
    for (const scoring of scorings) {
      try {
        const payload = await fetchNflWeekData({ season, week, scoring });
        await writeNflWeekCache(payload, scoring);
        console.log('Cached NFL week', { season, week, scoring, games: payload.games.length, projections: payload.projections.length });
      } catch (error) {
        console.warn('NFL cache refresh failed', { season, week, scoring, error: error?.message || String(error) });
      }
    }
  }
});

exports.cleanupUsageCounters = onSchedule({ schedule: 'every 24 hours', timeZone: 'America/Los_Angeles', timeoutSeconds: 120, memory: '256MiB' }, async () => {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const users = await db().collection('users').listDocuments();
  let deleted = 0;
  for (const userRef of users) {
    const usage = await userRef.collection('usage').listDocuments();
    const old = usage.filter(ref => ref.id < cutoff).slice(0, 400);
    if (!old.length) continue;
    const batch = db().batch();
    old.forEach(ref => batch.delete(ref));
    await batch.commit();
    deleted += old.length;
  }
  console.log('Cleaned old usage counters', { deleted, cutoff });
});

exports.cleanupExpiredPublicCache = onSchedule({ schedule: 'every 24 hours', timeZone: 'America/Los_Angeles', timeoutSeconds: 120, memory: '256MiB' }, async () => {
  const snap = await db().collection('publicCache/nflWeeks/items')
    .where('expiresAt', '<', admin.firestore.Timestamp.now())
    .limit(400)
    .get();
  if (snap.empty) {
    console.log('No expired NFL cache entries');
    return;
  }
  const batch = db().batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log('Cleaned expired NFL cache entries', { deleted: snap.size });
});
