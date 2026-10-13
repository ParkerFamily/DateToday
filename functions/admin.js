'use strict';

/**
 * Owner console. Every action requires the `admin` custom claim on the caller's Firebase token,
 * and every change is written to adminLog. Payments and subscriptions are read-only here.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const freeLikes = require('./freeLikes');
const friendDate = require('./friendDate');
const priorityLikes = require('./priorityLikes');
const sessions = require('./sessions');

const DAY = 24 * 60 * 60 * 1000;
const UID = /^[A-Za-z0-9]{10,64}$/;
const REPORT_STATUSES = new Set(['open', 'under_review', 'actioned', 'closed']);
const VERIFICATION_STATUSES = new Set(['verified', 'unverified', 'failed']);

const httpError = (status, message) => Object.assign(new Error(message), { status });

function ms(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function ageFrom(dateOfBirth, now = Date.now()) {
  if (typeof dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateOfBirth)) return null;
  const dob = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`);
  const today = new Date(now);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Same test discovery uses: active, not ended, not expired. */
function isLive(session, now = Date.now()) {
  return Boolean(session && session.status === 'active' && !session.endedAt && ms(session.expiresAt) > now);
}

function placeLabel(location) {
  return sessions.placeLabel(location || null);
}

function requireUid(value) {
  const uid = String(value || '');
  if (!UID.test(uid)) throw httpError(400, 'Unknown user.');
  return uid;
}

async function count(query) {
  const snap = await query.count().get();
  return snap.data().count;
}

/** Sign-up and activity numbers straight from Firebase Auth (covers people who never finished a profile). */
async function authStats(auth, now) {
  const out = { total: 0, disabled: 0, signups24h: 0, signups7d: 0, active24h: 0, active7d: 0, truncated: false };
  let pageToken;
  let pages = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      out.total += 1;
      if (u.disabled) out.disabled += 1;
      const created = Date.parse(u.metadata.creationTime || '') || 0;
      const active = Date.parse(u.metadata.lastRefreshTime || u.metadata.lastSignInTime || '') || 0;
      if (now - created < DAY) out.signups24h += 1;
      if (now - created < 7 * DAY) out.signups7d += 1;
      if (now - active < DAY) out.active24h += 1;
      if (now - active < 7 * DAY) out.active7d += 1;
    }
    pageToken = page.pageToken;
    pages += 1;
  } while (pageToken && pages < 25);
  out.truncated = Boolean(pageToken);
  return out;
}

/** Auth has no "order by created" query, so page through (capped at 10k accounts) and sort. */
async function newestAccounts(auth, limit) {
  const all = [];
  let pageToken;
  let pages = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) all.push([u.uid, Date.parse(u.metadata.creationTime || '') || 0]);
    pageToken = page.pageToken;
    pages += 1;
  } while (pageToken && pages < 10);
  return all
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([uid]) => uid);
}

async function describeUsers(db, auth, uids) {
  const unique = [...new Set(uids.filter((u) => UID.test(u)))].slice(0, 60);
  if (!unique.length) return [];
  const [authResult, profiles, users, live] = await Promise.all([
    auth.getUsers(unique.map((uid) => ({ uid }))),
    db.getAll(...unique.map((uid) => db.collection('profiles').doc(uid))),
    db.getAll(...unique.map((uid) => db.collection('users').doc(uid))),
    db.getAll(...unique.map((uid) => db.collection('liveSessions').doc(uid))),
  ]);
  const authById = new Map(authResult.users.map((u) => [u.uid, u]));
  const now = Date.now();
  return unique.map((uid, i) => {
    const a = authById.get(uid);
    const p = profiles[i].exists ? profiles[i].data() : {};
    const u = users[i].exists ? users[i].data() : {};
    return {
      uid,
      name: p.displayName || u.displayName || (a && a.displayName) || null,
      email: (a && a.email) || u.email || null,
      photo: p.mainPhotoUrl || u.mainPhotoUrl || null,
      age: ageFrom(u.dateOfBirth, now),
      verified: (p.verificationStatus || u.verificationStatus) === 'verified',
      disabled: Boolean(a && a.disabled),
      admin: Boolean(a && a.customClaims && a.customClaims.admin),
      exists: Boolean(a),
      live: isLive(live[i].exists ? live[i].data() : null, now),
      createdAt: a ? Date.parse(a.metadata.creationTime || '') || 0 : ms(u.createdAt),
      lastActiveAt: a ? Date.parse(a.metadata.lastRefreshTime || a.metadata.lastSignInTime || '') || 0 : 0,
    };
  });
}

