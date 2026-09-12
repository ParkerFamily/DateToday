/**
 * Firebase Cloud Functions for DateToday.
 * Deploy: npm i && firebase deploy --only functions
 *
 * deleteAccount — server-side purge (Auth, Firestore, Storage).
 * confirmPersonaVerification — Persona API check, then grant verified (Admin write).
 * Clients must not be the only deletion / verification path in production.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

initializeApp();

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

async function writeVerification(db, uid, status, inquiryId) {
  const payload = {
    verificationStatus: status,
    personaInquiryId: inquiryId || null,
    verificationCheckedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (status === 'verified') {
    payload.verifiedAt = FieldValue.serverTimestamp();
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

async function deleteByField(db, collectionName, field, uid) {
  const snap = await db.collection(collectionName).where(field, '==', uid).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function anonymizeReports(db, uid) {
  const asReporter = await db.collection('reports').where('reporterId', '==', uid).get();
  const asReported = await db.collection('reports').where('reportedId', '==', uid).get();
  if (asReporter.empty && asReported.empty) return;
  const batch = db.batch();
  asReporter.docs.forEach((d) =>
    batch.update(d.ref, {
      reporterId: 'deleted_user',
      anonymizedAt: new Date().toISOString(),
    }),
  );
  asReported.docs.forEach((d) =>
    batch.update(d.ref, {
      reportedId: 'deleted_user',
      anonymizedAt: new Date().toISOString(),
    }),
  );
  await batch.commit();
}

exports.deleteAccount = onRequest({ cors: true }, async (req, res) => {
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

    await deletePrefix(bucket, `users/${uid}/`);
    await deleteByField(db, 'blocks', 'blockerId', uid);
    await deleteByField(db, 'blocks', 'blockedId', uid);
    await anonymizeReports(db, uid);
    await db.collection('users').doc(uid).delete().catch(() => undefined);
    await db.collection('profiles').doc(uid).delete().catch(() => undefined);
    await db.collection('deleted_users').doc(uid).set({
      uid,
      deletedAt: new Date().toISOString(),
      deletionSource: 'cloud_function',
    });
    await getAuth().deleteUser(uid);

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
        const email = decoded.email || null;
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

      const raw = inquiry.attributes?.status;
      const status = mapPersonaStatus(raw);
      const id = inquiry.id || inquiryId;

      // Bind inquiry to this account when possible.
      const refId = inquiry.attributes?.['reference-id'];
      const email = decoded.email || null;
      const refOk =
        !refId ||
        refId === uid ||
        (email && refId === email) ||
        String(refId).startsWith('local-');
      if (!refOk) {
        res.status(403).json({ error: 'Inquiry does not belong to this account' });
        return;
      }

      await writeVerification(db, uid, status, id);
      res.json({ status, inquiryId: id, rawStatus: raw || null });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Confirm failed',
      });
    }
  },
);
