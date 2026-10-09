'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Stripe = require('stripe');
const billing = require('./stripeBilling');

const NOW = Date.UTC(2026, 9, 8);
const DAY = 86400000;

test('flag: off by default, test mode is tester-only, iOS never by default', () => {
  const flag = billing.normalizeFlag(null);
  assert.deepStrictEqual(billing.eligibility(flag, { uid: 'a', platform: 'android' }), { available: false, reason: 'test_mode' });

  const testing = billing.normalizeFlag({ enabled: true, testerUids: ['tester'] });
  assert.strictEqual(billing.eligibility(testing, { uid: 'someone', platform: 'android' }).available, false);
  assert.deepStrictEqual(billing.eligibility(testing, { uid: 'tester', platform: 'android' }), { available: true, live: false, tester: true });
  assert.strictEqual(billing.eligibility(testing, { uid: 'tester', platform: 'ios' }).reason, 'platform');

  const live = billing.normalizeFlag({ enabled: true, liveMode: true, countries: ['us'] });
  assert.strictEqual(billing.eligibility(live, { uid: 'x', platform: 'android', country: 'US' }).available, true);
  assert.strictEqual(billing.eligibility(live, { uid: 'x', platform: 'android', country: 'DE' }).reason, 'country');
  assert.strictEqual(billing.eligibility(live, { uid: 'x', platform: 'ios', country: 'US' }).reason, 'platform');
  const liveOff = billing.normalizeFlag({ enabled: false, liveMode: true });
  assert.strictEqual(billing.eligibility(liveOff, { uid: 'x', platform: 'android' }).reason, 'disabled');
});

test('never builds a live client from a test key or the other way round', () => {
  const prev = { test: process.env.STRIPE_SECRET_KEY, live: process.env.STRIPE_LIVE_SECRET_KEY };
  process.env.STRIPE_SECRET_KEY = 'sk_live_wrongslot';
  process.env.STRIPE_LIVE_SECRET_KEY = 'sk_test_wrongslot';
  assert.strictEqual(billing.stripeFor(false), null);
  assert.strictEqual(billing.stripeFor(true), null);
  process.env.STRIPE_SECRET_KEY = 'sk_test_ok';
  assert.ok(billing.stripeFor(false));
  process.env.STRIPE_SECRET_KEY = prev.test || '';
  process.env.STRIPE_LIVE_SECRET_KEY = prev.live || '';
});

test('prices come from Stripe lookup keys', () => {
  const plan = billing.planFromPrice({
    id: 'price_1',
    lookup_key: 'datetoday_plus_weekly',
    unit_amount: 999,
    currency: 'usd',
    recurring: { interval: 'week', interval_count: 1 },
  });
  assert.strictEqual(plan.id, 'weekly');
  assert.strictEqual(plan.priceLabel, '$9.99');
  assert.strictEqual(billing.planFromPrice({ id: 'p', lookup_key: 'other', unit_amount: 1, currency: 'usd', recurring: {} }), null);
});

function sub(status, periodEndMs, extra = {}) {
  return {
    id: extra.id || 'sub_1',
    status,
    customer: 'cus_1',
    livemode: false,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: Math.floor(periodEndMs / 1000), price: { id: 'price_m', lookup_key: 'datetoday_plus_monthly', recurring: { interval: 'month' } } }] },
    ...extra,
  };
}

test('subscription states map onto DateToday+', () => {
  const entry = (s) => ({ [s.id]: billing.subscriptionEntry(s, NOW) });
  const active = billing.summarize(entry(sub('active', NOW + 20 * DAY)), NOW);
  assert.deepStrictEqual(
    { plus: active.plus, status: active.status, plan: active.plan, willRenew: active.willRenew },
    { plus: true, status: 'active', plan: 'monthly', willRenew: true },
  );
  assert.strictEqual(active.expiresAt, Math.floor((NOW + 20 * DAY) / 1000) * 1000);

  const canceling = billing.summarize(entry(sub('active', NOW + DAY, { cancel_at_period_end: true })), NOW);
  assert.strictEqual(canceling.plus, true);
  assert.strictEqual(canceling.willRenew, false);

  const pastDue = billing.summarize(entry(sub('past_due', NOW + DAY)), NOW);
  assert.strictEqual(pastDue.plus, true);
  assert.strictEqual(pastDue.billingIssue, true);

  for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
    assert.strictEqual(billing.summarize(entry(sub(status, NOW + DAY)), NOW).plus, false, status);
  }
  assert.strictEqual(billing.summarize(entry(sub('canceled', NOW - DAY)), NOW).status, 'canceled');

  // A missed renewal webhook can't keep Plus on forever.
  assert.strictEqual(billing.summarize(entry(sub('active', NOW - 3 * DAY)), NOW).plus, false);
  assert.strictEqual(billing.summarize(entry(sub('active', NOW - DAY)), NOW).plus, true);
});

