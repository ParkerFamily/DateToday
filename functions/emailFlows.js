'use strict';

/** Email-driven flows: signup codes, password reset, unsubscribe, Resend webhook, digests. */
const crypto = require('crypto');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const email = require('./email');

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 8;
const HOUR = 60 * 60 * 1000;
const PROVIDER_LABEL = { password: 'Password', 'google.com': 'Google', 'apple.com': 'Apple' };

const hashCode = (code, salt) => crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
const newCode = () => String(crypto.randomInt(100000, 1000000));
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';

/** Sliding window kept in Firestore. Throws 429 once `key` was used `limit` times inside `windowMs`. */
async function rateLimit(db, key, limit, windowMs, now = Date.now()) {
  const ref = db.collection('emailRateLimits').doc(crypto.createHash('sha256').update(key).digest('hex'));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const hits = (snap.exists ? snap.get('hits') || [] : []).filter((t) => t > now - windowMs);
    if (hits.length >= limit) throw httpError(429, 'Too many tries. Wait a few minutes and try again.');
    hits.push(now);
    tx.set(ref, { hits, expireAt: Timestamp.fromMillis(now + windowMs) });
  });
}

async function userByEmail(auth, address) {
  try {
    return await auth.getUserByEmail(address);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') return null;
    throw error;
  }
}

const signInMethods = (user) =>
  (user.providerData || []).map((p) => p.providerId).filter((id) => PROVIDER_LABEL[id]);

/** Step 1 of email signup: email a code to an address that has no account yet. */
async function startEmailSignup(req, { db, auth }) {
  const address = email.normEmail(req.body && req.body.email);
  if (!email.looksLikeEmail(address)) throw httpError(400, 'Enter a valid email address.');
  await rateLimit(db, `signup-ip|${clientIp(req)}`, 30, HOUR);
  await rateLimit(db, `signup|${address}`, 6, HOUR);

  const existing = await userByEmail(auth, address);
  if (existing) return { exists: true, methods: signInMethods(existing) };

  const code = newCode();
  const salt = crypto.randomBytes(16).toString('hex');
  await db.collection('signupOtps').doc(email.emailHash(address)).set({
    hash: hashCode(code, salt),
    salt,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  const sent = await email.sendEmail(db, { to: address, category: 'security', ...email.T.signupCode(code) });
  if (!sent.sent) {
    throw httpError(
      sent.reason === 'suppressed' ? 400 : 502,
      sent.reason === 'suppressed'
        ? 'We can’t deliver email to that address. Try a different one.'
        : 'Couldn’t send the code. Check the address and try again.',
    );
  }
  return { exists: false, sent: true };
}

/** Step 2: check the code. Success returns a signed token the password step hands back. */
async function confirmEmailSignup(req, { db }) {
  const address = email.normEmail(req.body && req.body.email);
  const code = String((req.body && req.body.code) || '').replace(/\s/g, '');
  if (!email.looksLikeEmail(address)) throw httpError(400, 'Enter a valid email address.');
  if (!/^\d{6}$/.test(code)) throw httpError(400, 'Enter the 6-digit code from your email.');

  const ref = db.collection('signupOtps').doc(email.emailHash(address));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw httpError(400, 'No code waiting for that email. Tap Resend code.');
    const data = snap.data();
    if (Number(data.expiresAt) < Date.now()) {
      tx.delete(ref);
      throw httpError(400, 'That code expired. Tap Resend code.');
    }
    if (Number(data.attempts || 0) >= MAX_CODE_ATTEMPTS) {
      tx.delete(ref);
      throw httpError(429, 'Too many attempts. Tap Resend code.');
    }
    if (hashCode(code, data.salt) !== data.hash) {
      tx.update(ref, { attempts: FieldValue.increment(1) });
      throw httpError(400, 'That code is incorrect.');
    }
    tx.delete(ref);
  });
  return { signupToken: email.signupToken(address) };
}

