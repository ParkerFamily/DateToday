'use strict';

/** Signed-in devices, new sign-in alerts and email two-step verification. */
const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const email = require('./email');
const { rateLimit } = require('./emailFlows');

const ID = /^[A-Za-z0-9_-]{16,64}$/;
const PLATFORMS = new Set(['ios', 'android', 'web']);
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 6;
const MAX_TRUSTED = 20;
const ACTIVE_WRITE_MS = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const LOCATION_TIMEOUT_MS = 2000;

const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });
const hashCode = (code, salt) => crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
const newCode = () => String(crypto.randomInt(100000, 1000000));
/** Sessions are readable by their owner, so they hold a hash: a stolen password can't copy a trusted device id. */
const deviceHash = (deviceId) => crypto.createHash('sha256').update(`device:${deviceId}`).digest('hex');
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
const millis = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : Number(value) || 0);

function cleanText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function maskEmail(address) {
  const [name, domain] = String(address || '').split('@');
  if (!name || !domain) return '';
  return `${name.slice(0, Math.min(2, name.length))}${'•'.repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}

function isPublicIp(ip) {
  if (!ip || ip === 'unknown') return false;
  const v4 = ip.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  if (!ip.includes(':')) return false;
  const lower = ip.toLowerCase();
  return !(lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80'));
}

/** Approximate city from the request IP. Never blocks a sign-in: any failure means no location. */
async function lookupLocation(ip, fetchImpl = fetch) {
  if (!isPublicIp(ip)) return null;
  try {
    const res = await fetchImpl(`https://free.freeipapi.com/api/v1/json/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(LOCATION_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const city = cleanText(json.cityName, 60);
    const country = cleanText(json.countryName, 60);
    const countryCode = cleanText(json.countryCode, 2).toUpperCase();
    if (!city && !country) return null;
    return { city, region: cleanText(json.regionCode || json.regionName, 40), country, countryCode };
  } catch {
    return null;
  }
}

/** "Dallas, TX" in the US/Canada, "London, United Kingdom" elsewhere. */
function placeLabel(location) {
  if (!location) return '';
  const { city, region, country, countryCode } = location;
  if (!city) return country || '';
  if ((countryCode === 'US' || countryCode === 'CA') && region) return `${city}, ${region}`;
  return [city, country].filter(Boolean).join(', ');
}

function signInPush(session, { needsCode }) {
  const place = placeLabel(session.location);
  const where = `${session.deviceLabel}${place ? ` near ${place}` : ''}`;
  return {
    title: 'New sign-in to DateToday',
    body: needsCode
      ? `Someone signed in on ${where} and needs the code we emailed you. Not you? Tap to sign it out and change your password.`
      : `Your account was signed in on ${where}. Not you? Tap to sign it out.`,
    data: { type: 'security', url: '/settings/devices' },
  };
}

function readDevice(body) {
  const sessionId = String(body.sessionId || '');
  const deviceId = String(body.deviceId || '');
  if (!ID.test(sessionId) || !ID.test(deviceId)) throw httpError(400, 'Update DateToday and try again.');
  const platform = PLATFORMS.has(body.platform) ? body.platform : 'web';
  const fallback = platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android phone' : 'Web browser';
  return {
    sessionId,
    deviceHash: deviceHash(deviceId),
    platform,
    deviceLabel: cleanText(body.deviceLabel, 60) || fallback,
    appVersion: cleanText(body.appVersion, 20),
  };
}

async function ownSession(db, uid, sessionId) {
  if (!ID.test(String(sessionId || ''))) throw httpError(400, 'Unknown device.');
  const ref = db.collection('sessions').doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists || snap.get('uid') !== uid) throw httpError(404, 'That device isn’t signed in anymore.');
  return { ref, data: snap.data() };
}

async function accountEmail(auth, decoded) {
  const user = await auth.getUser(decoded.uid).catch(() => null);
  return (user && user.email) || decoded.email || null;
}

