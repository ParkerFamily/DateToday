'use strict';

/**
 * Invite Friends: every member has one code. A friend who finished signing up in the last
 * REDEEM_WINDOW_MS enters it once; the inviter climbs the milestones and the friend gets a few
 * Likes too. Rewards are free-tier Likes and Like Reveals only, never DateToday+.
 *
 * referralCodes/{CODE}  (server only): { uid }
 * referralStats/{uid}   (server only): { code, invited }
 * referrals/{friendUid} (server only): { referrerUid, code }
 * likeCredits/{uid}     (server only): referralLikes, referralReveals, invitedLikes feed freeLikes.js
 */
const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_RE = new RegExp(`^[${CODE_CHARS}]{${CODE_LENGTH}}$`);
const REDEEM_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const FRIEND_LIKES = 5;
const MILESTONES = [
  { at: 1, likes: 5, label: '+5 Likes' },
  { at: 3, reveals: 1, label: '+1 Like Reveal' },
  { at: 5, likes: 10, label: '+10 Likes' },
  { at: 10, badge: true, label: 'Top Inviter badge' },
];
const UID = /^[A-Za-z0-9_-]{6,128}$/;

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function makeCode(bytes = crypto.randomBytes(CODE_LENGTH)) {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return out;
}

/** What people type or paste: "ab2c 3d4e", "AB2C-3D4E", or a whole invite link. */
function normalizeCode(raw) {
  const s = String(raw || '').toUpperCase();
  const fromLink = s.match(/(?:[?&]C=|INVITE\/)([A-Z0-9]{8})(?![A-Z0-9])/);
  const cleaned = fromLink ? fromLink[1] : s.replace(/[^A-Z0-9]/g, '');
  return CODE_RE.test(cleaned) ? cleaned : null;
}

/** Rewards for a number of friends who joined, all milestones reached so far added up. */
function rewardsFor(invited) {
  const n = Math.max(0, Number(invited) || 0);
  return MILESTONES.filter((m) => n >= m.at).reduce(
    (r, m) => ({
      likes: r.likes + (m.likes || 0),
      reveals: r.reveals + (m.reveals || 0),
      badge: r.badge || Boolean(m.badge),
    }),
    { likes: 0, reveals: 0, badge: false },
  );
}

function milestones(invited) {
  return MILESTONES.map((m) => ({ at: m.at, label: m.label, reached: invited >= m.at }));
}

