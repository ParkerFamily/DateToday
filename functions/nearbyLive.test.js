const test = require('node:test');
const assert = require('node:assert/strict');
const {
  activateLive,
  nearbyLive,
  canBrowseProfiles,
  validActivation,
  validActivationInput,
  MAX_SESSION_MS,
  REACTIVATION_COOLDOWN_MS,
} = require('./nearbyLive');

const NOW = Date.parse('2025-01-01T12:00:00.000Z');
const token = { uid: 'viewer', phone_number: '+15550000001' };

function profile(overrides = {}) {
  return {
    onboardingComplete: true,
    dateOfBirth: '2000-01-01',
    communityStandardsAcceptedAt: '2024-01-01T00:00:00.000Z',
    displayName: 'Ari',
    mainPhotoUrl: 'https://example.test/photo.jpg',
    gender: 'woman',
    interestedIn: 'everyone',
    ...overrides,
  };
}

function request(method, body = {}, authorization = 'Bearer test') {
  return { method, body, headers: { authorization } };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}

function fakeDb(seed = {}) {
  const documents = new Map(Object.entries(seed));
  const ref = (collection, id) => ({ collection, id });
  const collection = name => ({
    doc(id) {
      const documentRef = ref(name, id);
      return {
        ...documentRef,
        get: async () => snapshot(documents.get(`${name}/${id}`)),
      };
    },
    where(field, operator, expected) {
      assert.ok(['==', '>'].includes(operator));
      return {
        limit() { return this; },
        get: async () => {
          const rows = [...documents.entries()]
            .filter(([key, data]) => key.startsWith(`${name}/`) &&
              (operator === '==' ? data[field] === expected : data[field] > expected))
            .map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data }));
          return { size: rows.length, docs: rows };
        },
      };
    },
  });
  return {
    documents,
    collection,
    async getAll(...refs) {
      return refs.map(item => snapshot(documents.get(`${item.collection}/${item.id}`)));
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(item) { return snapshot(documents.get(`${item.collection}/${item.id}`)); },
        set(item, data) {
          assert.equal(Object.values(data).includes(undefined), false, 'Firestore rejects undefined fields');
          writes.push([item, data]);
        },
      };
      const result = await callback(tx);
      for (const [item, data] of writes) {
        documents.set(`${item.collection}/${item.id}`, data);
      }
      return result;
    },
  };
}

function snapshot(data) {
  return { exists: data !== undefined, data: () => data };
}

const auth = { verifyIdToken: async () => token };
const validActivationBody = (overrides = {}) => ({
  latitude: 37.77,
  longitude: -122.42,
  radiusMiles: 10,
  expiresAt: new Date(NOW + 30 * 60 * 1000).toISOString(),
  activities: ['dinner'],
  foodCuisines: ['italian'],
  ...overrides,
});

test('activation rejects forged coordinates, unsupported radii, and sessions over three hours', () => {
  assert.match(validActivationInput({ ...validActivationBody(), latitude: 91 }, NOW).error, /latitude/i);
  assert.match(validActivationInput(validActivationBody({ radiusMiles: 7 }), NOW).error, /radius/i);
  assert.match(validActivationInput(validActivationBody({
    expiresAt: new Date(NOW + MAX_SESSION_MS + 1).toISOString(),
  }), NOW).error, /three hours/i);
});

test('only Admin-issued activations can be used as location beacons', () => {
  const forgedClientBeacon = {
    status: 'active',
    startedAt: new Date(NOW - 1000),
    expiresAt: new Date(NOW + 60_000),
    radiusMiles: 50,
    latitude: 37.77,
    longitude: -122.42,
  };
  assert.equal(validActivation(forgedClientBeacon, NOW), false);
  assert.equal(validActivation({ ...forgedClientBeacon, issuer: 'activateLive-v1' }, NOW), true);
});

test('activation enforces the linked-phone browsing gate', async () => {
  assert.equal(canBrowseProfiles(profile({ phoneVerificationRequired: true }), token), true);
  assert.equal(canBrowseProfiles(profile({ phoneVerificationRequired: true }), { uid: 'viewer' }), false);
  const db = fakeDb({ 'users/viewer': profile({ phoneVerificationRequired: true }) });
  const res = response();
  await activateLive(request('POST', validActivationBody()), res, {
    db,
    auth: { verifyIdToken: async () => ({ uid: 'viewer' }) },
    now: NOW,
  });
  assert.equal(res.statusCode, 403);
  assert.equal(db.documents.has('liveActivations/viewer'), false);
});