async function nameMatches(db, query) {
  const variants = [...new Set([query, query.charAt(0).toUpperCase() + query.slice(1).toLowerCase()])];
  const snaps = await Promise.all(
    variants.map((v) =>
      db.collection('profiles').where('displayName', '>=', v).where('displayName', '<', `${v}\uf8ff`).limit(25).get(),
    ),
  );
  return snaps.flatMap((s) => s.docs.map((d) => d.id));
}

async function endLive(db, uid, reason) {
  const ref = db.collection('liveSessions').doc(uid);
  const snap = await ref.get();
  if (!snap.exists || !isLive(snap.data())) return false;
  await ref.update({ status: 'ended', endedAt: new Date().toISOString(), endedReason: reason, updatedAt: FieldValue.serverTimestamp() });
  return true;
}

function reportSummary(d, names) {
  const r = d.data();
  return {
    id: d.id,
    status: r.status || 'open',
    reason: r.reason || null,
    details: typeof r.details === 'string' ? r.details.slice(0, 1000) : null,
    contentType: r.contentType || null,
    createdAt: ms(r.createdAt),
    reporter: { uid: r.reporterId || null, name: names.get(r.reporterId) || null },
    reported: { uid: r.reportedId || null, name: names.get(r.reportedId) || null },
    reportedMessage: r.reportedMessage ? { type: r.reportedMessage.type || 'text', text: r.reportedMessage.text || null, gifId: r.reportedMessage.gifId || null } : null,
    hasConversation: Array.isArray(r.messageSnapshot) && r.messageSnapshot.length > 0,
    adminNote: r.adminNote || null,
  };
}

async function profileNames(db, uids) {
  const unique = [...new Set(uids.filter((u) => typeof u === 'string' && UID.test(u)))];
  if (!unique.length) return new Map();
  const snaps = await db.getAll(...unique.map((uid) => db.collection('profiles').doc(uid)));
  return new Map(unique.map((uid, i) => [uid, snaps[i].exists ? snaps[i].get('displayName') || null : null]));
}

/**
 * deps: pushToUser(db, uid, message, options), purgeAccount(uid, email, source),
 * promoBroadcast(db, { title, body, url, send, sentBy }).
 */
