'use strict';

/**
 * DateToday+ through DateToday's web checkout (Stripe). It is one more way to unlock the same
 * DateToday+ entitlement RevenueCat already grants — not a second premium tier.
 *
 * Who can see it is decided here (appConfig/webCheckout) and on the client (platform + build).
 * Test mode is tester-only, and live payments need both liveMode in the flag and a live key.
 */
const crypto = require('crypto');
const Stripe = require('stripe');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const SITE = (process.env.WEB_CHECKOUT_SITE || 'https://parkerfamily.github.io/DateToday').replace(/\/+$/, '');
const TICKET_TTL_MS = 15 * 60 * 1000;
const PLAN_LOOKUP_KEYS = { weekly: 'datetoday_plus_weekly', monthly: 'datetoday_plus_monthly' };
const PLUS_STATUSES = new Set(['active', 'trialing', 'past_due']);
/** A renewal's webhook can land a little after the period boundary. */
const RENEWAL_GRACE_MS = 2 * 24 * 60 * 60 * 1000;
const PRICE_CACHE_MS = 10 * 60 * 1000;
const DEFAULT_FLAG = Object.freeze({
  enabled: false,
  liveMode: false,
  platforms: ['android', 'web'],
  countries: null,
  testerUids: [],
});
const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
]);

const httpError = (status, message) => Object.assign(new Error(message), { status });
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : null);

function normalizeFlag(data) {
  const d = data || {};
  const countries = strings(d.countries);
  return {
    enabled: d.enabled === true,
    liveMode: d.liveMode === true,
    platforms: strings(d.platforms) || DEFAULT_FLAG.platforms,
    countries: countries && countries.length ? countries.map((c) => c.toUpperCase()) : null,
    testerUids: strings(d.testerUids) || [],
  };
}

async function loadFlag(db) {
  const snap = await db.collection('appConfig').doc('webCheckout').get().catch(() => null);
  return normalizeFlag(snap && snap.exists ? snap.data() : null);
}

/**
 * Testers always pass (closed testing). Everyone else needs live mode, the master switch,
 * an allowed platform and, when countries are listed, an allowed country.
 */
function eligibility(flag, { uid, platform, country }) {
  if (!flag.platforms.includes(platform)) return { available: false, reason: 'platform' };
  const tester = Boolean(uid) && flag.testerUids.includes(uid);
  if (tester) return { available: true, live: flag.liveMode, tester: true };
  if (!flag.liveMode) return { available: false, reason: 'test_mode' };
  if (!flag.enabled) return { available: false, reason: 'disabled' };
  const cc = String(country || '').toUpperCase();
  if (flag.countries && !flag.countries.includes(cc)) return { available: false, reason: 'country' };
  return { available: true, live: true, tester: false };
}

const clients = new Map();
/** Never hands out a live client unless asked for live, and never a test client for live. */
function stripeFor(live) {
  const key = String((live ? process.env.STRIPE_LIVE_SECRET_KEY : process.env.STRIPE_SECRET_KEY) || '').trim();
  const ok = live ? /^(sk|rk)_live_/.test(key) : /^(sk|rk)_test_/.test(key);
  if (!ok) return null;
  if (!clients.has(key)) clients.set(key, new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 }));
  return clients.get(key);
}

