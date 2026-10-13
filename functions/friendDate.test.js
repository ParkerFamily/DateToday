'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const friendDate = require('./friendDate');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const config = friendDate.friendDateConfig({ freeSessionsPerWeek: 2 });

function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const ref = (path) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data) => docs.set(path, data),
    delete: async () => docs.delete(path),
  });
  return {
    docs,
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }),
    runTransaction: async (fn) =>
      fn({ get: (r) => r.get(), set: (r, data) => docs.set(r.path, data) }),
  };
}

const call = (db, uid, action, plus = false) =>
  friendDate.createFriendDateEndpoint({ hasPlus: async () => plus })({ body: { action } }, { db, decoded: { uid } });

test('config falls back to safe defaults', () => {
  assert.deepEqual(friendDate.friendDateConfig(null), friendDate.DEFAULT_CONFIG);
  assert.equal(friendDate.friendDateConfig({ freeSessionsPerWeek: -4 }).freeSessionsPerWeek, 0);
  assert.equal(friendDate.friendDateConfig({ enabled: false }).enabled, false);
});

test('free members get the configured sessions per rolling week; a live pass is reused', () => {
  const now = 10 * DAY;
  const first = friendDate.planStart({ config, usage: null, pass: null, plus: false, now });
  assert.deepEqual([first.allowed, first.count], [true, true]);
  const reuse = friendDate.planStart({ config, usage: { starts: [now] }, pass: { until: now + HOUR }, plus: false, now });
  assert.deepEqual([reuse.allowed, reuse.count], [true, false]);
  const full = friendDate.planStart({ config, usage: { starts: [now - DAY, now - 2 * DAY] }, pass: null, plus: false, now });
  assert.equal(full.allowed, false);
  const aged = friendDate.planStart({ config, usage: { starts: [now - 8 * DAY, now - DAY] }, pass: null, plus: false, now });
  assert.deepEqual([aged.allowed, aged.count], [true, true]);
  const plus = friendDate.planStart({ config, usage: { starts: [now - DAY, now - 2 * DAY] }, pass: null, plus: true, now });
  assert.deepEqual([plus.allowed, plus.count], [true, false]);
});

test('summary: left, unlimited for DateToday+, reset time when out', () => {
  const now = 10 * DAY;
  const out = friendDate.usageSummary(config, { starts: [now - 3 * DAY, now - DAY] }, { plus: false, now });
  assert.equal(out.left, 0);
  assert.equal(out.resetsAt, new Date(now + 4 * DAY).toISOString());
  const plus = friendDate.usageSummary(config, { starts: [now - DAY] }, { plus: true, now });
  assert.equal(plus.left, null);
  assert.equal(plus.limit, null);
});

test('endpoint counts a session once, then walls free members with friend_date_limit', async () => {
  const db = fakeDb({ 'appConfig/friendDate': { freeSessionsPerWeek: 1 } });
  const first = await call(db, 'u1', 'start');
  assert.equal(first.counted, true);
  assert.equal(first.left, 0);
  assert.ok(db.docs.get('friendDatePasses/u1').until);
  // Same night: the pass is still valid, so going Live again is free.
  assert.equal((await call(db, 'u1', 'start')).counted, false);
  db.docs.delete('friendDatePasses/u1');
  await assert.rejects(call(db, 'u1', 'start'), (e) => e.code === 'friend_date_limit' && e.status === 403);
  const plus = await call(db, 'u1', 'start', true);
  assert.equal(plus.left, null);
  assert.equal(plus.counted, false);
});

test('Dating and Friend Date hearts only reach the right people', () => {
  const now = Date.now();
  const live = (mode) => ({ status: 'active', mode, expiresAt: new Date(now + HOUR).toISOString() });
  const allowed = (mode, o) => friendDate.heartAllowed(mode, { now, theyLikedMe: false, ...o }).ok;
  assert.equal(allowed('friend', { theirLive: live('friend') }), true);
  assert.equal(allowed('friend', { theirLive: live('dating') }), false);
  assert.equal(allowed('friend', { theirLive: live('dating'), theirNearby: { friendDate: true } }), false);
  assert.equal(allowed('friend', { theirNearby: { friendDate: true } }), true);
  assert.equal(allowed('friend', { theirNearby: {} }), false);
  assert.equal(allowed('dating', { theirLive: live('friend') }), false);
  assert.equal(allowed('dating', { theirLive: live() }), true);
  assert.equal(allowed('dating', { theirNearby: {} }), true);
  // An ended Friend Date session doesn't wall off Dating.
  assert.equal(allowed('dating', { theirLive: { ...live('friend'), status: 'ended' } }), true);
  // Liking back is always allowed.
  assert.equal(friendDate.heartAllowed('dating', { now, theirLive: live('friend'), theyLikedMe: true }).ok, true);
});

test('a match is Friend Date if either heart was, never upgraded to Dating', () => {
  assert.equal(friendDate.matchMode('dating', { mode: 'friend' }), 'friend');
  assert.equal(friendDate.matchMode('friend', {}), 'friend');
  assert.equal(friendDate.matchMode('dating', {}, null), 'dating');
});