function createAdminEndpoint({ pushToUser, purgeAccount, promoBroadcast }) {
  async function log(db, decoded, action, targetUid, detail = {}) {
    await db.collection('adminLog').add({
      action,
      by: decoded.uid,
      byEmail: decoded.email || null,
      targetUid: targetUid || null,
      detail,
      at: FieldValue.serverTimestamp(),
    });
  }

  /** The owner can't lock themselves out, and admins can't act on each other. */
  async function target(auth, decoded, value) {
    const uid = requireUid(value);
    if (uid === decoded.uid) throw httpError(400, 'That’s your own account.');
    const user = await auth.getUser(uid).catch(() => null);
    if (user && user.customClaims && user.customClaims.admin) throw httpError(403, 'That account is an admin.');
    return { uid, user };
  }

  const actions = {
    async overview(req, { db, auth }) {
      const now = Date.now();
      const since = Timestamp.fromMillis(now - DAY);
      const [accounts, profiles, verified, matches, matches24h, openReports, plusOn, liveSnap] = await Promise.all([
        authStats(auth, now),
        count(db.collection('profiles')),
        count(db.collection('profiles').where('verificationStatus', '==', 'verified')),
        count(db.collection('matches')),
        count(db.collection('matches').where('createdAt', '>=', since)),
        count(db.collection('reports').where('status', '==', 'open')),
        count(db.collection('entitlements').where('plus', '==', true)),
        db.collection('liveSessions').where('status', '==', 'active').get(),
      ]);
      return {
        at: now,
        accounts,
        profiles,
        verified,
        matches,
        matches24h,
        openReports,
        plusOn,
        liveNow: liveSnap.docs.filter((d) => isLive(d.data(), now)).length,
      };
    },

    async users(req, { db, auth }) {
      const query = text(req.body.query, 100);
      let uids = [];
      if (!query) {
        uids = await newestAccounts(auth, 40);
      } else if (query.includes('@')) {
        const user = await auth.getUserByEmail(query.toLowerCase()).catch(() => null);
        if (user) uids = [user.uid];
      } else {
        if (UID.test(query)) {
          const user = await auth.getUser(query).catch(() => null);
          if (user) uids.push(user.uid);
        }
        uids.push(...(await nameMatches(db, query)));
      }
      return { users: await describeUsers(db, auth, uids) };
    },

    async user(req, { db, auth }) {
      const uid = requireUid(req.body.uid);
      const now = Date.now();
      const [authUser, userSnap, profileSnap, liveSnap, entSnap, webSnap, modSnap, sessionSnap, reportsSnap, logSnap, tokens] =
        await Promise.all([
          auth.getUser(uid).catch(() => null),
          db.collection('users').doc(uid).get(),
          db.collection('profiles').doc(uid).get(),
          db.collection('liveSessions').doc(uid).get(),
          db.collection('entitlements').doc(uid).get(),
          db.collection('webSubscriptions').doc(uid).get(),
          db.collection('moderation').doc(uid).get(),
          db.collection('sessions').where('uid', '==', uid).get(),
          db.collection('reports').where('reportedId', '==', uid).limit(20).get(),
          db.collection('adminLog').where('targetUid', '==', uid).limit(30).get(),
          db.collection('pushTokens').where('uid', '==', uid).get(),
        ]);
      if (!authUser && !userSnap.exists && !profileSnap.exists) throw httpError(404, 'No account with that id.');
      const [matches, reportsBy, blocksBy, blockedBy, likesSent, likesReceived] = await Promise.all([
        count(db.collection('matches').where('userIds', 'array-contains', uid)),
        count(db.collection('reports').where('reporterId', '==', uid)),
        count(db.collection('blocks').where('blockerId', '==', uid)),
        count(db.collection('blocks').where('blockedId', '==', uid)),
        count(db.collection('interests').where('fromUid', '==', uid)),
        count(db.collection('interests').where('toUid', '==', uid)),
      ]);
      const u = userSnap.exists ? userSnap.data() : {};
      const p = profileSnap.exists ? profileSnap.data() : {};
      const live = liveSnap.exists ? liveSnap.data() : null;
      const ent = entSnap.exists ? entSnap.data() : null;
      const web = webSnap.exists ? webSnap.data() : null;
      const mod = modSnap.exists ? modSnap.data() : null;
      const names = await profileNames(db, reportsSnap.docs.map((d) => d.get('reporterId')).concat(uid));
      const photos = (Array.isArray(p.photoUrls) ? p.photoUrls : Array.isArray(u.photoUrls) ? u.photoUrls : []).filter(
        (x) => typeof x === 'string',
      );
      return {
        uid,
        name: p.displayName || u.displayName || (authUser && authUser.displayName) || null,
        email: (authUser && authUser.email) || u.email || null,
        emailVerified: Boolean(authUser && authUser.emailVerified),
        providers: authUser ? authUser.providerData.map((x) => x.providerId) : [],
        disabled: Boolean(authUser && authUser.disabled),
        admin: Boolean(authUser && authUser.customClaims && authUser.customClaims.admin),
        createdAt: authUser ? Date.parse(authUser.metadata.creationTime || '') || 0 : ms(u.createdAt),
        lastSignInAt: authUser ? Date.parse(authUser.metadata.lastSignInTime || '') || 0 : 0,
        lastActiveAt: authUser ? Date.parse(authUser.metadata.lastRefreshTime || authUser.metadata.lastSignInTime || '') || 0 : 0,
        age: ageFrom(u.dateOfBirth, now),
        gender: u.gender || p.gender || null,
        interestedIn: u.interestedIn || null,
        datingIntention: p.datingIntention || u.datingIntention || null,
        bio: p.bio || u.bio || null,
        occupation: p.occupation || null,
        onboardingComplete: u.onboardingComplete === true,
        verificationStatus: p.verificationStatus || u.verificationStatus || 'unverified',
        photos: [...new Set([p.mainPhotoUrl, ...photos].filter(Boolean))].slice(0, 9),
        videos: [p.aboutVideoUrl, p.tonightVideoUrl].filter((x) => typeof x === 'string' && x),
        live: live
          ? { active: isLive(live, now), until: ms(live.expiresAt), area: live.neighborhoodLabel || null, boosted: Boolean(live.isBoosted) }
          : null,
        plus: {
          app: ent ? { on: ent.plus === true, source: ent.source || null, productId: ent.productId || null, expiresAt: ms(ent.expiresAt) } : null,
          web: web ? { on: web.plus === true, status: web.status || null, plan: web.plan || null, expiresAt: ms(web.expiresAt) } : null,
        },
        moderation: mod
          ? { banned: mod.banned === true, reason: mod.reason || null, bannedAt: ms(mod.bannedAt), unbannedAt: ms(mod.unbannedAt) }
          : null,
        counts: { matches, reportsAgainst: reportsSnap.size, reportsBy, blocksBy, blockedBy, likesSent, likesReceived },
        pushDevices: tokens.size,
        devices: sessionSnap.docs
          .map((d) => d.data())
          .sort((a, b) => ms(b.lastActiveAt) - ms(a.lastActiveAt))
          .slice(0, 15)
          .map((s) => ({
            label: s.deviceLabel || 'Unknown device',
            platform: s.platform || 'web',
            place: placeLabel(s.location),
            lastActiveAt: ms(s.lastActiveAt) || ms(s.createdAt),
            signedOut: Boolean(s.revokedAt),
          })),
        reports: reportsSnap.docs
          .map((d) => reportSummary(d, names))
          .sort((a, b) => b.createdAt - a.createdAt),
        log: logSnap.docs
          .map((d) => ({ action: d.get('action'), at: ms(d.get('at')), detail: d.get('detail') || {} }))
          .sort((a, b) => b.at - a.at),
      };
    },

    async ban(req, { db, auth, decoded }) {
      const { uid, user } = await target(auth, decoded, req.body.uid);
      if (!user) throw httpError(404, 'That account no longer exists.');
      const reason = text(req.body.reason, 300) || 'No reason given';
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
      const endedLive = await endLive(db, uid, 'removed');
      await db.collection('nearbyProfiles').doc(uid).delete().catch(() => undefined);
      const devices = await sessions.revokeAllSessions(db, uid, 'admin');
      const tokens = await db.collection('pushTokens').where('uid', '==', uid).get();
      await Promise.all(tokens.docs.map((t) => t.ref.delete().catch(() => undefined)));
      await db.collection('moderation').doc(uid).set(
        { banned: true, reason, bannedAt: FieldValue.serverTimestamp(), bannedBy: decoded.uid },
        { merge: true },
      );
      await log(db, decoded, 'ban', uid, { reason, endedLive, devices });
      return { ok: true };
    },

    async unban(req, { db, auth, decoded }) {
      const { uid, user } = await target(auth, decoded, req.body.uid);
      if (!user) throw httpError(404, 'That account no longer exists.');
      const dupe = await db.collection('duplicateAccounts').doc(uid).get();
      if (dupe.exists) throw httpError(409, 'This account was disabled automatically as a duplicate of another account’s email.');
      await auth.updateUser(uid, { disabled: false });
      await db.collection('moderation').doc(uid).set(
        { banned: false, unbannedAt: FieldValue.serverTimestamp(), unbannedBy: decoded.uid },
        { merge: true },
      );
      await log(db, decoded, 'unban', uid);
      return { ok: true };
    },

    async signOut(req, { db, auth, decoded }) {
      const { uid } = await target(auth, decoded, req.body.uid);
      await auth.revokeRefreshTokens(uid);
      const devices = await sessions.revokeAllSessions(db, uid, 'admin');
      await log(db, decoded, 'sign_out_everywhere', uid, { devices });
      return { ok: true, devices };
    },

    async endLive(req, { db, auth, decoded }) {
      const { uid } = await target(auth, decoded, req.body.uid);
      const ended = await endLive(db, uid, 'removed');
      if (ended) await log(db, decoded, 'end_live', uid);
      return { ok: true, ended };
    },

    async setVerification(req, { db, auth, decoded }) {
      const { uid } = await target(auth, decoded, req.body.uid);
      const status = String(req.body.status || '');
      if (!VERIFICATION_STATUSES.has(status)) throw httpError(400, 'Pick verified, unverified or failed.');
      await db.collection('users').doc(uid).set(
        {
          verificationStatus: status,
          verificationSource: 'admin',
          verificationCheckedAt: FieldValue.serverTimestamp(),
          ...(status === 'verified' ? { verifiedAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await db.collection('profiles').doc(uid).set({ verificationStatus: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await log(db, decoded, 'set_verification', uid, { status });
      return { ok: true };
    },

    async deleteUser(req, { db, auth, decoded }) {
      const { uid, user } = await target(auth, decoded, req.body.uid);
      if (req.body.confirm !== uid) throw httpError(400, 'Confirm by sending the account id.');
      await log(db, decoded, 'delete_account', uid, { email: (user && user.email) || null });
      await purgeAccount(uid, (user && user.email) || null, 'owner_console');
      return { ok: true };
    },

    async pushUser(req, { db, auth, decoded }) {
      const uid = requireUid(req.body.uid);
      const title = text(req.body.title, 65);
      const body = text(req.body.body, 178);
      if (!title || !body) throw httpError(400, 'Add a title and a message.');
      const tokens = await count(db.collection('pushTokens').where('uid', '==', uid));
      if (!tokens) throw httpError(400, 'They have no device with notifications on.');
      await pushToUser(db, uid, { title, body, data: { type: 'system', url: '/(tabs)/live' } });
      await log(db, decoded, 'push_user', uid, { title, body });
      return { ok: true, devices: tokens };
    },

    async broadcast(req, { db, decoded }) {
      const title = text(req.body.title, 65);
      const body = text(req.body.body, 178);
      const url = text(req.body.url, 200) || '/(tabs)/live';
      if (!title || !body) throw httpError(400, 'Add a title and a message.');
      if (!url.startsWith('/')) throw httpError(400, 'The link must be an app path like /(tabs)/live.');
      const send = req.body.send === true;
      const result = await promoBroadcast(db, { title, body, url, send, sentBy: decoded.uid });
      if (send) await log(db, decoded, 'broadcast', null, { title, body, url, sent: result.willReceive });
      return result;
    },

    async reports(req, { db }) {
      const status = String(req.body.status || 'open');
      const snap =
        status === 'all'
          ? await db.collection('reports').orderBy('createdAt', 'desc').limit(60).get()
          : await db.collection('reports').where('status', '==', REPORT_STATUSES.has(status) ? status : 'open').limit(200).get();
      const names = await profileNames(db, snap.docs.flatMap((d) => [d.get('reporterId'), d.get('reportedId')]));
      const rows = snap.docs.map((d) => reportSummary(d, names)).sort((a, b) => b.createdAt - a.createdAt);
      return { reports: rows.slice(0, 60) };
    },

    async report(req, { db }) {
      const id = String(req.body.id || '');
      if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw httpError(400, 'Unknown report.');
      const snap = await db.collection('reports').doc(id).get();
      if (!snap.exists) throw httpError(404, 'That report is gone.');
      const r = snap.data();
      const conversation = Array.isArray(r.messageSnapshot) ? r.messageSnapshot.slice(-40) : [];
      const names = await profileNames(db, [r.reporterId, r.reportedId]);
      return {
        report: reportSummary(snap, names),
        conversation: conversation.map((m) => ({
          mine: m.senderId === r.reporterId,
          from: names.get(m.senderId) || null,
          type: m.type || 'text',
          text: m.text || (m.proposal ? 'Date plan' : null),
          gifId: m.gifId || null,
          reported: Boolean(r.reportedMessage && r.reportedMessage.messageId === m.messageId),
          at: ms(m.createdAt),
        })),
      };
    },

    async resolveReport(req, { db, decoded }) {
      const id = String(req.body.id || '');
      const status = String(req.body.status || '');
      if (!/^[A-Za-z0-9_-]{4,64}$/.test(id) || !REPORT_STATUSES.has(status)) throw httpError(400, 'Unknown report or status.');
      const ref = db.collection('reports').doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw httpError(404, 'That report is gone.');
      const note = text(req.body.note, 500);
      await ref.update({
        status,
        ...(note ? { adminNote: note } : {}),
        reviewedBy: decoded.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await log(db, decoded, 'report_status', snap.get('reportedId') || null, { reportId: id, status });
      return { ok: true };
    },

    async live(req, { db }) {
      const now = Date.now();
      const snap = await db.collection('liveSessions').where('status', '==', 'active').get();
      const rows = snap.docs
        .filter((d) => isLive(d.data(), now))
        .map((d) => {
          const s = d.data();
          return {
            uid: d.id,
            name: s.displayName || null,
            age: typeof s.age === 'number' ? s.age : null,
            photo: s.mainPhotoUrl || null,
            area: s.neighborhoodLabel || (s.trip && s.trip.city) || null,
            until: ms(s.expiresAt),
            startedAt: ms(s.startedAt),
            boosted: Boolean(s.isBoosted),
            verified: s.verificationStatus === 'verified',
            travel: Boolean(s.trip),
          };
        })
        .sort((a, b) => b.startedAt - a.startedAt);
      return { live: rows };
    },

    async config(req, { db }) {
      const [fl, pl, fd] = await Promise.all([
        db.collection('appConfig').doc('freeLikes').get(),
        db.collection('appConfig').doc('priorityLikes').get(),
        db.collection('appConfig').doc('friendDate').get(),
      ]);
      return {
        freeLikes: freeLikes.freeLikesConfig(fl.exists ? fl.data() : null),
        priorityLikes: priorityLikes.normalizeConfig(pl.exists ? pl.data() : null),
        friendDate: friendDate.friendDateConfig(fd.exists ? fd.data() : null),
      };
    },

    async setConfig(req, { db, decoded }) {
      const key = String(req.body.key || '');
      const value = req.body.value && typeof req.body.value === 'object' ? req.body.value : null;
      if (!value) throw httpError(400, 'Nothing to save.');
      const normalizers = { freeLikes: freeLikes.freeLikesConfig, friendDate: friendDate.friendDateConfig };
      if (!Object.prototype.hasOwnProperty.call(normalizers, key)) throw httpError(400, 'Unknown setting.');
      const normalize = normalizers[key];
      const next = normalize(value);
      await db.collection('appConfig').doc(key).set({ ...next, updatedAt: FieldValue.serverTimestamp(), updatedBy: decoded.uid }, { merge: true });
      await log(db, decoded, 'set_config', null, { key, value: next });
      return { ok: true, [key]: next };
    },

    async log(req, { db }) {
      const snap = await db.collection('adminLog').orderBy('at', 'desc').limit(80).get();
      const names = await profileNames(db, snap.docs.map((d) => d.get('targetUid')));
      return {
        log: snap.docs.map((d) => ({
          id: d.id,
          action: d.get('action'),
          at: ms(d.get('at')),
          byEmail: d.get('byEmail') || null,
          targetUid: d.get('targetUid') || null,
          targetName: names.get(d.get('targetUid')) || null,
          detail: d.get('detail') || {},
        })),
      };
    },
  };

  return async (req, ctx) => {
    if (!ctx.decoded || ctx.decoded.admin !== true) throw httpError(403, 'Owner access only.');
    const action = req.body && Object.prototype.hasOwnProperty.call(actions, req.body.action) ? actions[req.body.action] : null;
    if (!action) throw httpError(400, 'Unknown action.');
    return action(req, ctx);
  };
}

module.exports = { ageFrom, createAdminEndpoint, isLive, ms };