function priceLabel(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function planFromPrice(price) {
  const id = Object.keys(PLAN_LOOKUP_KEYS).find((k) => PLAN_LOOKUP_KEYS[k] === price.lookup_key);
  if (!id || !price.recurring || typeof price.unit_amount !== 'number') return null;
  return {
    id,
    priceId: price.id,
    amount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring.interval,
    intervalCount: price.recurring.interval_count || 1,
    priceLabel: priceLabel(price.unit_amount, price.currency),
    periodLabel: price.recurring.interval,
  };
}

const priceCache = new Map();
/** Prices live in Stripe (lookup keys datetoday_plus_weekly / _monthly); nothing is hardcoded here. */
async function loadPlans(stripe, live) {
  const cached = priceCache.get(live);
  if (cached && Date.now() - cached.at < PRICE_CACHE_MS) return cached.plans;
  const list = await stripe.prices.list({ lookup_keys: Object.values(PLAN_LOOKUP_KEYS), active: true, limit: 10 });
  const plans = list.data
    .map(planFromPrice)
    .filter(Boolean)
    .sort((a, b) => (a.id === 'weekly' ? -1 : 1) - (b.id === 'weekly' ? -1 : 1));
  priceCache.set(live, { at: Date.now(), plans });
  return plans;
}

const publicPlan = ({ id, amount, currency, interval, intervalCount, priceLabel: label, periodLabel }) => ({
  id,
  amount,
  currency,
  interval,
  intervalCount,
  priceLabel: label,
  periodLabel,
});

function periodEndMs(sub) {
  const fromItems = ((sub.items && sub.items.data) || [])
    .map((item) => Number(item.current_period_end) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const seconds = Number(sub.current_period_end) || fromItems;
  return seconds ? seconds * 1000 : null;
}

function planOfSubscription(sub) {
  const price = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price;
  if (!price) return { plan: null, priceId: null };
  const id = Object.keys(PLAN_LOOKUP_KEYS).find((k) => PLAN_LOOKUP_KEYS[k] === price.lookup_key);
  const byInterval = price.recurring && price.recurring.interval === 'week' ? 'weekly' : 'monthly';
  return { plan: id || byInterval, priceId: price.id };
}

function subscriptionEntry(sub, now = Date.now()) {
  const { plan, priceId } = planOfSubscription(sub);
  return {
    status: String(sub.status || 'incomplete'),
    plan,
    priceId,
    customerId: typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null,
    currentPeriodEnd: periodEndMs(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    livemode: Boolean(sub.livemode),
    updatedAt: now,
  };
}

const entryActive = (e, now) =>
  Boolean(e) && PLUS_STATUSES.has(e.status) && (e.currentPeriodEnd == null || e.currentPeriodEnd + RENEWAL_GRACE_MS > now);

/** One summary across every Stripe subscription the member has; the best one wins. */
function summarize(subscriptions, now = Date.now()) {
  const entries = Object.values(subscriptions || {});
  const active = entries.filter((e) => entryActive(e, now)).sort((a, b) => (b.currentPeriodEnd || 0) - (a.currentPeriodEnd || 0));
  const best = active[0] || entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
  if (!best) return { plus: false, status: 'inactive', plan: null, expiresAt: null, willRenew: false, billingIssue: false, livemode: false };
  const plus = active.length > 0;
  return {
    plus,
    status: plus ? best.status : best.status === 'canceled' ? 'canceled' : 'inactive',
    plan: best.plan || null,
    expiresAt: best.currentPeriodEnd || null,
    willRenew: plus && !best.cancelAtPeriodEnd,
    billingIssue: best.status === 'past_due' || best.status === 'unpaid',
    livemode: Boolean(best.livemode),
  };
}

/** Server-side check of the webSubscriptions/{uid} doc, re-checking expiry in case a webhook was missed. */
function webPlusFromDoc(data, now = Date.now()) {
  if (!data || !data.subscriptions) return false;
  return summarize(data.subscriptions, now).plus;
}

async function hasWebPlus(db, uid, now = Date.now()) {
  const snap = await db.collection('webSubscriptions').doc(uid).get().catch(() => null);
  return webPlusFromDoc(snap && snap.exists ? snap.data() : null, now);
}

const platformOf = (value) => (['android', 'web', 'ios'].includes(value) ? value : 'web');
const countryOf = (value) => (/^[A-Za-z]{2}$/.test(String(value || '')) ? String(value).toUpperCase() : null);

/** Signed-in app: is checkout offered to me, and at what prices? */
async function checkoutStatus(req, { db, decoded }) {
  const body = req.body || {};
  const flag = await loadFlag(db);
  const gate = eligibility(flag, { uid: decoded.uid, platform: platformOf(body.platform), country: countryOf(body.country) });
  if (!gate.available) return { available: false, plans: [] };
  const stripe = stripeFor(gate.live);
  if (!stripe) return { available: false, plans: [] };
  const plans = await loadPlans(stripe, gate.live).catch((error) => {
    console.error('Stripe prices failed', error && error.message);
    return [];
  });
  return { available: plans.length > 0, plans: plans.map(publicPlan), testMode: !gate.live };
}

/** Signed-in app: mint a short-lived, single-account ticket. The page never sees a raw uid. */
async function createCheckoutLink(req, { db, decoded }) {
  const body = req.body || {};
  const platform = platformOf(body.platform);
  const country = countryOf(body.country);
  const gate = eligibility(await loadFlag(db), { uid: decoded.uid, platform, country });
  if (!gate.available) throw httpError(403, 'Upgrading here isn’t available right now.');
  const ticket = crypto.randomBytes(32).toString('base64url');
  await db.collection('webCheckoutTickets').doc(hash(ticket)).set({
    uid: decoded.uid,
    platform,
    country,
    createdAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + TICKET_TTL_MS),
  });
  const plan = body.plan === 'weekly' ? 'weekly' : 'monthly';
  return { url: `${SITE}/plus/#t=${ticket}&plan=${plan}` };
}

async function ticketOwner(db, ticket) {
  if (typeof ticket !== 'string' || ticket.length < 32 || ticket.length > 100) throw httpError(400, 'This link isn’t valid.');
  const snap = await db.collection('webCheckoutTickets').doc(hash(ticket)).get();
  const data = snap.exists ? snap.data() : null;
  if (!data || !data.expireAt || data.expireAt.toMillis() < Date.now()) {
    throw httpError(410, 'This link expired. Go back to DateToday and tap Upgrade again.');
  }
  return data;
}

function maskEmail(address) {
  const [user, domain] = String(address || '').split('@');
  if (!user || !domain) return null;
  return `${user.slice(0, 1)}${'•'.repeat(Math.min(6, Math.max(2, user.length - 1)))}@${domain}`;
}

async function customerFor(stripe, db, uid, live, emailAddress) {
  const ref = db.collection('stripeCustomers').doc(uid);
  const field = live ? 'liveCustomerId' : 'testCustomerId';
  const snap = await ref.get();
  const existing = snap.exists ? snap.get(field) : null;
  if (existing) return existing;
  const customer = await stripe.customers.create(
    { email: emailAddress || undefined, metadata: { uid } },
    { idempotencyKey: `dt-customer-${live ? 'live' : 'test'}-${uid}` },
  );
  await ref.set({ [field]: customer.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return customer.id;
}

/** Public, ticket-authenticated endpoint used by the checkout page. */
async function webCheckout(req, { db, auth }) {
  const body = req.body || {};
  const owner = await ticketOwner(db, body.ticket);
  const gate = eligibility(await loadFlag(db), { uid: owner.uid, platform: owner.platform, country: owner.country });
  if (!gate.available) throw httpError(403, 'Upgrading here isn’t available right now.');
  const stripe = stripeFor(gate.live);
  if (!stripe) throw httpError(503, 'Checkout isn’t set up yet. Try again later.');
  const user = await auth.getUser(owner.uid).catch(() => null);
  if (!user || user.disabled) throw httpError(403, 'This account can’t upgrade right now.');
  const plans = await loadPlans(stripe, gate.live);
  const alreadyPlus = await hasWebPlus(db, owner.uid);

  if (body.action === 'info') {
    const profile = await db.collection('profiles').doc(owner.uid).get().catch(() => null);
    const name = (profile && profile.exists && profile.get('displayName')) || user.displayName || '';
    return {
      account: { name: String(name).split(/\s+/)[0] || null, email: maskEmail(user.email) },
      plans: plans.map(publicPlan),
      testMode: !gate.live,
      alreadyPlus,
    };
  }

  if (body.action !== 'checkout') throw httpError(400, 'Unknown action.');
  if (alreadyPlus) throw httpError(409, 'You already have DateToday+. Head back to the app to use it.');
  const plan = plans.find((p) => p.id === body.plan);
  if (!plan) throw httpError(400, 'Pick a plan.');
  const customer = await customerFor(stripe, db, owner.uid, gate.live, user.email);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: owner.uid,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    metadata: { uid: owner.uid, plan: plan.id },
    subscription_data: { metadata: { uid: owner.uid, plan: plan.id } },
    allow_promotion_codes: true,
    success_url: `${SITE}/plus/done.html?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/plus/done.html?status=canceled`,
  });
  return { url: session.url };
}

/** Signed-in app: Stripe's hosted page to switch plan, update card or cancel. */
async function billingPortal(req, { db, decoded }) {
  const snap = await db.collection('stripeCustomers').doc(decoded.uid).get();
  const web = await db.collection('webSubscriptions').doc(decoded.uid).get();
  const live = Boolean(web.exists && summarize(web.get('subscriptions') || {}).livemode);
  const customer = snap.exists ? snap.get(live ? 'liveCustomerId' : 'testCustomerId') : null;
  const stripe = stripeFor(live);
  if (!customer || !stripe) throw httpError(404, 'No DateToday+ billing found for this account.');
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${SITE}/plus/done.html?status=manage` });
  return { url: session.url };
}

function subscriptionIdOf(event) {
  const obj = event.data && event.data.object;
  if (!obj) return null;
  if (event.type.startsWith('customer.subscription.')) return obj.id;
  if (event.type === 'checkout.session.completed') return obj.mode === 'subscription' ? obj.subscription : null;
  if (event.type.startsWith('invoice.')) {
    const parent = obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription;
    return obj.subscription || parent || null;
  }
  return null;
}

async function uidForSubscription(stripe, sub, event) {
  if (sub.metadata && sub.metadata.uid) return sub.metadata.uid;
  const obj = event.data.object;
  if (obj && obj.client_reference_id) return obj.client_reference_id;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer && sub.customer.id;
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  return (customer && !customer.deleted && customer.metadata && customer.metadata.uid) || null;
}

async function writeSubscription(db, uid, sub, eventId) {
  const ref = db.collection('webSubscriptions').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const subscriptions = { ...((snap.exists && snap.get('subscriptions')) || {}), [sub.id]: subscriptionEntry(sub) };
    tx.set(ref, {
      provider: 'stripe',
      subscriptions,
      ...summarize(subscriptions),
      lastEventId: eventId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function verifyEvent(rawBody, signature) {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_LIVE_WEBHOOK_SECRET].filter(Boolean);
  for (const secret of secrets) {
    try {
      return Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      /* try the other mode's secret */
    }
  }
  return null;
}

/**
 * Stripe → DateToday+. Signature-verified, deduped by event id, and always re-reads the
 * subscription from Stripe so out-of-order or replayed events can't leave stale state.
 */
async function stripeWebhook(req, res, { db }) {
  const signature = req.headers['stripe-signature'];
  const event = req.rawBody && signature ? verifyEvent(req.rawBody, signature) : null;
  if (!event) {
    res.status(400).send('Bad signature');
    return;
  }
  if (!HANDLED_EVENTS.has(event.type)) {
    res.json({ received: true, ignored: true });
    return;
  }
  const marker = db.collection('processedEvents').doc(`stripe_${event.id}`);
  if ((await marker.get()).exists) {
    res.json({ received: true, duplicate: true });
    return;
  }
  const subscriptionId = subscriptionIdOf(event);
  if (subscriptionId) {
    const stripe = stripeFor(Boolean(event.livemode));
    if (!stripe) throw new Error(`No Stripe ${event.livemode ? 'live' : 'test'} key for webhook ${event.id}`);
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const uid = await uidForSubscription(stripe, sub, event);
    if (uid) await writeSubscription(db, uid, sub, event.id);
    else console.warn('Stripe subscription without a DateToday account', subscriptionId);
  }
  await marker.set({ type: event.type, at: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) });
  res.json({ received: true });
}

/** Account deletion: stop billing right away; Stripe keeps its own payment records. */
async function cancelForDeletedAccount(db, uid) {
  const snap = await db.collection('webSubscriptions').doc(uid).get();
  const subscriptions = (snap.exists && snap.get('subscriptions')) || {};
  for (const [id, entry] of Object.entries(subscriptions)) {
    if (!PLUS_STATUSES.has(entry.status) && entry.status !== 'unpaid' && entry.status !== 'paused') continue;
    const stripe = stripeFor(Boolean(entry.livemode));
    if (stripe) await stripe.subscriptions.cancel(id).catch((e) => console.warn('Stripe cancel failed', id, e && e.message));
  }
  await Promise.all([snap.ref.delete().catch(() => undefined), db.collection('stripeCustomers').doc(uid).delete().catch(() => undefined)]);
}

module.exports = {
  billingPortal,
  cancelForDeletedAccount,
  checkoutStatus,
  createCheckoutLink,
  eligibility,
  hasWebPlus,
  normalizeFlag,
  planFromPrice,
  stripeFor,
  stripeWebhook,
  subscriptionEntry,
  subscriptionIdOf,
  summarize,
  verifyEvent,
  webCheckout,
  webPlusFromDoc,
  SITE,
};
