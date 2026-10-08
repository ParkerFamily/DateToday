/**
 * Firebase Cloud Functions for DateToday.
 * Deploy: npm i && firebase deploy --only functions
 *
 * deleteAccount — server-side purge (Auth, Firestore, Storage).
 * confirmPersonaVerification — Persona API check, then grant verified (Admin write).
 * Clients must not be the only deletion / verification path in production.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { activateLive, nearbyLive } = require('./nearbyLive');
const liveEngagement = require('./liveEngagement');
const calendar = require('./calendar');
const likes = require('./likes');
const authLink = require('./authLink');
const email = require('./email');
const emailFlows = require('./emailFlows');
const emailIdentity = require('./emailIdentity');
const geo = require('./geo');
const personaName = require('./personaName');
const functionsV1 = require('firebase-functions/v1');

initializeApp();

/**
 * Backstop for one-account-per-inbox: the app checks before creating accounts, but anything that
 * reaches Firebase Auth directly with another spelling of a taken inbox gets disabled here.
 */
exports.onAuthUserCreated = functionsV1.auth.user().onCreate(async (user) => {
  if (!user.email) return;
  const db = getFirestore();
  const auth = getAuth();
  const owner = await emailIdentity.findInboxOwner(db, auth, user.email, user.uid);
  if (!owner) {
    await emailIdentity.claimInbox(db, auth, user.uid, user.email);
    return;
  }
  await auth.updateUser(user.uid, { disabled: true });
  await auth.revokeRefreshTokens(user.uid);
  await db.collection('duplicateAccounts').doc(user.uid).set({
    ownerUid: owner.uid,
    providers: (user.providerData || []).map((p) => p.providerId),
    at: FieldValue.serverTimestamp(),
  });
  console.warn('Disabled duplicate-inbox account', { uid: user.uid, ownerUid: owner.uid });
});

exports.nearbyLive = onRequest({ cors: true, invoker: 'public' }, nearbyLive);
exports.activateLive = onRequest({ cors: true, invoker: 'public' }, activateLive);

function personaKey() {
  return process.env.PERSONA_API_KEY || '';
}

function mapPersonaStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'completed' || s === 'approved') return 'verified';
  if (s === 'failed' || s === 'declined') return 'failed';
  if (s === 'needs_review' || s === 'needs-review') return 'manual_review';
  if (s === 'created' || s === 'pending' || s === 'started') return 'pending';
  return 'pending';
}

async function fetchPersonaInquiry(apiKey, inquiryId) {
  const res = await fetch(`https://api.withpersona.com/api/v1/inquiries/${inquiryId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Persona-Version': '2023-01-05',
      Accept: 'application/json',
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.errors?.[0]?.title || json?.errors?.[0]?.details || `Persona ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function findInquiryByReferenceId(apiKey, referenceId) {
  const url = new URL('https://api.withpersona.com/api/v1/inquiries');
  url.searchParams.set('filter[reference-id]', referenceId);
  url.searchParams.set('page[size]', '10');
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Persona-Version': '2023-01-05',
      Accept: 'application/json',
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const rows = Array.isArray(json.data) ? json.data : [];
  if (!rows.length) return null;
  // Prefer approved/completed, else newest.
  const ranked = [...rows].sort((a, b) => {
    const as = mapPersonaStatus(a?.attributes?.status);
    const bs = mapPersonaStatus(b?.attributes?.status);
    if (as === 'verified' && bs !== 'verified') return -1;
    if (bs === 'verified' && as !== 'verified') return 1;
    return 0;
  });
  return ranked[0];
}

/** `legalName` is the name read off the verified ID; it never touches the public display name. */
async function writeVerification(db, uid, status, inquiryId, legalName = null) {
  const payload = {
    verificationStatus: status,
    personaInquiryId: inquiryId || null,
    verificationCheckedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (status === 'verified') {
    payload.verifiedAt = FieldValue.serverTimestamp();
    if (legalName) payload.legalName = legalName;
  }
  await db.collection('users').doc(uid).set(payload, { merge: true });
  await db.collection('profiles').doc(uid).set(
    {
      verificationStatus: status,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function deletePrefix(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix });
  await Promise.all(files.map((f) => f.delete().catch(() => undefined)));
}

/** BulkWriter has no 500-write batch cap, so a popular account's likes can't break deletion. */
async function deleteByField(db, collectionName, field, uid) {
  const snap = await db.collection(collectionName).where(field, '==', uid).get();
  if (snap.empty) return;
  const writer = db.bulkWriter();
  snap.docs.forEach((d) => writer.delete(d.ref));
  await writer.close();
}

async function anonymizeReports(db, uid) {
  const asReporter = await db.collection('reports').where('reporterId', '==', uid).get();
  const asReported = await db.collection('reports').where('reportedId', '==', uid).get();
  if (asReporter.empty && asReported.empty) return;
  const writer = db.bulkWriter();
  asReporter.docs.forEach((d) =>
    writer.update(d.ref, {
      reporterId: 'deleted_user',
      anonymizedAt: new Date().toISOString(),
    }),
  );
  asReported.docs.forEach((d) =>
    writer.update(d.ref, {
      reportedId: 'deleted_user',
      anonymizedAt: new Date().toISOString(),
    }),
  );
  await writer.close();
}

exports.deleteAccount = onRequest({ cors: true, invoker: 'public', timeoutSeconds: 540, memory: '512MiB' }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Missing auth' });
      return;
    }

    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const gone = (p) => p.catch(() => undefined);
    const accountEmail = (await getAuth().getUser(uid).catch(() => null))?.email || decoded.email || null;

    // Pull every public surface first, so a failure partway through never leaves a discoverable
    // account. Every step is idempotent; a retry with the same session finishes the job.
    await Promise.all([
      gone(db.collection('profiles').doc(uid).delete()),
      gone(db.collection('liveSessions').doc(uid).delete()),
      gone(db.collection('nearbyProfiles').doc(uid).delete()),
    ]);
    await deleteByField(db, 'pushTokens', 'uid', uid);
    await deleteByField(db, 'pushTickets', 'uid', uid);

    const matches = await db.collection('matches').where('userIds', 'array-contains', uid).get();
    for (const d of matches.docs) await db.recursiveDelete(d.ref);
    await deleteByField(db, 'interests', 'fromUid', uid);
    await deleteByField(db, 'interests', 'toUid', uid);
    const compat = await db.collection('compatibility').where('userIds', 'array-contains', uid).get();
    await Promise.all(compat.docs.map((d) => d.ref.delete()));

    await deletePrefix(bucket, `users/${uid}/`);
    await anonymizeReports(db, uid);
    await Promise.all(
      ['notificationPrefs', 'promoLog', 'userStats', 'emailOtps', 'emailLog', 'users'].map((c) =>
        gone(db.collection(c).doc(uid).delete()),
      ),
    );

    // Blocks go last: removing them earlier would make a half-deleted account visible again
    // to everyone who blocked it.
    await deleteByField(db, 'blocks', 'blockerId', uid);
    await deleteByField(db, 'blocks', 'blockedId', uid);
    await gone(db.collection('hiddenUsers').doc(uid).delete());
    const hiddenBy = await db.collection('hiddenUsers').where('uids', 'array-contains', uid).get();
    await Promise.all(hiddenBy.docs.map((d) => d.ref.update({ uids: FieldValue.arrayRemove(uid) })));

    await db.collection('deleted_users').doc(uid).set({
      uid,
      deletedAt: new Date().toISOString(),
      deletionSource: 'cloud_function',
    });
    await getAuth().deleteUser(uid).catch((e) => {
      if (!e || e.code !== 'auth/user-not-found') throw e;
    });

    if (accountEmail) {
      await emailIdentity.releaseInbox(db, uid, accountEmail).catch(() => undefined);
      await email.removeContact(accountEmail).catch(() => undefined);
      await email.sendEmail(db, { to: accountEmail, idempotencyKey: `deleted-${uid}`, ...email.T.accountDeleted() });
    }

    res.json({ result: { ok: true } });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Delete failed',
    });
  }
});

/**
 * Confirm Persona inquiry for the signed-in user and grant VERIFIED when approved.
 * Body: { inquiryId?: string }
 * Looks up by inquiryId, else by reference-id == uid, else users/{uid}.personaInquiryId.
 */
exports.confirmPersonaVerification = onRequest(
  {
    cors: true,
    // Set via functions/.env (PERSONA_API_KEY=…) — avoids Secret Manager / Blaze requirement.
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
      }

      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) {
        res.status(401).json({ error: 'Missing auth' });
        return;
      }

      const decoded = await getAuth().verifyIdToken(token);
      const uid = decoded.uid;
      const db = getFirestore();
      const apiKey = personaKey();
      if (!apiKey) {
        res.status(500).json({ error: 'PERSONA_API_KEY not configured on functions' });
        return;
      }

      const body = typeof req.body === 'object' && req.body ? req.body : {};
      let inquiryId =
        typeof body.inquiryId === 'string' && body.inquiryId.trim()
          ? body.inquiryId.trim()
          : null;

      if (!inquiryId) {
        const userSnap = await db.collection('users').doc(uid).get();
        const stored = userSnap.exists ? userSnap.data()?.personaInquiryId : null;
        if (typeof stored === 'string' && stored.trim()) inquiryId = stored.trim();
      }

      let inquiry = null;
      if (inquiryId) {
        const json = await fetchPersonaInquiry(apiKey, inquiryId);
        inquiry = json.data || null;
      } else {
        inquiry = await findInquiryByReferenceId(apiKey, uid);
        inquiryId = inquiry?.id || null;
      }
      if (!inquiry) {
        const email = decoded.email_verified ? decoded.email : null;
        if (email) {
          inquiry = await findInquiryByReferenceId(apiKey, email);
          inquiryId = inquiry?.id || null;
        }
      }

      if (!inquiry) {
        await writeVerification(db, uid, 'unverified', null);
        res.json({ status: 'unverified', inquiryId: null });
        return;
      }

      // An opened-but-untouched inquiry says nothing about the person; prefer any approved one.
      const untouched = (s) => s === 'created' || s === 'expired';
      if (untouched(inquiry.attributes?.status)) {
        const better = await findInquiryByReferenceId(apiKey, uid);
        if (better && mapPersonaStatus(better.attributes?.status) === 'verified') {
          inquiry = better;
          inquiryId = better.id || inquiryId;
        }
      }
      const raw = inquiry.attributes?.status;
      if (untouched(raw)) {
        const userSnap = await db.collection('users').doc(uid).get();
        const current = (userSnap.exists && userSnap.data()?.verificationStatus) || 'unverified';
        res.json({ status: current, inquiryId: inquiry.id || inquiryId, rawStatus: raw || null });
        return;
      }
      const status = mapPersonaStatus(raw);
      const id = inquiry.id || inquiryId;

      // The inquiry must belong to this account, or someone else's approved inquiry id could verify it.
      const refId = inquiry.attributes?.['reference-id'];
      const email = decoded.email_verified ? decoded.email : null;
      const refOk = refId === uid || Boolean(email && refId === email);
      if (!refOk) {
        res.status(403).json({ error: 'Inquiry does not belong to this account' });
        return;
      }

      const legalName = status === 'verified' ? personaName.legalNameFromInquiry(inquiry) : null;
      await writeVerification(db, uid, status, id, legalName);
      res.json({ status, inquiryId: id, rawStatus: raw || null, legalName });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Confirm failed',
      });
    }
  },
);