test('repeated activation cannot sweep by changing location before cooldown expires', async () => {
  const db = fakeDb({ 'users/viewer': profile() });
  const dependencies = { db, auth, now: NOW };
  const first = response();
  await activateLive(request('POST', validActivationBody()), first, dependencies);
  assert.equal(first.statusCode, 201);
  assert.deepEqual(Object.keys(first.body), ['session']);
  assert.ok(first.body.session.startedAt);
  assert.ok(first.body.session.expiresAt);
  const activationBefore = db.documents.get('liveActivations/viewer');
  assert.equal(activationBefore.radiusMiles, 10);
  assert.equal(validActivation(activationBefore, NOW), true);

  const second = response();
  await activateLive(request('POST', validActivationBody({ latitude: 40, longitude: -73 })), second, dependencies);
  assert.equal(second.statusCode, 429);
  assert.equal(second.body.retryAt, new Date(NOW + REACTIVATION_COOLDOWN_MS).toISOString());
  assert.equal(db.documents.get('liveActivations/viewer').latitude, activationBefore.latitude);
  assert.equal(db.documents.get('liveSessions/viewer').latitude, activationBefore.latitude);
});

test('nearby feed ignores a forged liveSessions beacon without a server activation', async () => {
  const db = fakeDb({
    'users/viewer': profile(),
    'liveSessions/viewer': { status: 'active' },
    'liveActivations/viewer': {
      issuer: 'activateLive-v1',
      status: 'active',
      startedAt: new Date(NOW - 1000),
      expiresAt: new Date(NOW + 30 * 60 * 1000),
      radiusMiles: 10,
      latitude: 37.77,
      longitude: -122.42,
    },
    'users/candidate': profile({ displayName: 'Sam' }),
    // A client-writable session can claim any location, but no private activation exists.
    'liveSessions/candidate': {
      status: 'active',
      latitude: 37.7701,
      longitude: -122.4201,
      radiusMiles: 50,
      expiresAt: new Date(NOW + 30 * 60 * 1000),
    },
  });
  const res = response();
  await nearbyLive(request('GET'), res, {
    db,
    auth,
    now: NOW,
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.candidates, []);
});

test('nearby feed calculates candidates from activation coordinates, never client session coordinates', async () => {
  const activation = {
    issuer: 'activateLive-v1',
    status: 'active',
    startedAt: new Date(NOW - 1000),
    expiresAt: new Date(NOW + 30 * 60 * 1000),
    radiusMiles: 10,
    latitude: 37.7701,
    longitude: -122.4201,
    activities: ['coffee'],
  };
  const db = fakeDb({
    'users/viewer': profile({ phoneVerificationRequired: true }),
    'liveSessions/viewer': { status: 'active' },
    'liveActivations/viewer': {
      ...activation,
      latitude: 37.77,
      longitude: -122.42,
    },
    'users/candidate': profile({ displayName: 'Sam' }),
    'liveActivations/candidate': activation,
    'liveSessions/candidate': {
      status: 'active',
      latitude: 45,
      longitude: 110,
      radiusMiles: 50,
      expiresAt: new Date(NOW + 30 * 60 * 1000),
    },
  });
  const res = response();
  await nearbyLive(request('GET'), res, { db, auth, now: NOW });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.candidates.length, 1);
  assert.ok(res.body.candidates[0].distanceMiles < 1);
  assert.equal('latitude' in res.body.candidates[0], false);
  assert.equal('longitude' in res.body.candidates[0], false);
});

test('activated accounts see only active, mutual, unblocked, nearby eligible candidates', async () => {
  for (const exclusion of ['none', 'expired', 'far', 'mutual', 'paused', 'ended', 'blocked', 'incoming-block', 'hidden']) {
    const db = fakeDb({
      'users/viewer': profile(),
      'users/candidate': profile({ displayName: 'Sam' }),
    });
    const dependencies = { db, now: NOW };
    for (const uid of ['viewer', 'candidate']) {
      const res = response();
      await activateLive(request('POST', validActivationBody()), res, {
        ...dependencies, auth: { verifyIdToken: async () => ({ uid }) },
      });
      assert.equal(res.statusCode, 201);
    }
    const candidateActivation = db.documents.get('liveActivations/candidate');
    if (exclusion === 'expired') candidateActivation.expiresAt = new Date(NOW - 1);
    if (exclusion === 'far') candidateActivation.latitude = 0;
    if (exclusion === 'mutual') db.documents.get('users/candidate').interestedIn = 'men';
    if (exclusion === 'paused') db.documents.get('users/candidate').privacyControls = { pauseDiscovery: true };
    if (exclusion === 'ended') db.documents.get('liveSessions/candidate').status = 'ended';
    if (exclusion === 'blocked') db.documents.set('blocks/a', { blockerId: 'viewer', blockedId: 'candidate' });
    if (exclusion === 'incoming-block') db.documents.set('blocks/a', { blockerId: 'candidate', blockedId: 'viewer' });
    if (exclusion === 'hidden') db.documents.set('hiddenUsers/viewer', { uids: ['candidate'] });
    const res = response();
    await nearbyLive(request('GET'), res, { ...dependencies, auth });
    assert.equal(res.statusCode, 200, exclusion);
    assert.equal(res.body.candidates.length, exclusion === 'none' ? 1 : 0, exclusion);
  }
});