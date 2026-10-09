const test = require('node:test');
const assert = require('node:assert/strict');
const likes = require('./likes');

function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const writes = [];
  return {
    store,
    writes,
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async get() {
              const data = store.get(key);
              return { exists: data !== undefined, data: () => data };
            },
            async set(data) {
              writes.push(key);
              store.set(key, data);
            },
          };
        },
      };
    },
  };
}

function rcResponse(entitlement) {
  return async () => ({
    ok: true,
    json: async () => ({ subscriber: { entitlements: entitlement ? { datetoday_pro: entitlement } : {} } }),
  });
}

const NOW = Date.parse('2026-10-07T18:00:00Z');

test('entitlementState: active, expired, grace period, lifetime', () => {
  assert.equal(likes.entitlementState(null, NOW).plus, false);
  assert.equal(likes.entitlementState({ expires_date: '2026-11-01T00:00:00Z' }, NOW).plus, true);
  assert.equal(likes.entitlementState({ expires_date: '2026-10-01T00:00:00Z' }, NOW).plus, false);
  assert.equal(
    likes.entitlementState(
      { expires_date: '2026-10-01T00:00:00Z', grace_period_expires_date: '2026-10-10T00:00:00Z' },
      NOW,
    ).plus,
    true,
  );
  const lifetime = likes.entitlementState({ expires_date: null }, NOW);
  assert.equal(lifetime.plus, true);
  assert.equal(lifetime.expiresAt, null);
});

test('isPlusUser asks RevenueCat and caches the answer', async () => {
  const db = fakeDb();
  let calls = 0;
  const fetchImpl = async (...args) => {
    calls += 1;
    return rcResponse({ expires_date: '2026-11-01T00:00:00Z', product_identifier: 'monthly' })(...args);
  };
  assert.equal(await likes.isPlusUser(db, 'u1', { now: NOW, fetchImpl, apiKey: 'k' }), true);
  assert.equal(db.store.get('entitlements/u1').productId, 'monthly');
  assert.equal(await likes.isPlusUser(db, 'u1', { now: NOW + 60_000, fetchImpl, apiKey: 'k' }), true);
  assert.equal(calls, 1);
});

test('isPlusUser re-checks a cached "free" answer after a minute or on fresh', async () => {
  const db = fakeDb({ 'entitlements/u1': { plus: false, expiresAt: null, checkedAt: NOW } });
  const fetchImpl = rcResponse({ expires_date: '2026-11-01T00:00:00Z' });
  assert.equal(await likes.isPlusUser(db, 'u1', { now: NOW + 1000, fetchImpl, apiKey: 'k' }), false);
  assert.equal(await likes.isPlusUser(db, 'u1', { now: NOW + 10_000, fresh: true, fetchImpl, apiKey: 'k' }), true);
});

test('isPlusUser never trusts a cached subscription past its expiry', async () => {
  const db = fakeDb({
    'entitlements/u1': { plus: true, expiresAt: NOW - 1, checkedAt: NOW - 10_000 },
  });
  const down = async () => ({ ok: false, status: 503 });
  assert.equal(await likes.isPlusUser(db, 'u1', { now: NOW, fetchImpl: down, apiKey: 'k' }), false);
});

test('isPlusUser keeps a valid cached subscription when RevenueCat is down', async () => {
  const db = fakeDb({
    'entitlements/u1': { plus: true, expiresAt: NOW + 86_400_000, checkedAt: NOW - 2 * 3600_000 },
  });
  const down = async () => {
    throw new Error('network');
  };
  assert.equal(await likes.isPlusUser(db, 'u1', { now: NOW, fetchImpl: down, apiKey: 'k' }), true);
});

test('isPlusUser without an API key is free unless already cached', async () => {
  assert.equal(await likes.isPlusUser(fakeDb(), 'u1', { now: NOW, apiKey: '' }), false);
});

const rows = [
  { fromUid: 'a', createdAt: 1, profile: { displayName: 'Ava', mainPhotoUrl: 'not-a-url' } },
  { fromUid: 'b', createdAt: 2, profile: { displayName: 'Bea', mainPhotoUrl: 'not-a-url' } },
  { fromUid: 'c', createdAt: 3, profile: { displayName: 'Cy' } },
];

test('buildLikes: free reveals only the oldest like and locks the rest without identity', async () => {
  const out = await likes.buildLikes(fakeDb(), rows, false);
  assert.equal(out.plus, false);
  assert.equal(out.total, 3);
  assert.deepEqual(out.revealed.map((r) => r.uid), ['a']);
  assert.equal(out.locked.length, 2);
  const lockedJson = JSON.stringify(out.locked);
  for (const secret of ['"b"', '"c"', 'Bea', 'Cy']) assert.equal(lockedJson.includes(secret), false);
});

test('buildLikes: DateToday+ reveals everyone', async () => {
  const out = await likes.buildLikes(fakeDb(), rows, true);
  assert.deepEqual(out.revealed.map((r) => r.uid), ['a', 'b', 'c']);
  assert.equal(out.locked.length, 0);
});

test('buildLikes: Priority Likes are always revealed, ranked first, and carry their note', async () => {
  const withPriority = [
    ...rows,
    { fromUid: 'p', createdAt: 9, priority: true, priorityAt: 9, note: 'Drinks tonight?', profile: { displayName: 'Pia' } },
  ];
  const { rankLikes } = require('./priorityLikes');
  const out = await likes.buildLikes(fakeDb(), rankLikes(withPriority), false);
  assert.equal(out.total, 4);
  assert.deepEqual(out.revealed.map((r) => r.uid), ['p', 'a']);
  assert.equal(out.revealed[0].priority, true);
  assert.equal(out.revealed[0].note, 'Drinks tonight?');
  assert.equal(out.revealed[1].priority, false);
  assert.equal(out.revealed[1].note, null);
  assert.equal(out.locked.length, 2);
});

test('localDayStart: midnight in the caller\'s timezone', () => {
  // 18:00Z on Oct 7 is 14:00 in New York (UTC-4, offset +240).
  assert.equal(new Date(likes.localDayStart(NOW, 240)).toISOString(), '2026-10-07T04:00:00.000Z');
  assert.equal(new Date(likes.localDayStart(NOW, 0)).toISOString(), '2026-10-07T00:00:00.000Z');
  // Tokyo (UTC+9, offset -540): already Oct 8 locally.
  assert.equal(new Date(likes.localDayStart(NOW, -540)).toISOString(), '2026-10-07T15:00:00.000Z');
});
