'use strict';

/**
 * Block contacts: people a member never wants to see, or be seen by, picked from their phone's
 * contacts or typed in. The app only sends SHA-256 hashes of normalized phone numbers and emails
 * (contactKey below; lib/contactKey.ts must stay identical), never the contact details themselves.
 * A match hides both people from each other everywhere through hiddenUsers, now and for anyone who
 * joins or adds their number later. Nobody is told, and the blocker never learns who matched.
 *
 * contactBlocks/{uid}/entries/{entryId} (server only): { label, hashes, at }
 * contactIdentity/{uid}  (server only): { emailHash, phoneHash, phoneLast4 }, what others can match
 * contactHashes/{hash}   (server only): { owners: [uid], blockers: [uid] }
 * contactHides/{blockerUid_targetUid} (server only): a live match, so unblocking elsewhere keeps it hidden
 */
const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { canonicalEmail } = require('./emailIdentity');

const HASH_RE = /^[a-f0-9]{64}$/;
const ENTRY_ID_RE = /^[a-f0-9]{32}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_ENTRIES = 3000;
const MAX_PER_CALL = 250;
const MAX_HASHES_PER_ENTRY = 8;
const LABEL_MAX = 60;

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

/** The last 10 digits, so "+1 (555) 123-4567", "555-123-4567" and "07911 123456" vs "+44 7911 123456" line up. */
function phoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function contactKey(kind, raw) {
  if (kind === 'phone') {
    const digits = phoneDigits(raw);
    return digits ? `p:${digits}` : null;
  }
  const email = canonicalEmail(raw);
  return EMAIL_RE.test(email) ? `e:${email}` : null;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashOf(kind, raw) {
  const key = contactKey(kind, raw);
  return key ? sha256(key) : null;
}

/** Same contact picked twice is the same entry. */
const entryIdFor = (hashes) => sha256([...hashes].sort().join(',')).slice(0, 32);

function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.hashes)) return null;
  const hashes = [...new Set(raw.hashes.filter((h) => typeof h === 'string' && HASH_RE.test(h)))].slice(
    0,
    MAX_HASHES_PER_ENTRY,
  );
  if (!hashes.length) return null;
  const label = typeof raw.label === 'string' ? raw.label.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX) : '';
  return { id: entryIdFor(hashes), label: label || 'Contact', hashes };
}

function identityHashes(data) {
  return [data && data.emailHash, data && data.phoneHash].filter((h) => typeof h === 'string' && HASH_RE.test(h));
}

const entriesCol = (db, uid) => db.collection('contactBlocks').doc(uid).collection('entries');
const hideRef = (db, blocker, target) => db.collection('contactHides').doc(`${blocker}_${target}`);
const pairId = (a, b) => [a, b].sort().join('_');

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** True when nothing else keeps the pair apart: no block either way, no contact match, no unmatch. */
async function pairFree(db, a, b) {
  const [ab, ba, hideAB, hideBA, unmatch] = await Promise.all([
    db.collection('blocks').where('blockerId', '==', a).where('blockedId', '==', b).limit(1).get(),
    db.collection('blocks').where('blockerId', '==', b).where('blockedId', '==', a).limit(1).get(),
    hideRef(db, a, b).get(),
    hideRef(db, b, a).get(),
    db.collection('unmatches').doc(pairId(a, b)).get(),
  ]);
  return ab.empty && ba.empty && !hideAB.exists && !hideBA.exists && !unmatch.exists;
}