/**
 * Create a Persona inquiry for the signed-in user (API key stays on the server).
 * Body: { nameFirst?: string, birthdate?: 'YYYY-MM-DD' }
 * Env: PERSONA_API_KEY, optional PERSONA_TEMPLATE_ID.
 */
exports.createPersonaInquiry = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const apiKey = personaKey();
    if (!apiKey) {
      res.status(500).json({ error: 'PERSONA_API_KEY not configured on functions' });
      return;
    }
    const templateId = process.env.PERSONA_TEMPLATE_ID || 'itmpl_A8A6iSWHGeg1Ci8LNomZtWccCWWhhd';

    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const fields = {};
    if (typeof body.nameFirst === 'string' && body.nameFirst.trim()) {
      fields['name-first'] = body.nameFirst.trim().slice(0, 60);
    }
    if (typeof body.birthdate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birthdate)) {
      fields.birthdate = body.birthdate;
    }

    const personaRes = await fetch('https://api.withpersona.com/api/v1/inquiries', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Persona-Version': '2023-01-05',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            'inquiry-template-id': templateId,
            'reference-id': uid,
            ...(Object.keys(fields).length ? { fields } : {}),
          },
        },
      }),
    });
    const json = await personaRes.json().catch(() => ({}));
    const inquiryId = json?.data?.id;
    if (!personaRes.ok || !inquiryId) {
      console.error('Persona create error', json);
      res.status(502).json({
        error: json?.errors?.[0]?.details || json?.errors?.[0]?.title || 'Could not start Persona.',
      });
      return;
    }

    await getFirestore().collection('users').doc(uid).set(
      {
        personaInquiryId: inquiryId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    res.json({
      inquiryId,
      sessionToken: json?.meta?.['session-token'] || null,
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : 'Could not start Persona.',
    });
  }
});

function otpHash(code, salt) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function randomCode() {
  return String(require('crypto').randomInt(100000, 1000000));
}

async function requireUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const err = new Error('Missing auth');
    err.status = 401;
    throw err;
  }
  return getAuth().verifyIdToken(token);
}

/**
 * Email a 6-digit OTP via Resend.
 * Env: RESEND_API_KEY, optional RESEND_FROM (default DateToday <onboarding@resend.dev>)
 */
exports.sendEmailOtp = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const address = decoded.email;
    if (!address) {
      res.status(400).json({ error: 'No email on this account.' });
      return;
    }

    const db = getFirestore();
    await emailFlows.rateLimit(db, `verify|${uid}`, 6, 60 * 60 * 1000);

    const code = randomCode();
    const salt = require('crypto').randomBytes(16).toString('hex');
    const hash = otpHash(code, salt);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await db.collection('emailOtps').doc(uid).set({
      hash,
      salt,
      email: address,
      expiresAt,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    const sent = await email.sendEmail(db, { to: address, uid, category: 'security', ...email.T.verifyCode(code) });
    if (!sent.sent) {
      res.status(sent.reason === 'suppressed' ? 400 : 502).json({
        error:
          sent.reason === 'suppressed'
            ? 'We can’t deliver email to that address.'
            : 'Couldn’t send the code. Try again in a moment.',
      });
      return;
    }

    res.json({ result: { ok: true, email: address } });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : 'Send failed',
    });
  }
});

/**
 * Confirm email OTP and mark Firebase Auth emailVerified = true.
 * Body: { code: string }
 */
exports.confirmEmailOtp = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const code = String(req.body?.code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Enter the 6-digit code.' });
      return;
    }

    const db = getFirestore();
    const ref = db.collection('emailOtps').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(400).json({ error: 'No code pending. Tap Email me a code.' });
      return;
    }
    const data = snap.data() || {};
    if (Number(data.expiresAt) < Date.now()) {
      await ref.delete().catch(() => undefined);
      res.status(400).json({ error: 'That code expired. Request a new one.' });
      return;
    }
    const attempts = Number(data.attempts || 0);
    if (attempts >= 8) {
      await ref.delete().catch(() => undefined);
      res.status(429).json({ error: 'Too many attempts. Request a new code.' });
      return;
    }
    const expected = otpHash(code, data.salt);
    if (expected !== data.hash) {
      await ref.set({ attempts: attempts + 1 }, { merge: true });
      res.status(400).json({ error: 'That code is incorrect.' });
      return;
    }

    await getAuth().updateUser(uid, { emailVerified: true });
    await db.collection('users').doc(uid).set(
      {
        emailVerified: true,
        emailVerifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await ref.delete().catch(() => undefined);

    res.json({ result: { ok: true } });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : 'Verify failed',
    });
  }
});

/** POST JSON endpoint. Expected failures carry `status`; anything else is logged and hidden. */
function jsonEndpoint(handler, { signedIn = false } = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      let decoded = null;
      if (signedIn) {
        decoded = await requireUser(req).catch((error) => {
          throw Object.assign(new Error('Sign in again and retry.'), { status: error.status || 401 });
        });
      }
      res.json(await handler(req, { db: getFirestore(), auth: getAuth(), decoded }));
    } catch (error) {
      if (!error.status) console.error(error);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong. Try again.' });
    }
  };
}

exports.startEmailSignup = onRequest({ cors: true }, jsonEndpoint(emailFlows.startEmailSignup));
exports.confirmEmailSignup = onRequest({ cors: true }, jsonEndpoint(emailFlows.confirmEmailSignup));
exports.claimSignupEmail = onRequest({ cors: true }, jsonEndpoint(emailFlows.claimSignupEmail, { signedIn: true }));
exports.sendPasswordResetEmail = onRequest({ cors: true }, jsonEndpoint(emailFlows.sendPasswordReset));

exports.emailUnsubscribe = onRequest({ cors: false }, async (req, res) => {
  try {
    await emailFlows.emailUnsubscribe(req, res, { db: getFirestore() });
  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong. Change emails in DateToday › Settings › Notifications.');
  }
});

exports.resendWebhook = onRequest({ cors: false }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    await emailFlows.resendWebhook(req, res, { db: getFirestore() });
  } catch (error) {
    console.error(error);
    res.status(500).send('error');
  }
});

/** 6pm New York: "N people liked you" for members with unanswered hearts from the last day. */
exports.likesDigestDaily = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'America/New_York', timeoutSeconds: 540 },
  async () => {
    const result = await emailFlows.likesDigest({ db: getFirestore(), auth: getAuth() });
    console.info('likes digest', result);
  },
);

exports.onProfileCreatedEmail = onDocumentCreated('profiles/{uid}', async (event) => {
  await emailFlows
    .onProfileCreated(getFirestore(), getAuth(), event.params.uid, event.data && event.data.data())
    .catch((e) => console.error('welcome email failed', String(e)));
});

exports.onNotificationPrefsWritten = onDocumentWritten('notificationPrefs/{uid}', async (event) => {
  const before = event.data && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;
  await emailFlows
    .onEmailNewsChanged(getFirestore(), getAuth(), event.params.uid, before, after)
    .catch((e) => console.error('contact sync failed', String(e)));
});

// ---------------------------------------------------------------------------
// Push notifications (Expo push service) + interests / matches / chat
// ---------------------------------------------------------------------------

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function pairId(a, b) {
  return [a, b].sort().join('_');
}

async function publicProfile(db, uid) {
  const snap = await db.collection('profiles').doc(uid).get();
  const d = snap.exists ? snap.data() : {};
  return {
    displayName: (d && d.displayName) || 'Someone',
    mainPhotoUrl: (d && d.mainPhotoUrl) || null,
  };
}

async function isBlockedEitherWay(db, a, b) {
  const [ab, ba] = await Promise.all([
    db.collection('blocks').where('blockerId', '==', a).where('blockedId', '==', b).limit(1).get(),
    db.collection('blocks').where('blockerId', '==', b).where('blockedId', '==', a).limit(1).get(),
  ]);
  return !ab.empty || !ba.empty;
}

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

/** Android channel per push type. Must match ANDROID_CHANNELS in features/notifications/push.ts. */
const CHANNEL_FOR_TYPE = {
  message: 'messages',
  match: 'matches',
  interest: 'activity',
  date_proposal: 'dates',
  date_accepted: 'dates',
  date_declined: 'dates',
  reminder: 'dates',
  verification: 'system',
  security: 'system',
  promotion: 'promotions',
  live_ending: 'live',
  live_check: 'live',
  live_still: 'live',
  live_more: 'live',
  live_new_nearby: 'live',
};

/** Interactive actions (Reply / Mark as read). Must match MESSAGE_CATEGORY in features/notifications/actions.ts. */
const CATEGORY_FOR_TYPE = {
  message: 'message',
  // Stay Live / Go Offline. Must match LIVE_CATEGORY in features/notifications/actions.ts.
  live_ending: 'live_session',
  live_check: 'live_session',
};

/** Preference that gates each push type. Must match NotificationPrefKey in features/notifications/preferences.ts. */
const PREF_FOR_TYPE = {
  message: 'messages',
  match: 'matches',
  interest: 'likes',
  date_proposal: 'dateRequests',
  date_accepted: 'dateUpdates',
  date_declined: 'dateUpdates',
  reminder: 'reminders',
  promotion: 'promotions',
  live_ending: 'reminders',
  live_check: 'reminders',
  live_still: 'liveUpdates',
  live_more: 'liveUpdates',
  live_new_nearby: 'liveUpdates',
  // verification / security are always delivered.
};

