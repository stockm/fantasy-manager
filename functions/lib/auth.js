const { admin, db } = require('./firebase');
const FREE_DAILY_AI_TOKENS = Number(process.env.FREE_DAILY_AI_TOKENS || process.env.AI_DAILY_LIMIT || 60);

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
  const billingRef = db().doc(`users/${uid}/billing/account`);
  await db().runTransaction(async tx => {
    const [snap, billingSnap] = await Promise.all([tx.get(ref), tx.get(billingRef)]);
    const data = snap.exists ? snap.data() || {} : {};
    const billing = billingSnap.exists ? billingSnap.data() || {} : {};
    const current = Number(data[bucket] || 0);
    const freeUsed = Number(data.freeAiTokensUsed || 0);
    const paidBalance = Number(billing.tokenBalance || 0);
    const useFree = current < max && freeUsed < FREE_DAILY_AI_TOKENS;
    if (!useFree && paidBalance < 1) {
      throw new HttpError(402, 'AI token balance is empty. Open Account to buy more tokens.');
    }
    tx.set(ref, {
      [bucket]: current + 1,
      freeAiTokensUsed: freeUsed + (useFree ? 1 : 0),
      paidAiTokensUsed: Number(data.paidAiTokensUsed || 0) + (useFree ? 0 : 1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    if (!useFree) {
      tx.set(billingRef, {
        plan: billing.plan || 'Free + token packs',
        tokenBalance: paidBalance - 1,
        lifetimeSpent: Number(billing.lifetimeSpent || 0) + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else if (!billingSnap.exists) {
      tx.set(billingRef, {
        plan: 'Free + token packs',
        tokenBalance: 0,
        lifetimePurchased: 0,
        lifetimeSpent: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
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
