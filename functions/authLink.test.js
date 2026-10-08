const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const authLink = require('./authLink');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const getKey = (_header, cb) => cb(null, publicKey.export({ type: 'spki', format: 'pem' }));
const GOOGLE_AUD = '626033907762-6c3mb8spcs4ppomfsjm4um135t5t443o.apps.googleusercontent.com';

function token(claims, opts = {}) {
  return jwt.sign(
    { email: 'sam@gmail.com', email_verified: true, ...claims },
    privateKey,
    { algorithm: 'RS256', issuer: 'https://accounts.google.com', audience: GOOGLE_AUD, expiresIn: 600, ...opts },
  );
}

const user = (providers, extra = {}) => ({
  email: 'sam@gmail.com',
  emailVerified: false,
  providerData: providers.map((providerId) => ({ providerId })),
  ...extra,
});

test('verifyProviderToken accepts a real Google token from this project', async () => {
  const out = await authLink.verifyProviderToken('google', token({ email: 'Sam@Gmail.com' }), { getKey });
  assert.equal(out.email, 'sam@gmail.com');
});

test('verifyProviderToken rejects other apps, expired tokens and unverified emails', async () => {
  await assert.rejects(
    authLink.verifyProviderToken('google', token({}, { audience: '999-x.apps.googleusercontent.com' }), { getKey }),
  );
  await assert.rejects(authLink.verifyProviderToken('google', token({}, { expiresIn: -10 }), { getKey }));
  await assert.rejects(authLink.verifyProviderToken('apple', token({}), { getKey }));
  const unverified = await authLink.verifyProviderToken('google', token({ email_verified: false }), { getKey });
  assert.equal(unverified.email, null);
});

test('Apple tokens must be for this app', async () => {
  const apple = jwt.sign({ email: 'x@privaterelay.appleid.com', email_verified: 'true' }, privateKey, {
    algorithm: 'RS256',
    issuer: 'https://appleid.apple.com',
    audience: 'com.parkerfamily.datetoday',
    expiresIn: 600,
  });
  assert.equal((await authLink.verifyProviderToken('apple', apple, { getKey })).email, 'x@privaterelay.appleid.com');
});

test('linkDecision: new email or provider already linked signs straight in', () => {
  assert.deepEqual(authLink.linkDecision(null, 'google.com', 'sam@gmail.com'), { action: 'signin' });
  assert.deepEqual(authLink.linkDecision(user(['google.com']), 'google.com', 'sam@gmail.com'), { action: 'signin' });
});

test('linkDecision: Google onto an unverified password account links instead of wiping the password', () => {
  assert.deepEqual(authLink.linkDecision(user(['password']), 'google.com', 'sam@gmail.com'), {
    action: 'link',
    methods: ['password'],
  });
  assert.equal(authLink.linkDecision(user(['password']), 'apple.com', 'sam@gmail.com').action, 'link');
});

test('linkDecision: trusted onto trusted is left to Firebase (it links both)', () => {
  assert.equal(authLink.linkDecision(user(['apple.com']), 'google.com', 'sam@gmail.com').action, 'signin');
  assert.equal(authLink.linkDecision(user(['google.com']), 'apple.com', 'sam@gmail.com').action, 'signin');
  assert.equal(
    authLink.linkDecision(user(['password'], { emailVerified: true }), 'google.com', 'sam@gmail.com').action,
    'signin',
  );
});

test('linkDecision: Workspace Google is not trusted, so it links', () => {
  const work = user(['password'], { email: 'sam@company.com', emailVerified: true });
  assert.equal(authLink.linkDecision(work, 'google.com', 'sam@company.com').action, 'link');
  const workGoogle = user(['google.com'], { email: 'sam@company.com', emailVerified: true });
  assert.deepEqual(authLink.linkDecision(workGoogle, 'apple.com', 'sam@company.com'), {
    action: 'link',
    methods: ['google.com'],
  });
});

test('authPrecheck looks the verified email up and answers', async () => {
  const fakeAuth = (found) => ({
    getUserByEmail: async () => {
      if (!found) throw Object.assign(new Error('nope'), { code: 'auth/user-not-found' });
      return found;
    },
  });
  assert.deepEqual(
    await authLink.authPrecheck(fakeAuth(null), { provider: 'google', idToken: token({}) }, { getKey }),
    { action: 'signin', email: 'sam@gmail.com' },
  );
  assert.deepEqual(
    await authLink.authPrecheck(fakeAuth(user(['password'])), { provider: 'google', idToken: token({}) }, { getKey }),
    { action: 'link', methods: ['password'], email: 'sam@gmail.com' },
  );
  await assert.rejects(authLink.authPrecheck(fakeAuth(null), { provider: 'google' }, { getKey }), /Missing/);
});