async function storeCode(db, collection, docId, fields) {
  const code = newCode();
  const salt = crypto.randomBytes(16).toString('hex');
  await db.collection(collection).doc(docId).set({
    ...fields,
    hash: hashCode(code, salt),
    salt,
    attempts: 0,
    expiresAt: Date.now() + CODE_TTL_MS,
    createdAt: FieldValue.serverTimestamp(),
  });
  return code;
}

/** Throws a friendly 4xx unless `code` matches; burns the code after too many tries. */
async function checkCode(ref, uid, code, extra = () => true) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) throw httpError(400, 'Enter the 6-digit code.');
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  if (!data || data.uid !== uid || !extra(data)) throw httpError(400, 'No code pending. Tap Resend code.');
  if (Number(data.expiresAt) < Date.now()) {
    await ref.delete().catch(() => undefined);
    throw httpError(400, 'That code expired. Tap Resend code.');
  }
  const attempts = Number(data.attempts || 0);
  if (attempts >= MAX_CODE_ATTEMPTS) {
    await ref.delete().catch(() => undefined);
    throw httpError(429, 'Too many tries. Tap Resend code.');
  }
  if (hashCode(clean, data.salt) !== data.hash) {
    await ref.set({ attempts: attempts + 1 }, { merge: true });
    throw httpError(400, 'That code is incorrect.');
  }
  await ref.delete().catch(() => undefined);
  return data;
}

async function deliver(db, uid, to, template) {
  const sent = await email.sendEmail(db, { to, uid, category: 'security', ...template });
  if (!sent.sent) {
    throw httpError(sent.reason === 'suppressed' ? 400 : 502, sent.reason === 'suppressed'
      ? 'We can’t deliver email to your address.'
      : 'Couldn’t send the code. Try again in a moment.');
  }
}

async function emailLoginCode(db, uid, address, sessionId, session) {
  await rateLimit(db, `login|${uid}`, 6, HOUR);
  const code = await storeCode(db, 'loginCodes', sessionId, { uid });
  await deliver(db, uid, address, email.T.loginCode(code, session.deviceLabel, placeLabel(session.location)));
}