const PREF_DEFAULTS = { promotions: false };

function expoHeaders() {
  const headers = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  // Only needed if "Enhanced push security" is turned on for the Expo account.
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return headers;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST to Expo with retries on network errors, 429 and 5xx. Returns parsed JSON or throws after the last try. */
async function expoPost(url, payload, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let retryable = true;
    try {
      const res = await fetch(url, { method: 'POST', headers: expoHeaders(), body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json;
      lastError = new Error(`Expo ${res.status}: ${JSON.stringify(json.errors || json).slice(0, 300)}`);
      retryable = res.status === 429 || res.status >= 500;
    } catch (error) {
      lastError = error;
    }
    if (!retryable || attempt === attempts) break;
    const wait = 500 * 3 ** (attempt - 1);
    console.warn(`Expo push retry ${attempt}/${attempts - 1} in ${wait}ms`, String(lastError));
    await sleep(wait);
  }
  throw lastError;
}

async function disableToken(ref, reason) {
  await ref.delete().catch(() => undefined);
  console.info('Removed invalid push token', ref.id, reason);
}

/**
 * Send messages (each tagged with its token doc ref) in chunks of 100.
 * Handles per-message ticket errors and stores ok tickets for receipt checks.
 */
async function sendExpoMessages(db, uid, type, entries) {
  const toRetry = [];
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    let json;
    try {
      json = await expoPost(EXPO_PUSH_URL, chunk.map((e) => e.message));
    } catch (error) {
      console.error('Expo push failed after retries', { uid, type, count: chunk.length, error: String(error) });
      continue;
    }
    const tickets = Array.isArray(json.data) ? json.data : [];
    const batch = db.batch();
    let writes = 0;
    await Promise.all(
      tickets.map(async (t, idx) => {
        const entry = chunk[idx];
        if (!t || !entry) return;
        if (t.status === 'ok' && t.id) {
          batch.set(db.collection('pushTickets').doc(t.id), {
            uid,
            type,
            tokenDocId: entry.ref.id,
            createdAt: FieldValue.serverTimestamp(),
          });
          writes += 1;
          return;
        }
        const code = t.details && t.details.error;
        if (code === 'DeviceNotRegistered') {
          await disableToken(entry.ref, 'ticket DeviceNotRegistered');
        } else if (code === 'MessageRateExceeded') {
          toRetry.push(entry);
        } else {
          console.error('Expo push ticket error', { uid, type, token: entry.ref.id, code, message: t.message });
        }
      }),
    );
    if (writes) await batch.commit().catch((e) => console.warn('pushTickets write failed', e));
  }
  return toRetry;
}

/**
 * Send one notification to every enabled device registered to `uid`,
 * unless they turned that type off. Never throws — a failed push must not
 * fail the user action that caused it.
 */
/** Seconds a push may wait for an offline phone. Chat must survive a phone that's off overnight. */
const TTL_FOR_TYPE = {
  message: 7 * 24 * 60 * 60,
  match: 7 * 24 * 60 * 60,
  date_proposal: 7 * 24 * 60 * 60,
  date_accepted: 7 * 24 * 60 * 60,
  date_declined: 7 * 24 * 60 * 60,
  interest: 2 * 24 * 60 * 60,
  // Live pushes are only useful right now; drop them rather than deliver late.
  live_ending: 15 * 60,
  live_check: 20 * 60,
  live_still: 20 * 60,
  live_more: 20 * 60,
  live_new_nearby: 20 * 60,
};
const DEFAULT_TTL = 12 * 60 * 60;

/** Sum of unread chats for the app icon badge. */
async function unreadTotal(db, uid) {
  try {
    const snap = await db.collection('matches').where('userIds', 'array-contains', uid).select('unread').get();
    return snap.docs.reduce((sum, d) => sum + Math.max(0, Number((d.get('unread') || {})[uid]) || 0), 0);
  } catch (e) {
    console.warn('unreadTotal failed', uid, e && e.message);
    return null;
  }
}

async function isHiddenFrom(db, uid, otherUid) {
  const snap = await db.collection('hiddenUsers').doc(uid).get();
  return snap.exists && (snap.get('uids') || []).includes(otherUid);
}

/**
 * Firestore triggers are at-least-once; a duplicate delivery must not double-count unread or
 * re-send a push. Read the marker with the transaction's other reads, then call markEvent.
 */
function eventMarker(db, eventId) {
  return db.collection('processedEvents').doc(eventId);
}

function markEvent(tx, ref) {
  tx.create(ref, {
    at: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

async function pushToUser(db, uid, { title, body, data, badge }, options = {}) {
  const type = (data && data.type) || 'system';
  try {
    const prefKey = PREF_FOR_TYPE[type];
    if (prefKey) {
      const prefsSnap = await db.collection('notificationPrefs').doc(uid).get();
      const prefs = prefsSnap.exists ? prefsSnap.data() : {};
      const enabled = typeof prefs[prefKey] === 'boolean' ? prefs[prefKey] : PREF_DEFAULTS[prefKey] !== false;
      if (!enabled) return;
    }

    const snap = await db.collection('pushTokens').where('uid', '==', uid).get();
    const docs = snap.docs.filter((d) => {
      const t = d.data();
      return (
        typeof t.token === 'string' &&
        t.enabled !== false &&
        d.id !== options.excludeTokenDocId &&
        (!options.platform || t.platform === options.platform)
      );
    });
    if (!docs.length) return;

    // Data-only: no banner or sound; the app's background task acts on it.
    const entries = docs.map((d) => ({
      ref: d.ref,
      message: options.silent
        ? { to: d.data().token, data: data || {}, priority: 'high', ttl: TTL_FOR_TYPE[type] || DEFAULT_TTL }
        : {
            to: d.data().token,
            title,
            body,
            data: data || {},
            sound: 'default',
            channelId: CHANNEL_FOR_TYPE[type] || 'system',
            ...(CATEGORY_FOR_TYPE[type] ? { categoryId: CATEGORY_FOR_TYPE[type] } : {}),
            priority: 'high',
            ttl: TTL_FOR_TYPE[type] || DEFAULT_TTL,
            ...(typeof badge === 'number' && badge >= 0 ? { badge } : {}),
          },
    }));

    const retry = await sendExpoMessages(db, uid, type, entries);
    if (retry.length) {
      await sleep(2000);
      await sendExpoMessages(db, uid, type, retry);
    }
  } catch (error) {
    console.error('pushToUser failed', { uid, type, error: String(error) });
  }
}

/**
 * Heart someone. Creates interests/{from}_{to}; if they already hearted back,
 * creates matches/{pair} and notifies. Body: { toUid }
 * Returns { mutual, matchId?, other? }.
 */
exports.sendInterest = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await requireUser(req);
    const fromUid = decoded.uid;
    const toUid = typeof req.body?.toUid === 'string' ? req.body.toUid.trim() : '';
    if (!toUid || toUid === fromUid || toUid.includes('/')) {
      res.status(400).json({ error: 'Invalid person.' });
      return;
    }

    const db = getFirestore();
    const toProfile = await db.collection('profiles').doc(toUid).get();
    if (!toProfile.exists) {
      res.status(404).json({ error: 'That profile is no longer available.' });
      return;
    }
    if (await isBlockedEitherWay(db, fromUid, toUid)) {
      res.status(403).json({ error: 'You can’t interact with this person.' });
      return;
    }

    const interestRef = db.collection('interests').doc(`${fromUid}_${toUid}`);
    const reverseRef = db.collection('interests').doc(`${toUid}_${fromUid}`);
    const matchId = pairId(fromUid, toUid);
    const matchRef = db.collection('matches').doc(matchId);

    // Free: one new match a day. Only a heart that completes a match counts.
    const [reverseNow, matchNow] = await Promise.all([reverseRef.get(), matchRef.get()]);
    if (reverseNow.exists && !matchNow.exists && !(await likes.isPlusUser(db, fromUid))) {
      const tz = Number(req.body && req.body.tzOffsetMinutes);
      const since = Number.isFinite(tz) ? likes.localDayStart(Date.now(), tz) : Date.now() - 24 * 3600 * 1000;
      const mine = await db.collection('matches').where('userIds', 'array-contains', fromUid).limit(500).get();
      const today = mine.docs.filter((d) => {
        const at = d.data().createdAt;
        return at && typeof at.toMillis === 'function' && at.toMillis() >= since;
      }).length;
      if (today >= 1) {
        res.status(403).json({
          error: 'Free includes 1 new match a day. Get DateToday+ for unlimited matches.',
          code: 'match_limit',
        });
        return;
      }
    }

    const [me, them] = await Promise.all([
      publicProfile(db, fromUid),
      publicProfile(db, toUid),
    ]);

    const outcome = await db.runTransaction(async (tx) => {
      const [existing, reverse, match, blockMine, blockTheirs, unmatched] = await Promise.all([
        tx.get(interestRef),
        tx.get(reverseRef),
        tx.get(matchRef),
        tx.get(db.collection('blocks').doc(`${fromUid}_${toUid}`)),
        tx.get(db.collection('blocks').doc(`${toUid}_${fromUid}`)),
        tx.get(db.collection('unmatches').doc(matchId)),
      ]);
      if (blockMine.exists || blockTheirs.exists || unmatched.exists) {
        throw Object.assign(new Error('You can’t interact with this person.'), { status: 403 });
      }
      if (!existing.exists) {
        tx.set(interestRef, {
          fromUid,
          toUid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      const mutual = reverse.exists;
      let createdMatch = false;
      if (mutual && !match.exists) {
        const userIds = [fromUid, toUid].sort();
        tx.set(matchRef, {
          userIds,
          users: { [fromUid]: me, [toUid]: them },
          createdAt: FieldValue.serverTimestamp(),
          lastActivityAt: FieldValue.serverTimestamp(),
          lastMessage: null,
          nextDate: null,
          unread: { [userIds[0]]: 0, [userIds[1]]: 0 },
        });
        createdMatch = true;
      }
      return { mutual, createdMatch, firstHeart: !existing.exists };
    });

    // Tells each person's app to refetch "Likes you" (the list itself is served by getLikes).
    const bumpInbox = (uid) =>
      db.collection('likeInbox').doc(uid)
        .set({ version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => undefined);
    if (outcome.createdMatch) await Promise.all([bumpInbox(fromUid), bumpInbox(toUid)]);
    else if (outcome.firstHeart) await bumpInbox(toUid);

    if (outcome.createdMatch) {
      await pushToUser(db, toUid, {
        title: 'It’s a match!',
        body: `You and ${me.displayName} are into each other. Say hey and plan tonight.`,
        data: { type: 'match', matchId, url: `/chat/${matchId}` },
      });
      await emailFlows
        .emailNewMatch(db, getAuth(), { uid: toUid, otherName: me.displayName, matchId })
        .catch((e) => console.warn('match email failed', String(e)));
    } else if (!outcome.mutual && outcome.firstHeart) {
      await pushToUser(db, toUid, {
        title: 'You’ve got a potential date',
        body: 'Someone near you tapped Interested. Heart them back to match.',
        data: { type: 'interest', url: '/likes' },
      });
    }

    res.json({
      mutual: outcome.mutual,
      created: outcome.createdMatch,
      matchId: outcome.mutual ? matchId : null,
      other: outcome.mutual ? { uid: toUid, ...them } : null,
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : 'Could not send interest.',
    });
  }
});

/**
 * "Likes you" for the signed-in member. DateToday+ (verified with RevenueCat) gets everyone;
 * free gets the oldest like plus blurred, identity-free thumbnails for the rest.
 * Query: ?fresh=1 re-checks the subscription (after a purchase or restore).
 */
exports.getLikes = onRequest({ cors: true, memory: '512MiB' }, async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const { uid } = await requireUser(req);
    const db = getFirestore();
    const fresh = req.query && (req.query.fresh === '1' || req.query.fresh === 'true');
    const [plus, rows] = await Promise.all([likes.isPlusUser(db, uid, { fresh }), likes.pendingLikes(db, uid)]);
    res.set('Cache-Control', 'private, no-store');
    res.json(await likes.buildLikes(db, rows, plus));
  } catch (error) {
    console.error('getLikes failed', error && error.message);
    res.status(error.status || 500).json({ error: 'Couldn’t load your likes right now.' });
  }
});

/**
 * Before Google/Apple sign-in. Body: { provider: 'google' | 'apple', idToken }.
 * Returns { action: 'signin' } or { action: 'link', methods } when the email already has a
 * DateToday account that should be logged into first so this sign-in gets linked, not swapped in.
 */
exports.authPrecheck = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json(
      await authLink.authPrecheck(getAuth(), req.body, {
        findInboxOwner: (address) => emailIdentity.findInboxOwner(getFirestore(), getAuth(), address),
      }),
    );
  } catch (error) {
    if (!error.status) console.error('authPrecheck failed', error && error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Try again.' });
  }
});

const REPORT_REASONS = new Set([
  'harassment', 'fake_profile', 'impersonation', 'scam_fraud', 'underage', 'sexual_content',
  'threatening', 'hate_speech', 'spam', 'inappropriate_offline', 'scam_spam',
  'inappropriate_content', 'safety_concern', 'no_show', 'other',
]);

function cleanString(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Last messages of a conversation, kept on the report so moderators still have context after the chat is deleted. */
async function conversationEvidence(db, matchId) {
  const snap = await db
    .collection('matches').doc(matchId).collection('messages')
    .orderBy('createdAt', 'desc').limit(200).get();
  return snap.docs.reverse().map((d) => {
    const m = d.data();
    return {
      senderId: m.senderId || null,
      type: m.type || 'text',
      text: typeof m.text === 'string' ? m.text.slice(0, 2000) : null,
      proposal: m.proposal ? proposalSummary(m.proposal) : null,
      createdAt: m.createdAt || null,
    };
  });
}

/**
 * Block (optionally + report). Removes both people from each other's app:
 * deletes the match + every message, deletes hearts both ways, and adds each
 * uid to the other's hiddenUsers list. sendInterest refuses blocked pairs, so
 * they can never match again. The blocked person is not notified.
 * Body: { targetUid, displayName?, report?: { reason, details? } }
 */
exports.blockUser = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const targetUid = typeof req.body?.targetUid === 'string' ? req.body.targetUid.trim() : '';
    if (!targetUid || targetUid === uid || targetUid.includes('/')) {
      res.status(400).json({ error: 'Invalid person.' });
      return;
    }
    const report = req.body?.report && typeof req.body.report === 'object' ? req.body.report : null;
    if (report && !REPORT_REASONS.has(report.reason)) {
      res.status(400).json({ error: 'Pick a reason for the report.' });
      return;
    }

    const db = getFirestore();
    const matchId = pairId(uid, targetUid);
    const matchRef = db.collection('matches').doc(matchId);
    const displayName = cleanString(req.body?.displayName, 80);

    const [targetProfile, existingMatch] = await Promise.all([
      db.collection('profiles').doc(targetUid).get(),
      matchRef.get(),
    ]);
    if (!targetProfile.exists && !existingMatch.exists) {
      res.status(404).json({ error: 'That profile is no longer available.' });
      return;
    }

    if (report) {
      const matchSnap = existingMatch;
      const evidence = matchSnap.exists ? await conversationEvidence(db, matchId) : [];
      await db.collection('reports').add({
        reporterId: uid,
        reportedId: targetUid,
        reason: report.reason,
        details: cleanString(report.details, 2000),
        matchId: matchSnap.exists ? matchId : null,
        dateId: null,
        contentType: evidence.length ? 'message' : 'profile',
        messageSnapshot: evidence,
        blocked: true,
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const batch = db.batch();
    batch.set(db.collection('blocks').doc(`${uid}_${targetUid}`), {
      blockerId: uid,
      blockedId: targetUid,
      displayName,
      reason: report ? report.reason : cleanString(req.body?.reason, 60),
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(
      db.collection('hiddenUsers').doc(uid),
      { uids: FieldValue.arrayUnion(targetUid), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    batch.set(
      db.collection('hiddenUsers').doc(targetUid),
      { uids: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    batch.delete(db.collection('interests').doc(`${uid}_${targetUid}`));
    batch.delete(db.collection('interests').doc(`${targetUid}_${uid}`));
    // Deleting the match doc with the block makes the rules' membership check fail immediately,
    // so no message can slip through while the subcollections are being removed.
    batch.delete(matchRef);
    await batch.commit();

    await db.recursiveDelete(matchRef).catch((e) => console.warn('block: message cleanup failed', matchId, e && e.message));

    res.json({ ok: true, matchId });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : 'Could not block.',
    });
  }
});

/**
 * Unblock. Both people become visible to each other again unless the other
 * person has also blocked. The old match and chat stay deleted.
 * Body: { targetUid }
 */
exports.unblockUser = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const targetUid = typeof req.body?.targetUid === 'string' ? req.body.targetUid.trim() : '';
    if (!targetUid || targetUid === uid || targetUid.includes('/')) {
      res.status(400).json({ error: 'Invalid person.' });
      return;
    }
    const db = getFirestore();
    const mine = await db
      .collection('blocks').where('blockerId', '==', uid).where('blockedId', '==', targetUid).get();
    const theirs = await db
      .collection('blocks').where('blockerId', '==', targetUid).where('blockedId', '==', uid).limit(1).get();

    const batch = db.batch();
    mine.docs.forEach((d) => batch.delete(d.ref));
    if (theirs.empty) {
      batch.set(
        db.collection('hiddenUsers').doc(uid),
        { uids: FieldValue.arrayRemove(targetUid), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      batch.set(
        db.collection('hiddenUsers').doc(targetUid),
        { uids: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await batch.commit();
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : 'Could not unblock.',
    });
  }
});

/**
 * Unmatch: ends the match for both people without a block. Deletes the chat and both hearts,
 * hides them from each other, and sendInterest refuses the pair so they can't rematch.
 * The other person isn't notified. Body: { matchId }
 */
exports.unmatchUser = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const matchId = typeof req.body?.matchId === 'string' ? req.body.matchId.trim() : '';
    if (!matchId || matchId.includes('/')) {
      res.status(400).json({ error: 'Invalid match.' });
      return;
    }

    const db = getFirestore();
    const matchRef = db.collection('matches').doc(matchId);
    const matchSnap = await matchRef.get();
    const userIds = matchSnap.exists ? matchSnap.data().userIds || [] : [];
    if (!userIds.includes(uid)) {
      // Already gone (or never theirs) — treat as done so retries are harmless.
      res.json({ ok: true, matchId });
      return;
    }
    const otherUid = userIds.find((u) => u !== uid);

    const batch = db.batch();
    batch.set(db.collection('unmatches').doc(matchId), {
      userIds,
      by: uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (otherUid) {
      batch.delete(db.collection('interests').doc(`${uid}_${otherUid}`));
      batch.delete(db.collection('interests').doc(`${otherUid}_${uid}`));
      batch.set(
        db.collection('hiddenUsers').doc(uid),
        { uids: FieldValue.arrayUnion(otherUid), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      batch.set(
        db.collection('hiddenUsers').doc(otherUid),
        { uids: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    batch.delete(matchRef);
    await batch.commit();

    await db.recursiveDelete(matchRef).catch((e) => console.warn('unmatch: message cleanup failed', matchId, e && e.message));
    res.json({ ok: true, matchId });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: 'Couldn’t unmatch. Try again.' });
  }
});

/** Keep the name/photo cached on each match (inbox, chat header, push titles) in sync with the profile. */
exports.onProfileCardChanged = onDocumentUpdated('profiles/{uid}', async (event) => {
  const before = event.data && event.data.before.data();
  const after = event.data && event.data.after.data();
  if (!before || !after) return;
  if (before.displayName === after.displayName && before.mainPhotoUrl === after.mainPhotoUrl) return;
  const { uid } = event.params;
  const db = getFirestore();
  const matches = await db.collection('matches').where('userIds', 'array-contains', uid).get();
  if (matches.empty) return;
  const writer = db.bulkWriter();
  const card = {
    displayName: after.displayName || 'Someone',
    mainPhotoUrl: after.mainPhotoUrl || null,
  };
  matches.docs.forEach((d) => writer.update(d.ref, { [`users.${uid}`]: card }));
  await writer.close();
});

const PROMO_CAP_MS = 20 * 60 * 60 * 1000;

function secretMatches(given, expected) {
  if (typeof given !== 'string' || !expected || expected.length < 24) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

/**
 * Marketing broadcast to people who opted in to "Tonight nudges & offers"
 * (notificationPrefs.promotions == true — App Store 4.5.4). At most one per
 * person every 20h. Owner-only: header x-broadcast-key must equal BROADCAST_SECRET.
 * Body: { title, body, url?, send?: boolean } — without send:true it's a dry run.
 */
exports.broadcastPush = onRequest({ cors: false, timeoutSeconds: 540 }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    if (!secretMatches(req.headers['x-broadcast-key'], process.env.BROADCAST_SECRET)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const title = cleanString(req.body?.title, 65);
    const body = cleanString(req.body?.body, 178);
    const url = cleanString(req.body?.url, 200) || '/(tabs)/live';
    if (!title || !body || !url.startsWith('/')) {
      res.status(400).json({ error: 'title, body required; url must start with /' });
      return;
    }
    const send = req.body?.send === true;

    const db = getFirestore();
    const optedIn = await db.collection('notificationPrefs').where('promotions', '==', true).get();
    const now = Date.now();
    const audience = [];
    let capped = 0;
    let noDevice = 0;
    for (const prefDoc of optedIn.docs) {
      const uid = prefDoc.id;
      const [log, tokens] = await Promise.all([
        db.collection('promoLog').doc(uid).get(),
        db.collection('pushTokens').where('uid', '==', uid).get(),
      ]);
      const last = log.exists && log.data().lastSentAt ? log.data().lastSentAt.toMillis() : 0;
      if (now - last < PROMO_CAP_MS) capped += 1;
      else if (!tokens.docs.some((d) => d.data().enabled !== false)) noDevice += 1;
      else audience.push(uid);
    }

    const summary = { optedIn: optedIn.size, willReceive: audience.length, capped, noDevice, send };
    if (!send) {
      res.json({ dryRun: true, ...summary });
      return;
    }

    for (let i = 0; i < audience.length; i += 20) {
      await Promise.all(
        audience.slice(i, i + 20).map(async (uid) => {
          await pushToUser(db, uid, { title, body, data: { type: 'promotion', url } });
          await db.collection('promoLog').doc(uid).set({ lastSentAt: FieldValue.serverTimestamp() });
        }),
      );
    }
    await db.collection('broadcasts').add({
      title,
      body,
      url,
      ...summary,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.json({ dryRun: false, ...summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Broadcast failed.' });
  }
});

/**
 * Reply / Mark as read straight from a message notification. Runs while the app
 * is backgrounded, so it's one HTTPS call instead of a Firestore session.
 * Body: { matchId, text? } — replying also marks the chat read.
 */
exports.notificationAction = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const decoded = await requireUser(req);
    const uid = decoded.uid;
    const matchId = typeof req.body?.matchId === 'string' ? req.body.matchId.trim() : '';
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!matchId || matchId.includes('/') || text.length > 2000) {
      res.status(400).json({ error: 'Invalid request.' });
      return;
    }

    const db = getFirestore();
    const matchRef = db.collection('matches').doc(matchId);
    const [matchSnap, userSnap] = await Promise.all([
      matchRef.get(),
      db.collection('users').doc(uid).get(),
    ]);
    if (!matchSnap.exists || !(matchSnap.data().userIds || []).includes(uid)) {
      res.status(404).json({ error: 'This chat is no longer available.' });
      return;
    }
    const otherUid = (matchSnap.data().userIds || []).find((u) => u !== uid);
    if (text && otherUid && (await isHiddenFrom(db, uid, otherUid))) {
      res.status(404).json({ error: 'This chat is no longer available.' });
      return;
    }

    if (text) {
      const payload = { senderId: uid, type: 'text', text, createdAt: FieldValue.serverTimestamp() };
      const clientId = typeof req.body?.clientMessageId === 'string' ? req.body.clientMessageId : '';
      if (/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) {
        // A retried reply (lost response) must not post twice.
        await matchRef.collection('messages').doc(clientId).create(payload).catch((e) => {
          if (e && e.code !== 6) throw e;
        });
      } else {
        await matchRef.collection('messages').add(payload);
      }
    }

    const receiptsOn = userSnap.exists
      ? (userSnap.data().privacyControls || {}).readReceipts !== false
      : true;
    await Promise.all([
      matchRef.update({ [`unread.${uid}`]: 0 }),
      receiptsOn
        ? matchRef.collection('members').doc(uid).set(
            { lastReadAt: FieldValue.serverTimestamp(), typingAt: null },
            { merge: true },
          )
        : null,
    ]);

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : 'Could not complete that.',
    });
  }
});

function proposalSummary(p) {
  if (!p || typeof p !== 'object') return 'a date';
  return [p.activityLabel || p.activity, p.whenLabel, p.venueName].filter(Boolean).join(' · ') || 'a date';
}

const FAST_REPLY_MS = 15 * 60 * 1000;

/**
 * Public, server-owned signals for Discover status tags (userStats/{uid}; clients can't write).
 * Only the first message after the other person's counts as a reply.
 */
async function recordReplySpeed(db, matchRef, messageId, msg, otherId) {
  const createdAt = msg.createdAt && msg.createdAt.toMillis ? msg.createdAt.toMillis() : Date.now();
  const recent = await matchRef.collection('messages').orderBy('createdAt', 'desc').limit(3).get();
  const prev = recent.docs.find((d) => d.id !== messageId);
  if (!prev) return;
  const p = prev.data();
  if (p.senderId !== otherId || !p.createdAt || !p.createdAt.toMillis) return;
  const delay = createdAt - p.createdAt.toMillis();
  if (delay < 0) return;
  await db.collection('userStats').doc(msg.senderId).set(
    {
      replies: FieldValue.increment(1),
      fastReplies: FieldValue.increment(delay <= FAST_REPLY_MS ? 1 : 0),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Authoritative join date (Auth creation time) in userStats for "New here". */
async function ensureJoinedAt(uid) {
  const db = getFirestore();
  const ref = db.collection('userStats').doc(uid);
  const snap = await ref.get();
  if (snap.exists && snap.data().joinedAt) return;
  try {
    const user = await getAuth().getUser(uid);
    const created = Date.parse(user.metadata.creationTime);
    if (!Number.isFinite(created)) return;
    await ref.set(
      { joinedAt: Timestamp.fromMillis(created), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.warn('joinedAt failed', uid, e && e.message);
  }
}

exports.onLiveSessionStarted = onDocumentWritten('liveSessions/{uid}', async (event) => {
  const before = event.data && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after.exists ? event.data.after.data() : null;
  if (event.data) await geo.syncGeohash(event.data.after);
  if (!after || after.status !== 'active') return;
  if (before && before.status === 'active' && before.startedAt === after.startedAt) return;
  await ensureJoinedAt(event.params.uid);
  // Stay Live re-activations keep startedAt, so only a real new session fans out.
  if (before && before.startedAt === after.startedAt) return;
  try {
    await liveEngagement.notifyNewLiveNearby({
      db: getFirestore(),
      FieldValue,
      pushToUser,
      isHiddenFrom,
      uid: event.params.uid,
      session: after,
    });
  } catch (e) {
    console.warn('notifyNewLiveNearby failed', event.params.uid, e && e.message);
  }
});

/** Stay Live / Go Offline from a notification action or the app. Body: { action: 'stay'|'offline', nonce? } */
exports.liveAction = onRequest({ cors: true }, (req, res) =>
  liveEngagement.liveAction(req, res, { db: getFirestore(), FieldValue, requireUser }),
);

/** Expires stale Live sessions and sends throttled Live check-ins. */
exports.liveEngagementSweep = onSchedule({ schedule: 'every 10 minutes', timeoutSeconds: 300 }, async () => {
  const result = await liveEngagement.liveEngagementSweep({ db: getFirestore(), FieldValue, pushToUser });
  if (result.sent) console.info('liveEngagementSweep', result);
});

exports.onNearbyProfileCreated = onDocumentCreated('nearbyProfiles/{uid}', async (event) => {
  await ensureJoinedAt(event.params.uid);
});

exports.onNearbyProfileWritten = onDocumentWritten('nearbyProfiles/{uid}', async (event) => {
  if (event.data) await geo.syncGeohash(event.data.after);
});

/** New chat message → update match preview/unread and notify the other person. */
exports.onMatchMessageCreated = onDocumentCreated(
  'matches/{matchId}/messages/{messageId}',
  async (event) => {
    const msg = event.data && event.data.data();
    if (!msg) return;
    const { matchId, messageId } = event.params;
    const db = getFirestore();
    const matchRef = db.collection('matches').doc(matchId);
    const senderId = msg.senderId;
    const isProposal = msg.type === 'date_proposal';
    const preview = (isProposal
      ? `Date idea: ${proposalSummary(msg.proposal)}`
      : String(msg.text || '')
    ).slice(0, 140);
    const sentAt = msg.createdAt && msg.createdAt.toMillis ? msg.createdAt : Timestamp.now();

    const outcome = await db.runTransaction(async (tx) => {
      const marker = eventMarker(db, event.id);
      const [markSnap, matchSnap] = await Promise.all([tx.get(marker), tx.get(matchRef)]);
      if (markSnap.exists || !matchSnap.exists) return null;
      const match = matchSnap.data();
      const otherId = (match.userIds || []).find((u) => u !== senderId);
      if (!otherId || !(match.userIds || []).includes(senderId)) return null;

      // Triggers can run out of order; never let an older message replace a newer preview.
      const current = match.lastMessage;
      const currentMs = current && current.createdAt && current.createdAt.toMillis ? current.createdAt.toMillis() : 0;
      const update = { [`unread.${otherId}`]: FieldValue.increment(1) };
      if (sentAt.toMillis() >= currentMs) {
        update.lastMessage = { text: preview, senderId, type: msg.type || 'text', messageId, createdAt: sentAt };
        update.lastActivityAt = sentAt;
      }
      markEvent(tx, marker);
      tx.update(matchRef, update);
      return { match, otherId };
    });
    if (!outcome) return;
    const { match, otherId } = outcome;

    await recordReplySpeed(db, matchRef, messageId, msg, otherId).catch((e) =>
      console.warn('recordReplySpeed failed', e && e.message),
    );

    if (await isHiddenFrom(db, otherId, senderId)) return;

    const senderName = match.users?.[senderId]?.displayName || 'Your match';
    const badge = await unreadTotal(db, otherId);
    await pushToUser(db, otherId, isProposal
      ? {
          title: `${senderName} wants to plan a date`,
          body: proposalSummary(msg.proposal).slice(0, 140),
          data: { type: 'date_proposal', matchId, url: `/chat/${matchId}` },
          badge,
        }
      : {
          title: senderName,
          body: preview,
          data: { type: 'message', matchId, url: `/chat/${matchId}` },
          badge,
        });
  },
);

/** Date proposal answered → notify the proposer; accepted dates show on the match. */
exports.onMatchMessageUpdated = onDocumentUpdated(
  'matches/{matchId}/messages/{messageId}',
  async (event) => {
    const before = event.data && event.data.before.data();
    const after = event.data && event.data.after.data();
    if (!before || !after || after.type !== 'date_proposal') return;
    if (before.status === after.status) return;
    if (after.status !== 'accepted' && after.status !== 'declined') return;

    const { matchId, messageId } = event.params;
    const db = getFirestore();
    const matchRef = db.collection('matches').doc(matchId);
    const proposerId = after.senderId;
    const responderId = after.respondedBy;
    const summary = proposalSummary(after.proposal).slice(0, 140);
    const accepted = after.status === 'accepted';

    const match = await db.runTransaction(async (tx) => {
      const marker = eventMarker(db, event.id);
      const [markSnap, matchSnap] = await Promise.all([tx.get(marker), tx.get(matchRef)]);
      if (markSnap.exists || !matchSnap.exists) return null;
      markEvent(tx, marker);
      tx.update(matchRef, {
        lastMessage: {
          text: accepted ? `It’s a date: ${summary}` : 'Date idea declined',
          senderId: responderId,
          type: 'date_response',
          messageId,
          createdAt: Timestamp.now(),
        },
        lastActivityAt: FieldValue.serverTimestamp(),
        [`unread.${proposerId}`]: FieldValue.increment(1),
        ...(accepted
          ? {
              nextDate: {
                ...after.proposal,
                messageId,
                proposerId,
                acceptedAt: FieldValue.serverTimestamp(),
              },
            }
          : {}),
      });
      return matchSnap.data();
    });
    if (!match) return;
    const responderName = match.users?.[responderId]?.displayName || 'Your match';

    if (accepted) {
      const stamp = { lastPlanAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      await Promise.all(
        [proposerId, responderId]
          .filter(Boolean)
          .map((uid) => db.collection('userStats').doc(uid).set(stamp, { merge: true })),
      ).catch((e) => console.warn('lastPlanAt failed', e && e.message));
    }

    await pushToUser(db, proposerId, {
      title: accepted ? `${responderName} said yes!` : `${responderName} passed on that plan`,
      body: accepted ? `It’s a date: ${summary}` : 'Suggest another time or place in the chat.',
      data: { type: accepted ? 'date_accepted' : 'date_declined', matchId, url: `/chat/${matchId}` },
      badge: await unreadTotal(db, proposerId),
    });
  },
);

/**
 * Expo push receipts: ~15 min after sending, check each ticket's delivery result.
 * Dead tokens (DeviceNotRegistered) are removed; other failures are logged.
 */
exports.processPushReceipts = onSchedule(
  { schedule: 'every 15 minutes', timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - 15 * 60 * 1000);
    const giveUpBefore = Date.now() - 24 * 60 * 60 * 1000;
    const snap = await db
      .collection('pushTickets')
      .where('createdAt', '<=', cutoff)
      .orderBy('createdAt')
      .limit(900)
      .get();
    if (snap.empty) return;

    let ok = 0;
    let failed = 0;
    let removed = 0;
    for (let i = 0; i < snap.docs.length; i += 300) {
      const docs = snap.docs.slice(i, i + 300);
      let json;
      try {
        json = await expoPost(EXPO_RECEIPTS_URL, { ids: docs.map((d) => d.id) });
      } catch (error) {
        console.error('Expo getReceipts failed after retries', String(error));
        continue;
      }
      const receipts = (json && json.data) || {};
      const batch = db.batch();
      for (const d of docs) {
        const ticket = d.data();
        const receipt = receipts[d.id];
        if (!receipt) {
          // Not ready yet — Expo keeps receipts for 24h.
          if (ticket.createdAt && ticket.createdAt.toMillis() < giveUpBefore) batch.delete(d.ref);
          continue;
        }
        if (receipt.status === 'ok') {
          ok += 1;
        } else {
          failed += 1;
          const code = receipt.details && receipt.details.error;
          if (code === 'DeviceNotRegistered' && ticket.tokenDocId) {
            await disableToken(db.collection('pushTokens').doc(ticket.tokenDocId), 'receipt DeviceNotRegistered');
            removed += 1;
          } else {
            console.error('Expo push receipt error', {
              uid: ticket.uid,
              type: ticket.type,
              token: ticket.tokenDocId,
              code,
              message: receipt.message,
            });
          }
        }
        batch.delete(d.ref);
      }
      await batch.commit();
    }
    console.info('Push receipts processed', { checked: snap.size, ok, failed, removed });
  },
);

/** Persona result landed (server or client write) → tell the user. */
exports.onUserVerificationChanged = onDocumentUpdated('users/{uid}', async (event) => {
  const before = (event.data && event.data.before.data()) || {};
  const after = (event.data && event.data.after.data()) || {};
  await emailFlows
    .onProvidersChanged(getFirestore(), getAuth(), event.params.uid, before, after, event.id)
    .catch((e) => console.error('sign-in method alert failed', String(e)));
  const next = after.verificationStatus;
  if (before.verificationStatus === next) return;
  // Public cards copy the badge when written; keep them current without waiting for a re-publish.
  const db = getFirestore();
  await Promise.all(
    ['liveSessions', 'nearbyProfiles'].map(async (col) => {
      const ref = db.collection(col).doc(event.params.uid);
      const snap = await ref.get();
      if (snap.exists) await ref.update({ verificationStatus: next || 'unverified' });
    }),
  ).catch((e) => console.warn('verification mirror failed', e && e.message));
  if (next !== 'verified' && next !== 'failed') return;
  const verified = next === 'verified';
  await pushToUser(getFirestore(), event.params.uid, {
    title: verified ? 'You’re verified ✓' : 'Verification didn’t go through',
    body: verified
      ? 'Your profile now shows the VERIFIED badge.'
      : 'Open DateToday to try again — it only takes a minute.',
    data: { type: 'verification', status: next, url: '/settings/verification' },
  });
});

const QUIZ = require('./quizQuestions.json');
const { findHotPlaces } = require('./hotPlaces');
const QUIZ_LEVEL_NAMES = Object.fromEntries(QUIZ.levels.map((l) => [l.level, l.name]));

function readQuiz(userData) {
  const q = userData && userData.quiz;
  if (!q || typeof q !== 'object' || !q.answers || typeof q.answers !== 'object') return null;
  const level = Number(q.level) || 0;
  if (level < 1) return null;
  return { answers: q.answers, level, updatedAt: Number(q.updatedAt) || 0 };
}

/** 35–98%: identical answers score high, opposite ends of a scale score low, weighted by importance. */
function scoreQuiz(mine, theirs, level) {
  let total = 0;
  let weights = 0;
  const pairs = [];
  for (const q of QUIZ.questions) {
    if (q.level > level) continue;
    const a = mine.answers[q.id];
    const b = theirs.answers[q.id];
    const n = q.options.length;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) continue;
    const sim = q.kind === 'pick' ? (a === b ? 1 : 0.35) : 1 - Math.abs(a - b) / (n - 1);
    total += sim * q.weight;
    weights += q.weight;
    pairs.push({ question: q.text, a: q.options[a], b: q.options[b], same: a === b });
  }
  if (!weights) return null;
  return { percent: Math.round(35 + 63 * (total / weights)), pairs };
}

function fallbackSummary(score) {
  const same = score.pairs.filter((p) => p.same).length;
  const headline =
    score.percent >= 85 ? 'Seriously in sync' : score.percent >= 70 ? 'Strong match' : score.percent >= 55 ? 'Good chemistry potential' : 'Opposites attract?';
  return {
    headline,
    summary: `You answered ${same} of ${score.pairs.length} questions the same way.`,
  };
}

async function aiSummary(score, levelName) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const lines = score.pairs.map((p) => `- ${p.question} A: ${p.a} | B: ${p.b}`).join('\n');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write short, warm compatibility summaries for a dating app. Both people will read it. ' +
              'Reply as JSON: {"percent": integer, "headline": string, "summary": string}. ' +
              `percent must stay within 8 points of the base score. headline: at most 5 words. ` +
              'summary: at most 2 short sentences addressed to both as "you two", naming one thing you share and, if any, one gentle difference. ' +
              'No emojis, no quoting the questions, nothing negative about either person.',
          },
          { role: 'user', content: `Quiz level: ${levelName}\nBase score: ${score.percent}%\nAnswers:\n${lines}` },
        ],
      }),
    });
    if (!res.ok) {
      console.warn('OpenAI compatibility failed', res.status);
      return null;
    }
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
    const percent = Math.round(Number(parsed.percent));
    return {
      percent: Number.isFinite(percent)
        ? Math.max(score.percent - 8, Math.min(score.percent + 8, Math.min(99, percent)))
        : score.percent,
      headline: String(parsed.headline || '').slice(0, 60),
      summary: String(parsed.summary || '').slice(0, 280),
    };
  } catch (error) {
    console.warn('OpenAI compatibility error', error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Match % between the caller and another person, from both of their compatibility quizzes. */
exports.getCompatibility = onRequest({ cors: true }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const { uid } = await requireUser(req);
    const otherUid = typeof req.body?.otherUid === 'string' ? req.body.otherUid.trim() : '';
    if (!otherUid || otherUid === uid || otherUid.includes('/')) {
      res.status(400).json({ error: 'Invalid person.' });
      return;
    }
    const db = getFirestore();
    if (await isBlockedEitherWay(db, uid, otherUid)) {
      res.status(403).json({ error: 'You can’t interact with this person.' });
      return;
    }
    const [meSnap, themSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('users').doc(otherUid).get(),
    ]);
    const mine = readQuiz(meSnap.data());
    const theirs = readQuiz(themSnap.data());
    if (!mine || !theirs) {
      res.json({ available: false, missing: !mine ? 'you' : 'them' });
      return;
    }

    const level = Math.min(mine.level, theirs.level);
    const [lowUid] = [uid, otherUid].sort();
    const sig = lowUid === uid ? `${mine.updatedAt}_${theirs.updatedAt}_${level}` : `${theirs.updatedAt}_${mine.updatedAt}_${level}`;
    const ref = db.collection('compatibility').doc(pairId(uid, otherUid));
    const cached = await ref.get();
    const levelName = QUIZ_LEVEL_NAMES[level] || 'Quick';
    const reply = (d) =>
      res.json({
        available: true,
        percent: d.percent,
        headline: d.headline,
        summary: d.summary,
        level,
        levelName,
        myLevel: mine.level,
        theirLevel: theirs.level,
      });
    if (cached.exists && cached.data().sig === sig) {
      reply(cached.data());
      return;
    }

    const score = scoreQuiz(mine, theirs, level);
    if (!score) {
      res.json({ available: false, missing: 'them' });
      return;
    }
    const ai = await aiSummary(score, levelName);
    const fallback = fallbackSummary(score);
    const result = {
      percent: ai ? ai.percent : score.percent,
      headline: (ai && ai.headline) || fallback.headline,
      summary: (ai && ai.summary) || fallback.summary,
    };
    await ref.set({
      ...result,
      sig,
      level,
      userIds: [uid, otherUid].sort(),
      ai: Boolean(ai),
      updatedAt: FieldValue.serverTimestamp(),
    });
    reply(result);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: 'Couldn’t check compatibility right now.' });
  }
});

