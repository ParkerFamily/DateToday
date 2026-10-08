/**
 * Keeps one DateToday account per person across Google, Apple and email/password.
 *
 * Firebase lets a "trusted" sign-in (Apple, Google for @gmail.com) silently take over an account
 * whose email was never verified, which removes that account's password. Before a Google/Apple
 * sign-in, the app sends us the provider's ID token; we verify it (so only the owner of that email
 * can ask) and say whether they should log in the existing way first and link instead.
 */
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const PROVIDERS = {
  google: {
    providerId: 'google.com',
    issuers: ['accounts.google.com', 'https://accounts.google.com'],
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    // Any OAuth client in this Firebase project (web, iOS, Android).
    audienceOk: (aud) => /^626033907762-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(aud),
  },
  apple: {
    providerId: 'apple.com',
    issuers: ['https://appleid.apple.com'],
    jwksUri: 'https://appleid.apple.com/auth/keys',
    audienceOk: (aud) => aud === 'com.parkerfamily.datetoday',
  },
};

const LINKABLE = new Set(['password', 'google.com', 'apple.com']);
const GMAIL = /@(gmail|googlemail)\.com$/i;

const clients = {};
function signingKey(provider) {
  clients[provider] = clients[provider] || jwksClient({
    jwksUri: PROVIDERS[provider].jwksUri,
    cache: true,
    cacheMaxAge: 6 * 60 * 60 * 1000,
    rateLimit: true,
  });
  return (header, cb) => {
    clients[provider].getSigningKey(header.kid, (err, key) => cb(err, key && key.getPublicKey()));
  };
}

/** Checks signature, issuer, audience and expiry. Returns the verified email (lowercased). */
function verifyProviderToken(provider, idToken, opts = {}) {
  const spec = PROVIDERS[provider];
  if (!spec) return Promise.reject(Object.assign(new Error('Unknown provider.'), { status: 400 }));
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      opts.getKey || signingKey(provider),
      { algorithms: ['RS256'], issuer: spec.issuers },
      (err, claims) => {
        if (err || !claims) return reject(Object.assign(new Error('Invalid sign-in token.'), { status: 401 }));
        const aud = Array.isArray(claims.aud) ? claims.aud[0] : claims.aud;
        if (!spec.audienceOk(String(aud || ''))) {
          return reject(Object.assign(new Error('Invalid sign-in token.'), { status: 401 }));
        }
        const verified = claims.email_verified === true || claims.email_verified === 'true';
        const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
        resolve({ email: email && verified ? email : null });
      },
    );
  });
}

/** Firebase treats these as proof of email ownership; two trusted sign-ins link on their own. */
function isTrusted(providerId, email, emailVerified) {
  if (providerId === 'apple.com') return true;
  if (providerId === 'google.com') return GMAIL.test(email || '');
  if (providerId === 'password') return Boolean(emailVerified);
  return false;
}

/**
 * `link`: sign in the existing way first, then connect this provider (Firebase would otherwise
 * replace the old sign-in or refuse). `signin`: safe to sign in directly.
 */
function linkDecision(existing, providerId, email) {
  if (!existing || existing.disabled) return { action: 'signin' };
  const methods = (existing.providerData || []).map((p) => p.providerId).filter((m) => LINKABLE.has(m));
  if (methods.includes(providerId)) return { action: 'signin' };
  const accountEmail = existing.email || email;
  const autoLinks =
    isTrusted(providerId, email, true) &&
    methods.length > 0 &&
    methods.every((m) => isTrusted(m, accountEmail, existing.emailVerified));
  return autoLinks ? { action: 'signin' } : { action: 'link', methods };
}

async function authPrecheck(auth, body, opts = {}) {
  const provider = body && body.provider;
  const idToken = body && typeof body.idToken === 'string' ? body.idToken : '';
  if (!PROVIDERS[provider] || !idToken) {
    throw Object.assign(new Error('Missing sign-in token.'), { status: 400 });
  }
  const { email } = await verifyProviderToken(provider, idToken, opts);
  if (!email) return { action: 'signin' };
  const existing = await auth.getUserByEmail(email).catch((error) => {
    if (error && error.code === 'auth/user-not-found') return null;
    throw error;
  });
  return { ...linkDecision(existing, PROVIDERS[provider].providerId, email), email };
}

module.exports = { authPrecheck, isTrusted, linkDecision, verifyProviderToken, PROVIDERS };