function shareUrl(functionsBase, code) {
  return `${functionsBase}/invite?c=${code}`;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The page a shared invite link opens: tries the app, otherwise the App Store, and shows the code. */
function landingPage(code, { appStoreUrl, android }) {
  const c = code ? esc(code) : '';
  const deepLink = c ? `datetoday://invite/${c}` : 'datetoday://';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>You're invited to DateToday</title>
<meta property="og:title" content="You're invited to DateToday">
<meta property="og:description" content="See who's out tonight and make real plans.${c ? ` Use invite code ${c}.` : ''}">
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090B;color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;padding:32px 24px;text-align:center}
h1{font-size:30px;margin:0 0 8px;font-weight:800}
p{color:#92929D;line-height:1.5;margin:0 0 24px}
.code{display:inline-block;font:700 28px ui-monospace,Menlo,monospace;letter-spacing:4px;padding:14px 22px;border:1px solid #2A2438;border-radius:16px;background:#16131F;color:#22E58B;margin-bottom:24px;user-select:all}
a.btn{display:block;padding:16px;border-radius:14px;background:linear-gradient(90deg,#7C3AED,#C084FC);color:#fff;font-weight:800;text-decoration:none;margin-bottom:12px}
a.alt{color:#A855F7;font-weight:700;text-decoration:none}
small{display:block;color:#92929D;margin-top:20px}
</style></head><body><main>
<h1>You're invited to DateToday ⚡</h1>
<p>See who's out tonight and make real plans.${c ? ' Sign up, then enter this code in Settings → Invite Friends to get 5 bonus Likes.' : ''}</p>
${c ? `<div class="code">${c}</div>` : ''}
<a class="btn" href="${esc(appStoreUrl)}">Get DateToday on the App Store</a>
<a class="alt" href="${deepLink}">Already have the app? Open it</a>
${android ? '<small>DateToday for Android is coming to Google Play soon.</small>' : ''}
</main>
<script>setTimeout(function(){location.href=${JSON.stringify(deepLink)}},300)</script>
</body></html>`;
}

async function ensureCode(db, uid) {
  const statsRef = db.collection('referralStats').doc(uid);
  const snap = await statsRef.get();
  if (snap.exists && CODE_RE.test(snap.get('code') || '')) return { code: snap.get('code'), invited: Number(snap.get('invited')) || 0 };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeCode();
    try {
      await db.collection('referralCodes').doc(code).create({ uid, createdAt: FieldValue.serverTimestamp() });
    } catch {
      continue;
    }
    const kept = await db.runTransaction(async (tx) => {
      const again = await tx.get(statsRef);
      if (again.exists && CODE_RE.test(again.get('code') || '')) return again.get('code');
      tx.set(statsRef, { code, invited: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return code;
    });
    if (kept !== code) await db.collection('referralCodes').doc(code).delete().catch(() => undefined);
    return { code: kept, invited: Number(snap.exists && snap.get('invited')) || 0 };
  }
  throw httpError(503, 'Couldn’t make your invite code. Try again.');
}

async function deviceHashes(db, uid) {
  const snap = await db.collection('sessions').where('uid', '==', uid).limit(30).get();
  return new Set(snap.docs.map((d) => d.get('deviceHash')).filter(Boolean));
}

/** deps: functionsBase (string), pushToUser(db, uid, message), now(). */
function createReferralsEndpoint({ functionsBase, pushToUser, now = () => Date.now() }) {
  async function canRedeem(db, auth, uid) {
    const [mine, user] = await Promise.all([
      db.collection('referrals').doc(uid).get(),
      auth.getUser(uid).catch(() => null),
    ]);
    if (mine.exists) return { ok: false, reason: 'used', referrerUid: mine.get('referrerUid') || null };
    const created = user ? Date.parse(user.metadata.creationTime || '') || 0 : 0;
    if (!created || now() - created > REDEEM_WINDOW_MS) return { ok: false, reason: 'too_old' };
    return { ok: true };
  }

  const actions = {
    async summary(req, { db, auth, decoded }) {
      const uid = decoded.uid;
      const [{ code, invited }, redeem] = await Promise.all([ensureCode(db, uid), canRedeem(db, auth, uid)]);
      let invitedBy = null;
      if (redeem.reason === 'used' && redeem.referrerUid) {
        const p = await db.collection('profiles').doc(redeem.referrerUid).get();
        invitedBy = (p.exists && p.get('displayName')) || 'a friend';
      }
      const next = MILESTONES.find((m) => invited < m.at) || null;
      return {
        code,
        link: shareUrl(functionsBase, code),
        invited,
        rewards: rewardsFor(invited),
        milestones: milestones(invited),
        next: next ? { at: next.at, label: next.label, left: next.at - invited } : null,
        friendLikes: FRIEND_LIKES,
        canRedeem: redeem.ok,
        invitedBy,
      };
    },

    async redeem(req, { db, auth, decoded }) {
      const uid = decoded.uid;
      const code = normalizeCode(req.body.code);
      if (!code) throw httpError(400, 'That code doesn’t look right. Codes are 8 letters and numbers.');
      const [codeSnap, userSnap, redeem] = await Promise.all([
        db.collection('referralCodes').doc(code).get(),
        db.collection('users').doc(uid).get(),
        canRedeem(db, auth, uid),
      ]);
      if (!codeSnap.exists) throw httpError(404, 'No invite code like that. Check it and try again.', 'not_found');
      const referrerUid = codeSnap.get('uid');
      if (!UID.test(referrerUid || '')) throw httpError(404, 'No invite code like that. Check it and try again.', 'not_found');
      if (referrerUid === uid) throw httpError(400, 'That’s your own code. Share it with friends instead.', 'own_code');
      if (redeem.reason === 'used') throw httpError(409, 'You’ve already used an invite code.', 'used');
      if (!redeem.ok) throw httpError(403, 'Invite codes are for new accounts, within 2 weeks of joining.', 'too_old');
      if (!userSnap.exists || userSnap.get('onboardingComplete') !== true) {
        throw httpError(400, 'Finish setting up your profile first.');
      }
      const referrer = await auth.getUser(referrerUid).catch(() => null);
      if (!referrer || referrer.disabled) throw httpError(404, 'That invite code isn’t active anymore.', 'not_found');
      const [mine, theirs] = await Promise.all([deviceHashes(db, uid), deviceHashes(db, referrerUid)]);
      if ([...mine].some((h) => theirs.has(h))) {
        throw httpError(403, 'Invite codes only count for a friend’s own phone.', 'same_device');
      }

      const statsRef = db.collection('referralStats').doc(referrerUid);
      const invited = await db.runTransaction(async (tx) => {
        const [already, stats] = await Promise.all([tx.get(db.collection('referrals').doc(uid)), tx.get(statsRef)]);
        if (already.exists) throw httpError(409, 'You’ve already used an invite code.', 'used');
        const count = (Number(stats.exists && stats.get('invited')) || 0) + 1;
        const reward = rewardsFor(count);
        tx.create(db.collection('referrals').doc(uid), { referrerUid, code, at: FieldValue.serverTimestamp() });
        tx.set(statsRef, { invited: count, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(
          db.collection('likeCredits').doc(referrerUid),
          { referralLikes: reward.likes, referralReveals: reward.reveals },
          { merge: true },
        );
        tx.set(db.collection('likeCredits').doc(uid), { invitedLikes: FRIEND_LIKES }, { merge: true });
        if (reward.badge) tx.set(db.collection('userStats').doc(referrerUid), { topInviter: true }, { merge: true });
        return count;
      });

      const bump = { version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
      await Promise.all(
        [uid, referrerUid].map((u) => db.collection('likeInbox').doc(u).set(bump, { merge: true }).catch(() => undefined)),
      );
      const reached = MILESTONES.find((m) => m.at === invited);
      const friend = (userSnap.get('displayName') || 'A friend').split(' ')[0];
      await pushToUser(db, referrerUid, {
        title: `${friend} joined with your invite`,
        body: reached ? `You unlocked ${reached.label}.` : `${invited} friends joined so far. Keep going!`,
        data: { type: 'referral', url: '/settings/invite' },
      }).catch((e) => console.warn('referral push failed', e && e.message));
      return { ok: true, friendLikes: FRIEND_LIKES };
    },
  };

  return async (req, ctx) => {
    const action = req.body && Object.prototype.hasOwnProperty.call(actions, req.body.action) ? actions[req.body.action] : null;
    if (!action) throw httpError(400, 'Unknown action.');
    return action(req, ctx);
  };
}

module.exports = {
  CODE_CHARS,
  FRIEND_LIKES,
  MILESTONES,
  REDEEM_WINDOW_MS,
  createReferralsEndpoint,
  landingPage,
  makeCode,
  normalizeCode,
  rewardsFor,
};