/** Step 3 (after the account exists): mark the confirmed email verified. */
async function claimSignupEmail(req, { db, auth, decoded }) {
  const token = String((req.body && req.body.signupToken) || '');
  if (!decoded.email || !email.checkSignupToken(decoded.email, token)) {
    throw httpError(400, 'Your email confirmation expired. Verify it from Settings › Account information.');
  }
  await auth.updateUser(decoded.uid, { emailVerified: true });
  await db.collection('users').doc(decoded.uid).set(
    { emailVerified: true, emailVerifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true };
}

/** Branded reset email. Always answers ok so the endpoint can't be used to probe for accounts. */
async function sendPasswordReset(req, { db, auth }) {
  const address = email.normEmail(req.body && req.body.email);
  if (!email.looksLikeEmail(address)) throw httpError(400, 'Enter a valid email address.');
  await rateLimit(db, `reset-ip|${clientIp(req)}`, 30, HOUR);
  await rateLimit(db, `reset|${address}`, 4, HOUR);

  const user = await userByEmail(auth, address);
  if (!user || user.disabled) return { ok: true };
  const methods = signInMethods(user);
  if (!methods.includes('password')) {
    const labels = methods.map((m) => PROVIDER_LABEL[m]).join(' or ') || 'Google or Apple';
    await email.sendEmail(db, { to: address, uid: user.uid, category: 'security', ...email.T.noPassword(labels) });
    return { ok: true };
  }
  const link = await auth.generatePasswordResetLink(address);
  await email.sendEmail(db, { to: address, uid: user.uid, category: 'security', ...email.T.passwordReset(link) });
  return { ok: true };
}

function page(title, body, withButton = false) {
  const esc = email.escapeHtml;
  const form = withButton
    ? `<form method="POST" action=""><button style="margin-top:8px;padding:14px 28px;border:0;border-radius:999px;background:#7C3AED;color:#fff;font-weight:700;font-size:16px;">Unsubscribe</button></form>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#09090B;color:#F5F3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:48px 24px;"><div style="font-size:22px;font-weight:800;margin-bottom:24px;">Date<span style="color:#A855F7;">Today</span></div>
<h1 style="font-size:24px;margin:0 0 12px;">${esc(title)}</h1><p style="color:#92929D;font-size:16px;line-height:24px;">${esc(body)}</p>${form}</div></body></html>`;
}

const CATEGORY_LABEL = { activity: 'match and like emails', news: 'news and offers' };

/**
 * GET shows a confirm button (link scanners must not unsubscribe people);
 * POST unsubscribes, including RFC 8058 one-click from Gmail / Apple Mail.
 */
async function emailUnsubscribe(req, res, { db }) {
  const q = { ...(req.query || {}) };
  const uid = String(q.u || '');
  const category = String(q.c || '');
  const token = String(q.t || '');
  res.set('Cache-Control', 'no-store');
  if (!email.checkUnsubscribeToken(uid, category, token)) {
    res.status(400).send(page('Link not valid', 'This unsubscribe link is broken or out of date. You can change emails in DateToday › Settings › Notifications.'));
    return;
  }
  const label = CATEGORY_LABEL[category];
  if (req.method === 'GET') {
    res.send(page(`Unsubscribe from ${label}?`, `You’ll stop getting ${label} from DateToday. Account and security emails still come through.`, true));
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  await db.collection('notificationPrefs').doc(uid).set(
    { [email.PREF_FOR_CATEGORY[category]]: false, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  res.send(page('You’re unsubscribed', `No more ${label}. You can turn them back on in DateToday › Settings › Notifications.`));
}

/** Hard bounces and spam complaints stop all future mail to that address. */
async function resendWebhook(req, res, { db }) {
  const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  if (!email.verifyWebhook(raw, req.headers, process.env.RESEND_WEBHOOK_SECRET || '')) {
    res.status(401).send('Bad signature');
    return;
  }
  const event = typeof req.body === 'object' && req.body ? req.body : JSON.parse(raw);
  const data = event.data || {};
  const recipients = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  const permanentBounce = event.type === 'email.bounced' && !/transient/i.test(String((data.bounce && data.bounce.type) || ''));
  const complaint = event.type === 'email.complained';
  if (permanentBounce || complaint) {
    await Promise.all(
      recipients.map((to) =>
        db.collection('emailSuppressions').doc(email.emailHash(to)).set({
          reason: complaint ? 'complaint' : 'bounce',
          detail: String((data.bounce && data.bounce.message) || '').slice(0, 300),
          emailId: data.email_id || null,
          at: FieldValue.serverTimestamp(),
        }),
      ),
    );
  }
  res.json({ ok: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Daily "N people liked you" for members with new, unanswered hearts. Never names anyone. */
async function likesDigest({ db, auth, now = Date.now() }) {
  const since = Timestamp.fromMillis(now - 24 * HOUR);
  const recent = await db.collection('interests').where('createdAt', '>=', since).limit(5000).get();
  const pending = new Map();
  await Promise.all(
    recent.docs.map(async (d) => {
      const { fromUid, toUid } = d.data();
      if (!fromUid || !toUid) return;
      const back = await db.collection('interests').doc(`${toUid}_${fromUid}`).get();
      if (back.exists) return;
      if (!pending.has(toUid)) pending.set(toUid, new Set());
      pending.get(toUid).add(fromUid);
    }),
  );

  let sent = 0;
  const day = new Date(now).toISOString().slice(0, 10);
  for (const [uid, fromSet] of pending) {
    const logRef = db.collection('emailLog').doc(uid);
    const log = await logRef.get();
    const last = log.exists ? Number(log.get('lastDigestAt') || 0) : 0;
    if (now - last < 20 * HOUR) continue;
    const user = await auth.getUser(uid).catch(() => null);
    if (!user || user.disabled || !user.email) continue;
    const result = await email.sendEmail(db, {
      to: user.email,
      uid,
      category: 'activity',
      idempotencyKey: `digest-${uid}-${day}`,
      ...email.T.likesDigest(fromSet.size),
    });
    if (result.sent) {
      sent += 1;
      await logRef.set({ lastDigestAt: now }, { merge: true });
    }
    await sleep(600);
  }
  return { candidates: pending.size, sent };
}

/** Emails a new match only to people push can't reach. */
async function emailNewMatch(db, auth, { uid, otherName, matchId }) {
  const tokens = await db.collection('pushTokens').where('uid', '==', uid).limit(5).get();
  if (tokens.docs.some((d) => d.get('enabled') !== false && typeof d.get('token') === 'string')) return;
  const user = await auth.getUser(uid).catch(() => null);
  if (!user || user.disabled || !user.email) return;
  await email.sendEmail(db, {
    to: user.email,
    uid,
    category: 'activity',
    idempotencyKey: `match-${matchId}-${uid}`,
    ...email.T.newMatch(otherName || 'someone', matchId),
  });
}

/** New profile: welcome email and a Resend contact (subscribed to broadcasts only with news opt-in). */
async function onProfileCreated(db, auth, uid, profile) {
  const user = await auth.getUser(uid).catch(() => null);
  if (!user || !user.email) return;
  const name = String((profile && profile.displayName) || '').trim().split(/\s+/)[0] || '';
  await email.sendEmail(db, { to: user.email, uid, idempotencyKey: `welcome-${uid}`, ...email.T.welcome(name) });
  const prefs = await db.collection('notificationPrefs').doc(uid).get();
  await email.syncContact({ email: user.email, firstName: name, unsubscribed: prefs.get('emailNews') !== true });
}

async function onEmailNewsChanged(db, auth, uid, before, after) {
  const was = before && before.emailNews === true;
  const now = after && after.emailNews === true;
  if (was === now) return;
  const user = await auth.getUser(uid).catch(() => null);
  if (!user || !user.email) return;
  await email.syncContact({ email: user.email, unsubscribed: !now });
}

/** Alert when a sign-in method appears on the account. Confirmed against Auth, not the client doc. */
async function onProvidersChanged(db, auth, uid, before, after, eventId) {
  if (!Array.isArray(before && before.providerIds) || !Array.isArray(after && after.providerIds)) return;
  const added = after.providerIds.filter((p) => PROVIDER_LABEL[p] && !before.providerIds.includes(p));
  if (!added.length) return;
  const user = await auth.getUser(uid).catch(() => null);
  if (!user || !user.email) return;
  const real = new Set(signInMethods(user));
  for (const provider of added.filter((p) => real.has(p))) {
    await email.sendEmail(db, {
      to: user.email,
      uid,
      category: 'security',
      idempotencyKey: `provider-${uid}-${provider}-${eventId}`,
      ...email.T.providerAdded(PROVIDER_LABEL[provider]),
    });
  }
}

module.exports = {
  claimSignupEmail,
  confirmEmailSignup,
  emailNewMatch,
  emailUnsubscribe,
  likesDigest,
  onEmailNewsChanged,
  onProfileCreated,
  onProvidersChanged,
  rateLimit,
  resendWebhook,
  sendPasswordReset,
  startEmailSignup,
};