// ---------------------------------------------------------------------------
// Place search for Make a plan. Google Places when GOOGLE_PLACES_API_KEY is set,
// otherwise OpenStreetMap (Overpass for nearby, Photon for search). Cached ~1 km / 24 h.

const PLACE_UA = 'DateToday/1.0 (support@datetoday.app)';
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const PLACE_CATEGORIES = ['drinks', 'dinner', 'coffee', 'activity'];

const OSM_FILTERS = {
  drinks: ['["amenity"~"^(bar|pub|biergarten)$"]'],
  dinner: ['["amenity"="restaurant"]'],
  coffee: ['["amenity"="cafe"]', '["shop"="coffee"]'],
  activity: [
    '["leisure"~"^(bowling_alley|miniature_golf|escape_game|amusement_arcade|trampoline_park)$"]',
    '["amenity"~"^(cinema|theatre|arts_centre)$"]',
    '["tourism"~"^(museum|gallery|aquarium|zoo)$"]',
  ],
};

const GOOGLE_TYPES = {
  drinks: ['bar', 'wine_bar', 'pub'],
  dinner: ['restaurant'],
  coffee: ['cafe', 'coffee_shop'],
  activity: ['bowling_alley', 'movie_theater', 'museum', 'art_gallery', 'amusement_center'],
};
const GOOGLE_CUISINE = {
  italian: 'italian_restaurant',
  mexican: 'mexican_restaurant',
  sushi: 'sushi_restaurant',
  steakhouse: 'steak_house',
  american: 'american_restaurant',
  seafood: 'seafood_restaurant',
};

