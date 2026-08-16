const { admin, db } = require('./firebase');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function bearerToken(req) {
  const header = req.get('authorization') || req.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function requireAuthenticatedUser(req) {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Sign in to use this feature');
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.warn('Firebase ID token verification failed', error?.message || error);
    throw new HttpError(401, 'Your sign-in session could not be verified');
  }
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function enforceDailyQuota(uid, bucket, limit) {
  const max = Math.max(1, Number(limit) || 1);
  const day = utcDayKey();
  const ref = db().doc(`users/${uid}/usage/${day}`);
  await db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const current = Number(data[bucket] || 0);
    if (current >= max) {
      throw new HttpError(429, `Daily ${bucket} limit reached`);
    }
    tx.set(ref, {
      [bucket]: current + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

function sendHttpError(res, error) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  return null;
}

module.exports = {
  HttpError,
  requireAuthenticatedUser,
  enforceDailyQuota,
  sendHttpError,
  utcDayKey
};