/** Shows the pair to each other again unless something else still hides them. */
async function unhideIfFree(db, a, b) {
  if (!(await pairFree(db, a, b))) return false;
  const batch = db.batch();
  batch.set(
    db.collection('hiddenUsers').doc(a),
    { uids: FieldValue.arrayRemove(b), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  batch.set(
    db.collection('hiddenUsers').doc(b),
    { uids: FieldValue.arrayRemove(a), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
  return true;
}

/**
 * Brings one blocker→target pair up to date with the blocker's list and the target's identity:
 * hidden both ways (pending hearts dropped) while any entry matches, released when none do.
 * An existing chat is left alone so removing a contact by mistake never deletes anything.
 */
async function recomputePair(db, blocker, target) {
  if (!blocker || !target || blocker === target) return;
  const identity = await db.collection('contactIdentity').doc(target).get();
  const hashes = identityHashes(identity.exists ? identity.data() : null);
  const hit = hashes.length
    ? !(await entriesCol(db, blocker).where('hashes', 'array-contains-any', hashes).limit(1).get()).empty
    : false;
  const ref = hideRef(db, blocker, target);
  if (hit) {
    const batch = db.batch();
    batch.set(ref, { blockerId: blocker, targetId: target, at: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(
      db.collection('hiddenUsers').doc(blocker),
      { uids: FieldValue.arrayUnion(target), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    batch.set(
      db.collection('hiddenUsers').doc(target),
      { uids: FieldValue.arrayUnion(blocker), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    batch.delete(db.collection('interests').doc(`${blocker}_${target}`));
    batch.delete(db.collection('interests').doc(`${target}_${blocker}`));
    await batch.commit();
    return;
  }
  const existing = await ref.get();
  if (!existing.exists) return;
  await ref.delete();
  await unhideIfFree(db, blocker, target);
}

async function readHashDocs(db, hashes) {
  const docs = [];
  for (const part of chunks(hashes, 300)) {
    if (part.length) docs.push(...(await db.getAll(...part.map((h) => db.collection('contactHashes').doc(h)))));
  }
  return docs;
}

const field = (docs, name) => {
  const out = new Set();
  docs.forEach((d) => (d.exists ? d.get(name) || [] : []).forEach((uid) => out.add(uid)));
  return out;
};

async function eachLimited(items, fn, width = 10) {
  const list = [...items];
  for (const part of chunks(list, width)) await Promise.all(part.map(fn));
}

/**
 * Keeps what others can match this account by in step with its email and optional phone number.
 * `phone`: undefined keeps the saved number, null removes it.
 */
async function syncIdentity(db, uid, { email, phone } = {}) {
  const ref = db.collection('contactIdentity').doc(uid);
  const prevSnap = await ref.get();
  const prev = prevSnap.exists ? prevSnap.data() : {};
  const next = {
    emailHash: email ? hashOf('email', email) : null,
    phoneHash: prev.phoneHash || null,
    phoneLast4: prev.phoneLast4 || null,
  };
  if (phone === null) {
    next.phoneHash = null;
    next.phoneLast4 = null;
  } else if (phone !== undefined) {
    const digits = phoneDigits(phone);
    if (!digits) throw httpError(400, 'Enter a full phone number.', 'bad_phone');
    next.phoneHash = sha256(`p:${digits}`);
    next.phoneLast4 = digits.slice(-4);
  }
  const before = identityHashes(prev);
  const after = identityHashes(next);
  const unchanged =
    prevSnap.exists &&
    before.length === after.length &&
    before.every((h) => after.includes(h)) &&
    (prev.phoneLast4 || null) === next.phoneLast4;
  if (unchanged) return next;

  await ref.set({ ...next, updatedAt: FieldValue.serverTimestamp() });
  const batch = db.batch();
  before
    .filter((h) => !after.includes(h))
    .forEach((h) => batch.set(db.collection('contactHashes').doc(h), { owners: FieldValue.arrayRemove(uid) }, { merge: true }));
  after
    .filter((h) => !before.includes(h))
    .forEach((h) => batch.set(db.collection('contactHashes').doc(h), { owners: FieldValue.arrayUnion(uid) }, { merge: true }));
  await batch.commit();

  const blockers = field(await readHashDocs(db, [...new Set([...before, ...after])]), 'blockers');
  const stale = await db.collection('contactHides').where('targetId', '==', uid).get();
  stale.docs.forEach((d) => blockers.add(d.get('blockerId')));
  blockers.delete(uid);
  await eachLimited(blockers, (b) => recomputePair(db, b, uid));
  return next;
}

async function listEntries(db, uid) {
  const snap = await entriesCol(db, uid).orderBy('at', 'desc').limit(MAX_ENTRIES).get();
  return snap.docs.map((d) => ({ id: d.id, label: d.get('label') || 'Contact' }));
}

async function addEntries(db, uid, rawEntries) {
  if (!Array.isArray(rawEntries) || !rawEntries.length) throw httpError(400, 'Pick someone to block.');
  if (rawEntries.length > MAX_PER_CALL) throw httpError(400, 'Too many at once.');
  const byId = new Map();
  rawEntries.map(cleanEntry).filter(Boolean).forEach((e) => byId.set(e.id, e));
  const entries = [...byId.values()];
  if (!entries.length) throw httpError(400, 'Those don’t have a phone number or email we can use.', 'no_contact_info');

  const count = (await entriesCol(db, uid).count().get()).data().count;
  if (count + entries.length > MAX_ENTRIES) {
    throw httpError(400, `You can block up to ${MAX_ENTRIES} contacts.`, 'too_many');
  }

  const writer = db.bulkWriter();
  entries.forEach((e) =>
    writer.set(entriesCol(db, uid).doc(e.id), { label: e.label, hashes: e.hashes, at: FieldValue.serverTimestamp() }),
  );
  const hashes = [...new Set(entries.flatMap((e) => e.hashes))];
  hashes.forEach((h) =>
    writer.set(db.collection('contactHashes').doc(h), { blockers: FieldValue.arrayUnion(uid) }, { merge: true }),
  );
  await writer.close();

  const owners = field(await readHashDocs(db, hashes), 'owners');
  owners.delete(uid);
  await eachLimited(owners, (o) => recomputePair(db, uid, o));
  return { added: entries.length };
}

async function removeEntries(db, uid, ids) {
  const clean = Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === 'string' && ENTRY_ID_RE.test(id)))] : [];
  if (!clean.length) return { removed: 0 };
  if (clean.length > MAX_PER_CALL) throw httpError(400, 'Too many at once.');
  const snaps = await db.getAll(...clean.map((id) => entriesCol(db, uid).doc(id)));
  const found = snaps.filter((s) => s.exists);
  const hashes = [...new Set(found.flatMap((s) => s.get('hashes') || []))];
  const writer = db.bulkWriter();
  found.forEach((s) => writer.delete(s.ref));
  await writer.close();

  const stillUsed = await Promise.all(
    hashes.map((h) => entriesCol(db, uid).where('hashes', 'array-contains', h).limit(1).get().then((s) => !s.empty)),
  );
  const batch = db.batch();
  hashes.forEach((h, i) => {
    if (!stillUsed[i]) batch.set(db.collection('contactHashes').doc(h), { blockers: FieldValue.arrayRemove(uid) }, { merge: true });
  });
  await batch.commit();

  const owners = field(await readHashDocs(db, hashes), 'owners');
  owners.delete(uid);
  await eachLimited(owners, (o) => recomputePair(db, uid, o));
  return { removed: found.length };
}

/** Account deletion: drop the list, the identity and every match. hiddenUsers is cleaned by the caller. */
async function purgeUser(db, uid) {
  const entries = await entriesCol(db, uid).get();
  const blocked = [...new Set(entries.docs.flatMap((d) => d.get('hashes') || []))];
  const identity = await db.collection('contactIdentity').doc(uid).get();
  const owned = identityHashes(identity.exists ? identity.data() : null);
  const writer = db.bulkWriter();
  blocked.forEach((h) => writer.set(db.collection('contactHashes').doc(h), { blockers: FieldValue.arrayRemove(uid) }, { merge: true }));
  owned.forEach((h) => writer.set(db.collection('contactHashes').doc(h), { owners: FieldValue.arrayRemove(uid) }, { merge: true }));
  const [asBlocker, asTarget] = await Promise.all([
    db.collection('contactHides').where('blockerId', '==', uid).get(),
    db.collection('contactHides').where('targetId', '==', uid).get(),
  ]);
  [...asBlocker.docs, ...asTarget.docs].forEach((d) => writer.delete(d.ref));
  writer.delete(db.collection('contactIdentity').doc(uid));
  await writer.close();
  await db.recursiveDelete(db.collection('contactBlocks').doc(uid));
}

function createContactBlocksEndpoint() {
  const accountEmail = async (auth, decoded) =>
    (await auth.getUser(decoded.uid).catch(() => null))?.email || decoded.email || null;

  const summary = async (db, uid, identity) => ({
    entries: await listEntries(db, uid),
    phoneLast4: identity.phoneLast4 || null,
    max: MAX_ENTRIES,
  });

  const actions = {
    async list(req, { db, auth, decoded }) {
      const identity = await syncIdentity(db, decoded.uid, { email: await accountEmail(auth, decoded) });
      return summary(db, decoded.uid, identity);
    },
    async add(req, { db, decoded }) {
      return addEntries(db, decoded.uid, req.body.entries);
    },
    async remove(req, { db, decoded }) {
      return removeEntries(db, decoded.uid, req.body.ids);
    },
    async setPhone(req, { db, auth, decoded }) {
      const phone = req.body.phone == null || req.body.phone === '' ? null : String(req.body.phone);
      const identity = await syncIdentity(db, decoded.uid, { email: await accountEmail(auth, decoded), phone });
      return { phoneLast4: identity.phoneLast4 || null };
    },
  };

  return async (req, ctx) => {
    const action = req.body && Object.prototype.hasOwnProperty.call(actions, req.body.action) ? actions[req.body.action] : null;
    if (!action) throw httpError(400, 'Unknown action.');
    return action(req, ctx);
  };
}

module.exports = {
  MAX_ENTRIES,
  contactKey,
  cleanEntry,
  createContactBlocksEndpoint,
  entryIdFor,
  hashOf,
  phoneDigits,
  purgeUser,
  recomputePair,
  syncIdentity,
  unhideIfFree,
};