const PLACE_KIND = {
  bar: 'Bar', pub: 'Pub', biergarten: 'Beer garden', restaurant: 'Restaurant', cafe: 'Café', coffee: 'Coffee',
  bowling_alley: 'Bowling', miniature_golf: 'Mini golf', escape_game: 'Escape room', amusement_arcade: 'Arcade',
  trampoline_park: 'Trampoline park', cinema: 'Cinema', theatre: 'Theatre', arts_centre: 'Arts center',
  museum: 'Museum', gallery: 'Gallery', aquarium: 'Aquarium', zoo: 'Zoo', nightclub: 'Club',
};

async function placeFetch(url, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': PLACE_UA, ...(init.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function osmPlace(e) {
  const t = e.tags || {};
  if (!t.name) return null;
  const lat = e.lat != null ? e.lat : e.center && e.center.lat;
  const lng = e.lon != null ? e.lon : e.center && e.center.lon;
  if (lat == null || lng == null) return null;
  const kindKey = t.amenity || t.leisure || t.tourism || t.shop || '';
  return {
    id: `osm-${e.type}-${e.id}`,
    name: t.name,
    address: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || null,
    area: t['addr:suburb'] || t['addr:neighbourhood'] || t['addr:city'] || null,
    lat,
    lng,
    kind: PLACE_KIND[kindKey] || (t.cuisine ? t.cuisine.split(';')[0].replace(/_/g, ' ') : null),
    rating: null,
  };
}

