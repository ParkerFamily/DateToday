/**
 * Free members get a starter batch of Likes (no daily reset) plus one-time bonuses for getting
 * photo-verified and adding both profile videos. Liking back someone who already liked you is
 * always free. One free Like Reveal lets them pick a single hidden like to see.
 *
 * likeCredits/{uid} (server only): { used, verifiedBonus, videoBonus, revealUsed, revealedUid, revealedUids,
 *   referralLikes, referralReveals, invitedLikes }
 * likeRevealKeys/{uid} (server only): { salt } — keys the opaque tokens on locked likes.
 */
const crypto = require('crypto');

const DEFAULT_CONFIG = { enabled: true, starter: 15, verifiedBonus: 3, videoBonus: 3 };

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** appConfig/freeLikes, with safe defaults. `enabled: false` turns the cap off entirely. */
function freeLikesConfig(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    enabled: d.enabled !== false,
    starter: clampInt(d.starter, 0, 1000, DEFAULT_CONFIG.starter),
    verifiedBonus: clampInt(d.verifiedBonus, 0, 100, DEFAULT_CONFIG.verifiedBonus),
    videoBonus: clampInt(d.videoBonus, 0, 100, DEFAULT_CONFIG.videoBonus),
  };
}

async function loadConfig(db) {
  const snap = await db.collection('appConfig').doc('freeLikes').get().catch(() => null);
  return freeLikesConfig(snap && snap.exists ? snap.data() : null);
}

/** A video this member really uploaded to their own folder in our bucket. */
function isOwnVideo(url, uid) {
  if (typeof url !== 'string' || !url.startsWith('https://firebasestorage.googleapis.com/')) return false;
  return url.includes(`/o/users%2F${encodeURIComponent(uid)}%2Fvideos%2F`);
}

/** Bonuses earned now, kept once earned (removing a video later doesn't take Likes back). */
function earnedBonuses(credits, user, uid) {
  const c = credits || {};
  const u = user || {};
  return {
    verifiedBonus: Boolean(c.verifiedBonus) || u.verificationStatus === 'verified',
    videoBonus: Boolean(c.videoBonus) || (isOwnVideo(u.aboutVideoUrl, uid) && isOwnVideo(u.tonightVideoUrl, uid)),
  };
}

function allowance(config, bonuses) {
  return (
    config.starter +
    (bonuses.verifiedBonus ? config.verifiedBonus : 0) +
    (bonuses.videoBonus ? config.videoBonus : 0)
  );
}

const count = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** Likes earned from Invite Friends: as the inviter, and as the friend who used a code. */
function inviteLikes(credits) {
  const c = credits || {};
  return count(c.referralLikes) + count(c.invitedLikes);
}

/** Everyone the member has revealed, including the single pick from before reveals were counted. */
function revealedUids(credits) {
  const c = credits || {};
  const list = Array.isArray(c.revealedUids) ? c.revealedUids.filter((u) => typeof u === 'string') : [];
  if (typeof c.revealedUid === 'string' && !list.includes(c.revealedUid)) list.unshift(c.revealedUid);
  return list;
}

/** One free Like Reveal, plus any earned by inviting friends. */
function revealsLeft(credits) {
  const c = credits || {};
  const used = Math.max(revealedUids(c).length, c.revealUsed ? 1 : 0);
  return Math.max(0, 1 + count(c.referralReveals) - used);
}

/** What the app shows: Likes left, out of how many. */
function likesSummary(config, credits, user, uid) {
  const bonuses = earnedBonuses(credits, user, uid);
  const total = allowance(config, bonuses) + inviteLikes(credits);
  const used = Math.max(0, Number(credits && credits.used) || 0);
  return { left: Math.max(0, total - used), total, ...bonuses };
}

/**
 * Only a brand-new, non-priority heart to someone who hasn't liked you yet uses a Like.
 * Plus members and a switched-off config never count.
 */
function countsAsLike({ plus, config, priority, alreadySent, theyLikedMe }) {
  return !plus && config.enabled && !priority && !alreadySent && !theyLikedMe;
}

/** Opaque per-member handle for a locked like; useless without the server-only salt. */
function revealToken(salt, fromUid) {
  return crypto.createHash('sha256').update(`${salt}:${fromUid}`).digest('base64url').slice(0, 22);
}

async function revealSalt(db, uid) {
  const ref = db.collection('likeRevealKeys').doc(uid);
  const snap = await ref.get();
  if (snap.exists && typeof snap.data().salt === 'string') return snap.data().salt;
  const salt = crypto.randomBytes(16).toString('hex');
  await ref.create({ salt }).catch(() => undefined);
  const again = await ref.get();
  return (again.exists && again.data().salt) || salt;
}

module.exports = {
  DEFAULT_CONFIG,
  allowance,
  countsAsLike,
  earnedBonuses,
  freeLikesConfig,
  inviteLikes,
  isOwnVideo,
  likesSummary,
  loadConfig,
  revealSalt,
  revealToken,
  revealedUids,
  revealsLeft,
};
