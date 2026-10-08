'use strict';

/**
 * One account per inbox. Firebase already refuses two accounts with the exact same email; this also
 * catches addresses that reach the same inbox (Gmail ignores dots, most providers ignore +tags).
 * emailIndex/{sha256(canonical)} = { uid } is claimed when an account is created.
 */
const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');

const GMAIL = new Set(['gmail.com', 'googlemail.com']);

function canonicalEmail(email) {
  const address = String(email || '').trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 1) return address;
  let local = address.slice(0, at);
  let domain = address.slice(at + 1);
  local = local.split('+')[0];
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

const indexRef = (db, email) =>
  db.collection('emailIndex').doc(crypto.createHash('sha256').update(canonicalEmail(email)).digest('hex'));

async function liveUser(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') return null;
    throw error;
  }
}

/** Another live account whose email reaches the same inbox as `email`, else null. */
async function findInboxOwner(db, auth, email, exceptUid = null) {
  const snap = await indexRef(db, email).get();
  const uid = snap.exists ? snap.get('uid') : null;
  if (!uid || uid === exceptUid) return null;
  const owner = await liveUser(auth, uid);
  if (!owner || !owner.email || canonicalEmail(owner.email) !== canonicalEmail(email)) return null;
  return owner;
}

/**
 * Record `uid` as the account for this inbox. Returns false when a different live account
 * already holds it (the caller decides what to do with the newcomer).
 */
async function claimInbox(db, auth, uid, email) {
  if (!email) return true;
  const ref = indexRef(db, email);
  const current = await ref.get();
  const holder = current.exists ? current.get('uid') : null;
  if (holder && holder !== uid) {
    const owner = await liveUser(auth, holder);
    if (owner && owner.email && canonicalEmail(owner.email) === canonicalEmail(email)) return false;
  }
  await ref.set({ uid, at: FieldValue.serverTimestamp() });
  return true;
}

async function releaseInbox(db, uid, email) {
  if (!email) return;
  const ref = indexRef(db, email);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('uid') === uid) tx.delete(ref);
  });
}

module.exports = { canonicalEmail, claimInbox, findInboxOwner, releaseInbox };