/** All public mirrors at once; first good answer wins (they go down or crawl independently). */
async function overpass(query, timeoutMs = 10000) {
  return Promise.any(
    OVERPASS_URLS.map((url) =>
      placeFetch(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        },
        timeoutMs,
      ).then((json) => (json.elements || []).map(osmPlace).filter(Boolean)),
    ),
  ).catch((error) => {
    throw new Error((error.errors || []).map((e) => e.message).join('; ') || 'Overpass unavailable');
  });
}

async function osmNearby(lat, lng, category, cuisine) {
  const cuisineFilter =
    category === 'dinner' && cuisine && cuisine !== 'anything'
      ? `["cuisine"~"${String(cuisine).replace(/[^a-z_]/gi, '')}",i]`
      : '';
  const run = (radius) =>
    overpass(
      `[out:json][timeout:12];(${OSM_FILTERS[category]
        .map((f) => `nwr(around:${radius},${lat},${lng})${f}${cuisineFilter}["name"];`)
        .join('')});out center 80;`,
    );
  // Photon runs alongside so a slow/down Overpass doesn't leave people with nothing.
  const photon = photonNearby(lat, lng, category, cuisine).catch(() => []);
  try {
    const close = await run(3000);
    if (close.length >= 5) return close;
    const wider = await run(9000).catch(() => []);
    const best = wider.length > close.length ? wider : close;
    return best.length >= 5 ? best : [...best, ...(await photon)];
  } catch (error) {
    console.warn('Overpass failed, using Photon', error.message);
    return photon;
  }
}