async function trustDevice(db, uid, hash) {
  const ref = db.collection('securitySettings').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const list = (snap.exists && Array.isArray(snap.get('trustedDevices')) ? snap.get('trustedDevices') : []).filter((h) => h !== hash);
    tx.set(ref, { trustedDevices: [...list, hash].slice(-MAX_TRUSTED), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function revoke(db, uid, sessionDocs, by) {
  if (!sessionDocs.length) return;
  const ids = new Set(sessionDocs.map((d) => d.id));
  const hashes = sessionDocs.map((d) => d.get('deviceHash')).filter(Boolean);
  const tokens = await db.collection('pushTokens').where('uid', '==', uid).get();
  const batch = db.batch();
  sessionDocs.forEach((d) => {
    batch.update(d.ref, { revokedAt: FieldValue.serverTimestamp(), revokedBy: by });
    batch.delete(db.collection('loginCodes').doc(d.id));
  });
  tokens.docs.forEach((t) => {
    if (ids.has(t.get('sessionId'))) batch.delete(t.ref);
  });
  if (hashes.length) {
    batch.set(
      db.collection('securitySettings').doc(uid),
      { trustedDevices: FieldValue.arrayRemove(...hashes), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
}

/**
 * `pushToUser(db, uid, message, options)` is injected so this module stays testable.
 * Every action runs signed in; body `{ action, ... }`.
 */
function createSecurityEndpoint({ pushToUser, fetchImpl = (...args) => fetch(...args) }) {
  const actions = {
    /** Called on every app start. `fresh` is true only right after a sign-in on this device. */
    async register(req, { db, auth, decoded }) {
      const uid = decoded.uid;
      const device = readDevice(req.body || {});
      const ref = db.collection('sessions').doc(device.sessionId);
      const snap = await ref.get();

      if (snap.exists) {
        const s = snap.data();
        if (s.uid !== uid) throw httpError(409, 'Session belongs to another account.', 'session_conflict');
        if (s.revokedAt) return { status: 'revoked' };
        const patch = {};
        if (Date.now() - millis(s.lastActiveAt) > ACTIVE_WRITE_MS) patch.lastActiveAt = FieldValue.serverTimestamp();
        if (device.appVersion && device.appVersion !== s.appVersion) patch.appVersion = device.appVersion;
        if (device.deviceLabel !== s.deviceLabel) patch.deviceLabel = device.deviceLabel;
        if (Object.keys(patch).length) await ref.update(patch);
        return s.needsCode ? { status: 'needs_code', email: maskEmail(await accountEmail(auth, decoded)) } : { status: 'ok' };
      }

      const fresh = req.body.fresh === true;
      const [settingsSnap, existing, location, address] = await Promise.all([
        db.collection('securitySettings').doc(uid).get(),
        db.collection('sessions').where('uid', '==', uid).get(),
        lookupLocation(clientIp(req), fetchImpl),
        accountEmail(auth, decoded),
      ]);
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const trusted = Array.isArray(settings.trustedDevices) && settings.trustedDevices.includes(device.deviceHash);
      const needsCode = fresh && settings.twoStepEmail === true && !trusted && Boolean(address);
      const knownDevice = existing.docs.some((d) => d.get('deviceHash') === device.deviceHash);
      const session = {
        uid,
        deviceHash: device.deviceHash,
        platform: device.platform,
        deviceLabel: device.deviceLabel,
        appVersion: device.appVersion,
        location,
        needsCode,
        revokedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        lastActiveAt: FieldValue.serverTimestamp(),
      };
      await ref.create(session).catch((error) => {
        if (error.code === 6) throw httpError(409, 'Session already exists.', 'session_conflict');
        throw error;
      });

      // The very first session is a new account (or this app update), and a known device is the owner signing back in.
      if (fresh && !existing.empty && !knownDevice) {
        await pushToUser(db, uid, signInPush(session, { needsCode }), { excludeSessionId: device.sessionId });
        if (!needsCode && address) {
          await email
            .sendEmail(db, { to: address, uid, category: 'security', ...email.T.newSignIn(device.deviceLabel, placeLabel(location)) })
            .catch((error) => console.warn('new sign-in email failed', error && error.message));
        }
      }
      if (needsCode) {
        await emailLoginCode(db, uid, address, device.sessionId, session).catch((error) =>
          console.warn('login code email failed', error && error.message),
        );
        return { status: 'needs_code', email: maskEmail(address) };
      }
      return { status: 'ok' };
    },

    async sendLoginCode(req, { db, auth, decoded }) {
      const { data } = await ownSession(db, decoded.uid, req.body.sessionId);
      if (data.revokedAt) return { status: 'revoked' };
      if (!data.needsCode) return { status: 'ok' };
      const address = await accountEmail(auth, decoded);
      if (!address) throw httpError(400, 'No email on this account.');
      await emailLoginCode(db, decoded.uid, address, req.body.sessionId, data);
      return { status: 'needs_code', email: maskEmail(address) };
    },

    async verifyLoginCode(req, { db, decoded }) {
      const uid = decoded.uid;
      const { ref, data } = await ownSession(db, uid, req.body.sessionId);
      if (data.revokedAt) return { status: 'revoked' };
      if (!data.needsCode) return { status: 'ok' };
      await checkCode(db.collection('loginCodes').doc(req.body.sessionId), uid, req.body.code);
      await ref.update({ needsCode: false, verifiedAt: FieldValue.serverTimestamp() });
      if (req.body.remember !== false && data.deviceHash) await trustDevice(db, uid, data.deviceHash);
      return { status: 'ok' };
    },

    async signOutDevice(req, { db, decoded }) {
      const uid = decoded.uid;
      if (!ID.test(String(req.body.sessionId || ''))) throw httpError(400, 'Unknown device.');
      const snap = await db.collection('sessions').doc(req.body.sessionId).get();
      if (!snap.exists || snap.get('uid') !== uid) throw httpError(404, 'That device isn’t signed in anymore.');
      if (!snap.get('revokedAt')) await revoke(db, uid, [snap], req.body.self === true ? 'self' : 'user');
      return { ok: true };
    },

    /** Server-enforced: every other device's refresh token dies; this device gets a fresh sign-in token. */
    async signOutOthers(req, { db, auth, decoded }) {
      const uid = decoded.uid;
      const current = String(req.body.sessionId || '');
      const all = await db.collection('sessions').where('uid', '==', uid).get();
      const mine = all.docs.find((d) => d.id === current);
      const others = all.docs.filter((d) => d.id !== current && !d.get('revokedAt'));
      await revoke(db, uid, others, 'user');
      const tokens = await db.collection('pushTokens').where('uid', '==', uid).get();
      await Promise.all(
        tokens.docs.filter((t) => !current || t.get('sessionId') !== current).map((t) => t.ref.delete().catch(() => undefined)),
      );
      const keep = mine && !mine.get('revokedAt') && mine.get('deviceHash');
      const settings = await db.collection('securitySettings').doc(uid).get();
      const trusted = settings.exists && Array.isArray(settings.get('trustedDevices')) ? settings.get('trustedDevices') : [];
      await db.collection('securitySettings').doc(uid).set(
        { trustedDevices: keep && trusted.includes(keep) ? [keep] : [], updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      let token = null;
      try {
        token = await auth.createCustomToken(uid);
      } catch (error) {
        console.error('createCustomToken failed; other devices are signed out in-app only', error && error.message);
        return { signedOut: others.length, token: null };
      }
      await auth.revokeRefreshTokens(uid);
      return { signedOut: others.length, token };
    },

    async sendTwoStepCode(req, { db, auth, decoded }) {
      const uid = decoded.uid;
      const enable = req.body.enabled === true;
      const address = await accountEmail(auth, decoded);
      if (!address) throw httpError(400, 'Add an email to your account first.');
      await rateLimit(db, `twostep|${uid}`, 6, HOUR);
      const code = await storeCode(db, 'securityCodes', uid, { uid, purpose: enable ? 'enable' : 'disable' });
      await deliver(db, uid, address, email.T.twoStepCode(code, enable));
      return { ok: true, email: maskEmail(address) };
    },

    async setTwoStep(req, { db, decoded }) {
      const uid = decoded.uid;
      const enable = req.body.enabled === true;
      await checkCode(db.collection('securityCodes').doc(uid), uid, req.body.code, (d) => d.purpose === (enable ? 'enable' : 'disable'));
      await db
        .collection('securitySettings')
        .doc(uid)
        .set({ twoStepEmail: enable, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (enable && ID.test(String(req.body.sessionId || ''))) {
        const snap = await db.collection('sessions').doc(req.body.sessionId).get();
        if (snap.exists && snap.get('uid') === uid && snap.get('deviceHash')) await trustDevice(db, uid, snap.get('deviceHash'));
      }
      return { ok: true, twoStepEmail: enable };
    },
  };

  return async (req, ctx) => {
    const action = req.body && actions[req.body.action];
    if (!action) throw httpError(400, 'Update DateToday and try again.');
    return action(req, ctx);
  };
}

/** Owner console: mark every live session of `uid` signed out. Pair with auth.revokeRefreshTokens. */
async function revokeAllSessions(db, uid, by) {
  const all = await db.collection('sessions').where('uid', '==', uid).get();
  const active = all.docs.filter((d) => !d.get('revokedAt'));
  await revoke(db, uid, active, by);
  return active.length;
}

/** Account deletion: drop every session, code and setting tied to `uid`. */
async function deleteSecurityData(db, uid) {
  for (const name of ['sessions', 'loginCodes']) {
    const snap = await db.collection(name).where('uid', '==', uid).get();
    if (snap.empty) continue;
    const writer = db.bulkWriter();
    snap.docs.forEach((d) => writer.delete(d.ref));
    await writer.close();
  }
  await Promise.all(
    ['securitySettings', 'securityCodes'].map((c) => db.collection(c).doc(uid).delete().catch(() => undefined)),
  );
}

module.exports = {
  createSecurityEndpoint,
  deleteSecurityData,
  deviceHash,
  isPublicIp,
  lookupLocation,
  maskEmail,
  placeLabel,
  readDevice,
  revokeAllSessions,
  signInPush,
};
