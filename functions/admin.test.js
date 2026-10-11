const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('./admin');

test('ageFrom handles birthdays and junk', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  assert.equal(admin.ageFrom('1995-10-11', now), 31);
  assert.equal(admin.ageFrom('1995-10-12', now), 30);
  assert.equal(admin.ageFrom('nope', now), null);
  assert.equal(admin.ageFrom(undefined, now), null);
});

test('isLive matches discovery: active, not ended, not expired', () => {
  const now = Date.parse('2026-10-11T20:00:00Z');
  const later = '2026-10-11T23:00:00.000Z';
  assert.equal(admin.isLive({ status: 'active', expiresAt: later }, now), true);
  assert.equal(admin.isLive({ status: 'active', expiresAt: '2026-10-11T19:00:00.000Z' }, now), false);
  assert.equal(admin.isLive({ status: 'active', expiresAt: later, endedAt: '2026-10-11T19:30:00Z' }, now), false);
  assert.equal(admin.isLive({ status: 'ended', expiresAt: later }, now), false);
  assert.equal(admin.isLive(null, now), false);
});

test('every action is owner-only', async () => {
  const endpoint = admin.createAdminEndpoint({ pushToUser: async () => {}, purgeAccount: async () => {}, promoBroadcast: async () => ({}) });
  for (const decoded of [null, { uid: 'u1' }, { uid: 'u1', admin: 'true' }]) {
    await assert.rejects(endpoint({ body: { action: 'overview' } }, { decoded }), (e) => e.status === 403);
  }
  await assert.rejects(endpoint({ body: { action: 'toString' } }, { decoded: { uid: 'u1', admin: true } }), (e) => e.status === 400);
});

test('owner cannot ban, sign out or delete their own account', async () => {
  const endpoint = admin.createAdminEndpoint({ pushToUser: async () => {}, purgeAccount: async () => {}, promoBroadcast: async () => ({}) });
  const ctx = { decoded: { uid: 'OwnerUid1234567890', admin: true }, db: {}, auth: { getUser: async () => ({}) } };
  for (const action of ['ban', 'signOut', 'deleteUser', 'endLive', 'setVerification']) {
    await assert.rejects(endpoint({ body: { action, uid: 'OwnerUid1234567890' } }, ctx), (e) => e.status === 400, action);
  }
});

test('admins cannot act on other admins', async () => {
  const endpoint = admin.createAdminEndpoint({ pushToUser: async () => {}, purgeAccount: async () => {}, promoBroadcast: async () => ({}) });
  const ctx = {
    decoded: { uid: 'OwnerUid1234567890', admin: true },
    db: {},
    auth: { getUser: async () => ({ uid: 'OtherAdmin12345678', customClaims: { admin: true } }) },
  };
  await assert.rejects(endpoint({ body: { action: 'ban', uid: 'OtherAdmin12345678' } }, ctx), (e) => e.status === 403);
});
