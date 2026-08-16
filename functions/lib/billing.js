const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const Stripe = require('stripe');
const { admin, db } = require('./firebase');
const { HttpError, requireAuthenticatedUser, sendHttpError, utcDayKey } = require('./auth');

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const FREE_DAILY_AI_TOKENS = Number(process.env.FREE_DAILY_AI_TOKENS || process.env.AI_DAILY_LIMIT || 60);
const STRIPE_PRODUCT_TAX_CODE = process.env.STRIPE_PRODUCT_TAX_CODE || 'txcd_10105001';

const TOKEN_PACKS = [
  { id: 'starter', name: 'Starter Pack', tokens: 50, unitAmount: 499, badge: 'Best for testing' },
  { id: 'weekly', name: 'Weekly Grinder', tokens: 250, unitAmount: 1499, badge: 'Most popular' },
  { id: 'season', name: 'Season Bank', tokens: 1000, unitAmount: 3999, badge: 'Best value' }
];

function packById(id) {
  return TOKEN_PACKS.find(pack => pack.id === id);
}

function stripeClient() {
  const key = STRIPE_SECRET_KEY.value();
  if (!key) throw new HttpError(503, 'Billing is not configured yet');
  return new Stripe(key);
}

function publicPack(pack) {
  return {
    id: pack.id,
    name: pack.name,
    tokens: pack.tokens,
    unitAmount: pack.unitAmount,
    currency: 'usd',
    displayPrice: `$${(pack.unitAmount / 100).toFixed(2)}`,
    badge: pack.badge
  };
}

function billingRef(uid) {
  return db().doc(`users/${uid}/billing/account`);
}

function todayUsageRef(uid, day = utcDayKey()) {
  return db().doc(`users/${uid}/usage/${day}`);
}

function requestOrigin(req) {
  const fallback = 'https://fantasy-football-45628.web.app';
  const raw = String(req.get('origin') || req.get('referer') || fallback);
  try {
    return new URL(raw).origin;
  } catch (_) {
    return fallback;
  }
}

async function accountSummary(uid, email = '') {
  const [billingSnap, usageSnap, purchasesSnap] = await Promise.all([
    billingRef(uid).get(),
    todayUsageRef(uid).get(),
    db().collection(`users/${uid}/billingLedger`).orderBy('createdAt', 'desc').limit(8).get().catch(() => null)
  ]);
  const billing = billingSnap.exists ? billingSnap.data() || {} : {};
  const usage = usageSnap.exists ? usageSnap.data() || {} : {};
  const freeUsed = Number(usage.freeAiTokensUsed || 0);
  const paidUsed = Number(usage.paidAiTokensUsed || 0);
  return {
    plan: billing.plan || 'Free + token packs',
    email,
    tokenBalance: Number(billing.tokenBalance || 0),
    lifetimePurchased: Number(billing.lifetimePurchased || 0),
    lifetimeSpent: Number(billing.lifetimeSpent || 0),
    freeDailyAllowance: Math.max(0, FREE_DAILY_AI_TOKENS),
    freeUsedToday: freeUsed,
    freeRemainingToday: Math.max(0, FREE_DAILY_AI_TOKENS - freeUsed),
    paidUsedToday: paidUsed,
    usageDay: utcDayKey(),
    packs: TOKEN_PACKS.map(publicPack),
    recentPurchases: purchasesSnap ? purchasesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : []
  };
}

const accountProfile = onRequest({ timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = await requireAuthenticatedUser(req);
    return res.status(200).json(await accountSummary(user.uid, user.email || ''));
  } catch (error) {
    const handled = sendHttpError(res, error);
    if (handled) return handled;
    console.error('accountProfile failure', error);
    return res.status(500).json({ error: 'Account profile temporarily unavailable' });
  }
});

const billingCheckout = onRequest({ secrets: [STRIPE_SECRET_KEY], timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = await requireAuthenticatedUser(req);
    const pack = packById(String(req.body?.packId || ''));
    if (!pack) return res.status(400).json({ error: 'Unknown token pack' });
    const origin = requestOrigin(req);
    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email || undefined,
      client_reference_id: user.uid,
      success_url: `${origin}/?billing=success&pack=${encodeURIComponent(pack.id)}`,
      cancel_url: `${origin}/?billing=cancelled`,
      metadata: { uid: user.uid, packId: pack.id, tokens: String(pack.tokens) },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pack.unitAmount,
          product_data: {
            name: `${pack.name} - ${pack.tokens} AI tokens`,
            tax_code: STRIPE_PRODUCT_TAX_CODE,
            metadata: { packId: pack.id, tokens: String(pack.tokens) }
          }
        }
      }]
    });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    const handled = sendHttpError(res, error);
    if (handled) return handled;
    if (error?.type === 'StripeInvalidRequestError') {
      console.warn('billingCheckout Stripe request rejected', error?.message || error);
      return res.status(400).json({ error: error.message || 'Checkout request was rejected by Stripe' });
    }
    console.error('billingCheckout failure', error);
    return res.status(500).json({ error: 'Checkout could not be started' });
  }
});

const stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const signature = req.get('stripe-signature');
  const secret = STRIPE_WEBHOOK_SECRET.value();
  if (!signature || !secret) return res.status(400).send('Webhook signature is not configured');
  if (!req.rawBody) return res.status(400).send('Raw webhook body is unavailable');
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(req.rawBody, signature, secret);
  } catch (error) {
    console.warn('Stripe webhook signature verification failed', error?.message || error);
    return res.status(400).send('Invalid Stripe signature');
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        const uid = String(session.metadata?.uid || session.client_reference_id || '');
        const pack = packById(String(session.metadata?.packId || ''));
        if (uid && pack) {
          const eventRef = db().doc(`users/${uid}/billingEvents/${session.id}`);
          const accountRef = billingRef(uid);
          const ledgerRef = db().doc(`users/${uid}/billingLedger/${session.id}`);
          await db().runTransaction(async tx => {
            const existing = await tx.get(eventRef);
            if (existing.exists) return;
            const accountSnap = await tx.get(accountRef);
            const account = accountSnap.exists ? accountSnap.data() || {} : {};
            tx.set(eventRef, { eventId: event.id, sessionId: session.id, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            tx.set(accountRef, {
              plan: 'Free + token packs',
              tokenBalance: Number(account.tokenBalance || 0) + pack.tokens,
              lifetimePurchased: Number(account.lifetimePurchased || 0) + pack.tokens,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            tx.set(ledgerRef, {
              type: 'purchase',
              packId: pack.id,
              packName: pack.name,
              tokens: pack.tokens,
              amount: pack.unitAmount,
              currency: 'usd',
              stripeSessionId: session.id,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          });
        }
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('stripeWebhook failure', error);
    return res.status(500).send('Webhook handling failed');
  }
});

module.exports = {
  TOKEN_PACKS,
  accountProfile,
  billingCheckout,
  stripeWebhook
};