test('older API shape (period end on the subscription) still works', () => {
  const s = sub('active', 0);
  s.items.data[0].current_period_end = undefined;
  s.current_period_end = Math.floor((NOW + 5 * DAY) / 1000);
  assert.strictEqual(billing.subscriptionEntry(s, NOW).currentPeriodEnd, s.current_period_end * 1000);
});

test('two subscriptions: any active one keeps Plus', () => {
  const subs = {
    sub_old: billing.subscriptionEntry(sub('canceled', NOW - 10 * DAY, { id: 'sub_old' }), NOW - DAY),
    sub_new: billing.subscriptionEntry(sub('active', NOW + 7 * DAY, { id: 'sub_new' }), NOW - 2 * DAY),
  };
  assert.strictEqual(billing.webPlusFromDoc({ subscriptions: subs }, NOW), true);
  assert.strictEqual(billing.webPlusFromDoc(null, NOW), false);
});

test('finds the subscription on every handled event shape', () => {
  assert.strictEqual(billing.subscriptionIdOf({ type: 'customer.subscription.updated', data: { object: { id: 'sub_a' } } }), 'sub_a');
  assert.strictEqual(billing.subscriptionIdOf({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_b' } } }), 'sub_b');
  assert.strictEqual(billing.subscriptionIdOf({ type: 'checkout.session.completed', data: { object: { mode: 'payment' } } }), null);
  assert.strictEqual(billing.subscriptionIdOf({ type: 'invoice.paid', data: { object: { subscription: 'sub_c' } } }), 'sub_c');
  assert.strictEqual(
    billing.subscriptionIdOf({ type: 'invoice.payment_failed', data: { object: { parent: { subscription_details: { subscription: 'sub_d' } } } } }),
    'sub_d',
  );
});

function fakeDb() {
  const docs = new Map();
  const ref = (path) => ({
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path), get: (k) => (docs.get(path) || {})[k] }),
    set: async (v) => docs.set(path, v),
  });
  return { docs, collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }) };
}

function fakeRes() {
  return {
    code: 200,
    body: null,
    status(c) {
      this.code = c;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

test('webhook: rejects bad signatures, ignores unrelated events, dedupes replays', async () => {
  const secret = 'whsec_unit_test_secret';
  const prev = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  const db = fakeDb();

  const forged = fakeRes();
  await billing.stripeWebhook({ rawBody: Buffer.from('{}'), headers: { 'stripe-signature': 't=1,v1=bad' } }, forged, { db });
  assert.strictEqual(forged.code, 400);

  const payload = JSON.stringify({ id: 'evt_1', type: 'customer.created', livemode: false, data: { object: {} } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const ignored = fakeRes();
  await billing.stripeWebhook({ rawBody: Buffer.from(payload), headers: { 'stripe-signature': header } }, ignored, { db });
  assert.deepStrictEqual(ignored.body, { received: true, ignored: true });

  db.docs.set('processedEvents/stripe_evt_2', { type: 'invoice.paid' });
  const replay = JSON.stringify({ id: 'evt_2', type: 'invoice.paid', livemode: false, data: { object: { subscription: 'sub_x' } } });
  const dup = fakeRes();
  await billing.stripeWebhook(
    { rawBody: Buffer.from(replay), headers: { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: replay, secret }) } },
    dup,
    { db },
  );
  assert.deepStrictEqual(dup.body, { received: true, duplicate: true });
  process.env.STRIPE_WEBHOOK_SECRET = prev || '';
});