// Photon only matches names containing the word, so this is a thinner fallback for when Overpass is down.
const PHOTON_NEARBY = {
  drinks: [['bar', ['amenity:bar', 'amenity:pub']], ['pub', ['amenity:pub', 'amenity:bar']], ['lounge', ['amenity:bar']]],
  dinner: [['restaurant', ['amenity:restaurant']], ['grill', ['amenity:restaurant']], ['kitchen', ['amenity:restaurant']]],
  coffee: [['coffee', ['amenity:cafe']], ['cafe', ['amenity:cafe']]],
  activity: [['bowling', ['leisure:bowling_alley']], ['cinema', ['amenity:cinema']], ['museum', ['tourism:museum']], ['arcade', ['leisure:amusement_arcade']]],
};

async function photonNearby(lat, lng, category, cuisine) {
  const terms = [...PHOTON_NEARBY[category]];
  if (category === 'dinner' && cuisine && cuisine !== 'anything') terms.unshift([cuisine, ['amenity:restaurant']]);
  const lists = await Promise.all(
    terms.map(([q, tags]) => {
      const url = new URL('https://photon.komoot.io/api/');
      url.searchParams.set('q', q);
      tags.forEach((t) => url.searchParams.append('osm_tag', t));
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('zoom', '16');
      url.searchParams.set('location_bias_scale', '0.05');
      url.searchParams.set('limit', '15');
      url.searchParams.set('bbox', [lng - 0.12, lat - 0.1, lng + 0.12, lat + 0.1].join(','));
      return placeFetch(url.toString(), {}, 12000)
        .then((json) =>
          (json.features || []).map((f) => {
            const p = f.properties || {};
            const [plng, plat] = (f.geometry && f.geometry.coordinates) || [];
            return {
              id: `photon-${p.osm_type}-${p.osm_id}`,
              name: String(p.name || ''),
              address: [p.housenumber, p.street].filter(Boolean).join(' ') || null,
              area: p.district || p.locality || p.city || null,
              lat: plat == null ? null : plat,
              lng: plng == null ? null : plng,
              kind: PLACE_KIND[String(p.osm_value)] || null,
              rating: null,
            };
          }),
        )
        .catch(() => []);
    }),
  );
  return lists.flat().filter((p) => p.name);
}

