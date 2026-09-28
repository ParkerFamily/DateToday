const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let database;
Module._load = function (name, parent, main) {
  if (name === 'firebase-admin/auth') return { getAuth: () => ({
    verifyIdToken: async token => {
      if (token !== 'valid') throw Object.assign(new Error('Invalid token'), { code: 'auth/invalid-id-token' });
      return { uid: 'viewer' };
    },
  }) };
  if (name === 'firebase-admin/firestore') return { getFirestore: () => database };
  return originalLoad.call(this, name, parent, main);
};
const { nearbyLive } = require('./nearbyLive');
Module._load = originalLoad;

function fixture({ blocked = false, far = false, incompatible = false, inactive = false, hidden = false } = {}) {
  const now = Date.now();
  const profile = (gender, interestedIn) => ({
    onboardingComplete: true,
    profileCompletion: { communityStandards: true },
    dateOfBirth: '1990-01-01',
    gender, interestedIn,
    displayName: 'Person',
    mainPhotoUrl: 'https://example.com/photo',
  });
  const beacon = (latitude, status = 'active') => ({
    status, startedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    radiusMiles: 10, latitude, longitude: -73, activities: ['coffee'],
  });
  const sessions = { viewer: beacon(40), near: beacon(far ? 41 : 40.01, inactive ? 'ended' : 'active') };
  const users = { viewer: profile('man', 'women'), near: profile('woman', incompatible ? 'women' : 'men') };
  const snapshot = value => ({ data: () => value });
  const docs = values => Object.entries(values).map(([id, value]) => ({ id, data: () => value }));
  database = {
    collection: name => ({
      doc: id => ({ get: async () => snapshot(
        name === 'users' ? users[id] : name === 'hiddenUsers'
          ? { uids: hidden ? ['near'] : [] } : sessions[id],
      ), name, id }),
      where: (key, _, value) => ({
        get: async () => name === 'liveSessions'
          ? { docs: docs(sessions).filter(doc => doc.data().status === value), get size() { return this.docs.length; } }
          : { docs: blocked ? docs({ block: { blockerId: 'viewer', blockedId: 'near' } }) : [] },
        limit: () => ({ get: async () => {
          const result = docs(sessions).filter(doc => doc.data().status === value);
          return { docs: result, size: result.length };
        } }),
      }),
    }),
    getAll: async (...refs) => refs.map(ref => snapshot(users[ref.id])),
  };
}

async function request(token = 'valid') {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    set() { return this; },
    json(body) { this.body = body; return this; },
  };
  await nearbyLive({ method: 'GET', headers: { authorization: `Bearer ${token}` } }, res);
  return res;
}

test('returns only filtered cards without coordinates', async () => {
  fixture();
  const res = await request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.candidates.length, 1);
  assert.equal(res.body.candidates[0].uid, 'near');
  assert.equal(JSON.stringify(res.body).includes('latitude'), false);
  assert.equal(JSON.stringify(res.body).includes('longitude'), false);
});

for (const [name, options] of Object.entries({
  blocked: { blocked: true }, hidden: { hidden: true }, distant: { far: true },
  incompatible: { incompatible: true }, inactive: { inactive: true },
})) {
  test(`excludes ${name} members`, async () => {
    fixture(options);
    assert.deepEqual((await request()).body.candidates, []);
  });
}

test('rejects invalid authentication', async () => {
  fixture();
  assert.equal((await request('invalid')).statusCode, 401);
});