async function osmSearch(q, lat, lng) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '12');
  url.searchParams.set('lang', 'en');
  const hasLoc = lat != null && lng != null;
  if (hasLoc) {
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '14');
    url.searchParams.set('location_bias_scale', '0.1');
    url.searchParams.set('bbox', [lng - 0.35, lat - 0.3, lng + 0.35, lat + 0.3].join(','));
  }
  const pattern = q.replace(/[^\p{L}\p{N} &'-]/gu, '').trim();
  const around = hasLoc ? `around:12000,${lat},${lng}` : null;
  const [photon, near] = await Promise.all([
    placeFetch(url.toString(), {}, 8000).catch(() => ({ features: [] })),
    around && pattern
      ? overpass(
          `[out:json][timeout:10];(nwr(${around})["name"~"${pattern}",i]["amenity"];` +
            `nwr(${around})["name"~"${pattern}",i]["leisure"];nwr(${around})["cuisine"~"${pattern}",i]["name"];);out center 40;`,
        ).catch(() => [])
      : Promise.resolve([]),
  ]);
  const poiKeys = new Set(['amenity', 'leisure', 'tourism', 'shop', 'building', 'club', 'craft']);
  const fromPhoton = (photon.features || [])
    .filter((f) => f.properties && f.properties.name && poiKeys.has(String(f.properties.osm_key)))
    .map((f) => {
      const p = f.properties;
      const [plng, plat] = (f.geometry && f.geometry.coordinates) || [];
      return {
        id: `photon-${p.osm_type}-${p.osm_id}`,
        name: String(p.name),
        address: [p.housenumber, p.street].filter(Boolean).join(' ') || null,
        area: p.district || p.locality || p.city || null,
        lat: plat == null ? null : plat,
        lng: plng == null ? null : plng,
        kind: PLACE_KIND[String(p.osm_value)] || null,
        rating: null,
      };
    });
  return [...near, ...fromPhoton];
}

function googlePlace(p) {
  const comps = p.addressComponents || [];
  const comp = (type) => (comps.find((c) => (c.types || []).includes(type)) || {}).shortText || null;
  return {
    id: `g-${p.id}`,
    name: (p.displayName && p.displayName.text) || 'Place',
    address: p.shortFormattedAddress || null,
    area: comp('neighborhood') || comp('sublocality') || comp('locality'),
    lat: p.location ? p.location.latitude : null,
    lng: p.location ? p.location.longitude : null,
    kind: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || null,
    rating: typeof p.rating === 'number' ? p.rating : null,
  };
}

async function googlePlaces(key, body, path) {
  const json = await placeFetch(`https://places.googleapis.com/v1/places:${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.shortFormattedAddress,places.location,places.primaryTypeDisplayName,places.rating,places.addressComponents',
    },
    body: JSON.stringify(body),
  });
  return (json.places || []).map(googlePlace);
}

async function googleNearby(key, lat, lng, category, cuisine) {
  const cuisineType = category === 'dinner' ? GOOGLE_CUISINE[cuisine] : null;
  const circle = { center: { latitude: lat, longitude: lng }, radius: 5000 };
  try {
    return await googlePlaces(
      key,
      { includedTypes: cuisineType ? [cuisineType] : GOOGLE_TYPES[category], maxResultCount: 20, locationRestriction: { circle } },
      'searchNearby',
    );
  } catch (error) {
    // Newer place types aren't accepted everywhere; retry with the first, most basic one.
    if (!String(error.message).startsWith('400')) throw error;
    return googlePlaces(
      key,
      { includedTypes: [GOOGLE_TYPES[category][0]], maxResultCount: 20, locationRestriction: { circle } },
      'searchNearby',
    );
  }
}

async function googleSearch(key, q, lat, lng) {
  const body = { textQuery: q, maxResultCount: 15 };
  if (lat != null && lng != null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 15000 } };
  }
  return googlePlaces(key, body, 'searchText');
}

function placeMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

const HOT_TTL_MS = 3 * 24 * 3600 * 1000;
const HOT_EMPTY_TTL_MS = 3 * 3600 * 1000;
const hotInFlight = new Map();

/** AI-picked popular spots, cached per ~2 mi cell so only the first person in an area waits. */
async function cachedHotPlaces(lat, lng, category, cuisine) {
  const cell = (v) => (Math.round(v / 0.03) * 0.03).toFixed(2);
  const rawKey = `hot|${category}|${cuisine || ''}|${cell(lat)}_${cell(lng)}`;
  const cacheRef = getFirestore()
    .collection('placeCache')
    .doc(`ai_${require('crypto').createHash('sha1').update(rawKey).digest('hex')}`);
  const cached = await cacheRef.get();
  if (cached.exists) {
    const { places = [], at = 0 } = cached.data();
    if (Date.now() - at < (places.length ? HOT_TTL_MS : HOT_EMPTY_TTL_MS)) return places;
  }
  if (!hotInFlight.has(rawKey)) {
    const task = findHotPlaces({ lat, lng, category, cuisine })
      .catch((error) => {
        console.warn('hot places failed', error.message);
        return null;
      })
      .then(async (places) => {
        if (places) await cacheRef.set({ places, at: Date.now() }).catch(() => undefined);
        return places || [];
      })
      .finally(() => hotInFlight.delete(rawKey));
    hotInFlight.set(rawKey, task);
  }
  return hotInFlight.get(rawKey);
}

/** Travel Mode city picker: cities only, de-duped by name + region. */
async function searchCities(rawQuery) {
  const query = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (query.length < 2) return [];
  const key = `city|${query.toLowerCase()}`;
  const cacheRef = getFirestore()
    .collection('placeCache')
    .doc(`photon_${require('crypto').createHash('sha1').update(key).digest('hex')}`);
  const cached = await cacheRef.get().catch(() => null);
  if (cached && cached.exists && Date.now() - (cached.data().at || 0) < 7 * 24 * 3600 * 1000) {
    return cached.data().cities || [];
  }
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en&layer=city`;
  const json = await placeFetch(url, {}, 8000);
  const seen = new Set();
  const cities = [];
  for (const f of json.features || []) {
    const p = f.properties || {};
    const [lng, lat] = (f.geometry && f.geometry.coordinates) || [];
    if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const region = p.state || p.country || null;
    const k = `${p.name}|${region || ''}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    cities.push({
      id: `osm-${p.osm_type || 'x'}-${p.osm_id || cities.length}`,
      name: String(p.name).slice(0, 60),
      region: region ? String(region).slice(0, 60) : null,
      country: p.countrycode ? String(p.countrycode).toUpperCase() : null,
      lat: Math.round(lat * 1000) / 1000,
      lng: Math.round(lng * 1000) / 1000,
    });
    if (cities.length >= 6) break;
  }
  if (cities.length) await cacheRef.set({ cities, at: Date.now() }).catch(() => undefined);
  return cities;
}

exports.searchPlaces = onRequest({ cors: true, timeoutSeconds: 60 }, async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    await requireUser(req);
    const body = req.body || {};
    if (body.mode === 'city') {
      res.json({ cities: await searchCities(typeof body.query === 'string' ? body.query : '') });
      return;
    }
    const mode = body.mode === 'search' ? 'search' : body.mode === 'hot' ? 'hot' : 'nearby';
    const lat = Number.isFinite(body.lat) ? Math.max(-90, Math.min(90, body.lat)) : null;
    const lng = Number.isFinite(body.lng) ? Math.max(-180, Math.min(180, body.lng)) : null;
    const category = PLACE_CATEGORIES.includes(body.category) ? body.category : 'drinks';
    const cuisine = typeof body.cuisine === 'string' ? body.cuisine.slice(0, 20) : null;
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 80) : '';
    if (mode !== 'search' && (lat == null || lng == null)) {
      res.status(400).json({ error: 'Location needed.' });
      return;
    }
    if (mode === 'search' && query.length < 2) {
      res.json({ places: [] });
      return;
    }

    if (mode === 'hot') {
      const me = { lat, lng };
      const hot = (await cachedHotPlaces(lat, lng, category, cuisine))
        .map((p) => ({ ...p, distanceMiles: Math.round(placeMiles(me, p) * 10) / 10 }))
        .filter((p) => p.distanceMiles <= 12)
        .slice(0, 6);
      res.json({ places: hot, provider: 'ai' });
      return;
    }

    const googleKey = process.env.GOOGLE_PLACES_API_KEY || '';
    const provider = googleKey ? 'google' : 'osm';
    const grid = lat != null && lng != null ? `${lat.toFixed(2)}_${lng.toFixed(2)}` : 'x';
    const rawKey = mode === 'nearby' ? `n|${category}|${cuisine || ''}|${grid}` : `s|${query.toLowerCase()}|${grid}`;
    const cacheId = `${provider}_${require('crypto').createHash('sha1').update(rawKey).digest('hex')}`;
    const db = getFirestore();
    const cacheRef = db.collection('placeCache').doc(cacheId);
    const cached = await cacheRef.get();
    const maxAge = mode === 'nearby' ? 24 * 3600 * 1000 : 6 * 3600 * 1000;
    let places = null;
    const stale = cached.exists ? cached.data().places || [] : [];
    if (cached.exists && Date.now() - (cached.data().at || 0) < maxAge) places = cached.data().places;

    if (!places) {
      if (googleKey) {
        try {
          places =
            mode === 'nearby'
              ? await googleNearby(googleKey, lat, lng, category, cuisine)
              : await googleSearch(googleKey, query, lat, lng);
        } catch (error) {
          console.warn('Google Places failed, using OSM', error.message);
        }
      }
      if (!places) {
        places = mode === 'nearby' ? await osmNearby(lat, lng, category, cuisine) : await osmSearch(query, lat, lng);
      }
      // Providers flaked: an older list for this spot beats "nothing nearby".
      if (!places.length && stale.length) places = stale;
      const seen = new Set();
      places = places.filter((p) => {
        const k = `${p.name.toLowerCase()}|${p.address || ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (places.length) await cacheRef.set({ places: places.slice(0, 60), at: Date.now() }).catch(() => undefined);
    }

    const me = lat != null && lng != null ? { lat, lng } : null;
    const withDistance = places
      .map((p) => ({
        ...p,
        distanceMiles: me && p.lat != null && p.lng != null ? Math.round(placeMiles(me, p) * 10) / 10 : null,
      }))
      .sort((a, b) => (a.distanceMiles == null ? 99 : a.distanceMiles) - (b.distanceMiles == null ? 99 : b.distanceMiles))
      .slice(0, 15);
    res.json({ places: withDistance, provider });
  } catch (error) {
    console.error('searchPlaces', error.message || error);
    res.status(error.status || 502).json({ error: 'Couldn’t load places right now.' });
  }
});

/** Accepted plan → links to add it to Apple Calendar (.ics) or Google Calendar. */
exports.createCalendarLink = onRequest({ cors: true }, (req, res) =>
  calendar.createCalendarLink(req, res, {
    db: getFirestore(),
    requireUser,
    publicUrl: 'https://us-central1-datetoday-e1331.cloudfunctions.net/calendarEvent',
  }),
);

exports.calendarEvent = onRequest({ cors: true }, (req, res) => calendar.calendarEvent(req, res, { db: getFirestore() }));

/** A device was newly signed in to an account → alert that account's other devices. */
exports.onPushTokenWritten = onDocumentWritten('pushTokens/{tokenId}', async (event) => {
  const before = event.data && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after.exists ? event.data.after.data() : null;
  if (!after || !after.uid) return;
  if (before && before.uid === after.uid) return;
  const device =
    [after.manufacturer, after.deviceModel].filter(Boolean).join(' ') ||
    (after.platform === 'ios' ? 'an iPhone' : 'an Android phone');
  await pushToUser(
    getFirestore(),
    after.uid,
    {
      title: 'New sign-in to DateToday',
      body: `Your account was just signed in on ${device}. Not you? Email support@datetoday.app right away.`,
      data: { type: 'security', url: '/settings' },
    },
    { excludeTokenDocId: event.params.tokenId },
  );
});
