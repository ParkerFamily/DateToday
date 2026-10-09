/**
 * Server-trusted DateToday+ checks and the "Likes you" inbox.
 *
 * Free members see one like (the oldest, until they match with that person); everyone else who
 * liked them comes back only as a tiny blurred thumbnail. Their uid, name and photo URL never
 * leave the server for a free member, so hidden likes can't be unmasked from the client.
 */
const { rankLikes } = require('./priorityLikes');

const ENTITLEMENT_ID = 'datetoday_pro';
const FREE_REVEALED = 1;
const MAX_LOCKED_THUMBS = 12;
/** Trust a positive check this long (capped at the entitlement's expiry). */
const PLUS_TTL_MS = 60 * 60 * 1000;
/** Re-ask RevenueCat this often for free members, so a fresh purchase shows up quickly. */
const FREE_TTL_MS = 60 * 1000;
const FRESH_MIN_GAP_MS = 5 * 1000;

function msOf(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/** Active, or in the store's billing grace period. No expiry = lifetime. */
function entitlementState(ent, now) {
  if (!ent) return { plus: false, expiresAt: null, productId: null };
  const exp = ent.expires_date ? Date.parse(ent.expires_date) : null;
  const grace = ent.grace_period_expires_date ? Date.parse(ent.grace_period_expires_date) : null;
  const until = Math.max(exp || 0, grace || 0) || null;
  const plus = exp == null || (until != null && until > now);
  return { plus, expiresAt: exp == null ? null : until, productId: ent.product_identifier || null };
}

function cachedPlus(cached, now) {
  if (!cached || !cached.plus) return false;
  return cached.expiresAt == null || cached.expiresAt > now;
}

/**
 * Asks RevenueCat (keyed by Firebase uid) whether this person has DateToday+, with a short cache in
 * entitlements/{uid}. Falls back to the last known answer if RevenueCat is unreachable.
 */
async function isPlusUser(db, uid, opts = {}) {
  const now = opts.now || Date.now();
  const fetchImpl = opts.fetchImpl || fetch;
  const apiKey = opts.apiKey != null ? opts.apiKey : process.env.REVENUECAT_API_KEY || '';
  const ref = db.collection('entitlements').doc(uid);
  const snap = await ref.get().catch(() => null);
  const cached = snap && snap.exists ? snap.data() : null;
  const age = cached ? now - (Number(cached.checkedAt) || 0) : Infinity;

  if (cached && !(opts.fresh && age > FRESH_MIN_GAP_MS)) {
    if (cached.plus && cachedPlus(cached, now) && age < PLUS_TTL_MS) return true;
    if (!cached.plus && age < FREE_TTL_MS) return false;
  }
  if (!apiKey) return cachedPlus(cached, now);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Platform': 'ios' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
    const json = await res.json();
    const ent = json && json.subscriber && json.subscriber.entitlements
      ? json.subscriber.entitlements[ENTITLEMENT_ID]
      : null;
    const state = entitlementState(ent, now);
    await ref.set({ ...state, checkedAt: now, source: 'revenuecat' }).catch(() => undefined);
    return state.plus;
  } catch (error) {
    console.warn('isPlusUser fell back to cache', uid, error && error.message);
    return cachedPlus(cached, now);
  } finally {
    clearTimeout(timer);
  }
}

/** Hearts from people I haven't matched with, passed on, blocked or been blocked by. Priority Likes first. */
async function pendingLikes(db, uid) {
  const [incoming, hidden, matches] = await Promise.all([
    db.collection('interests').where('toUid', '==', uid).limit(500).get(),
    db.collection('hiddenUsers').doc(uid).get(),
    db.collection('matches').where('userIds', 'array-contains', uid).limit(500).get(),
  ]);
  const hiddenIds = new Set((hidden.exists && hidden.data().uids) || []);
  const matched = new Set(matches.docs.flatMap((d) => d.data().userIds || []));
  const seen = new Set();
  const rows = [];
  for (const d of incoming.docs) {
    const data = d.data();
    const from = typeof data.fromUid === 'string' ? data.fromUid : '';
    if (!from || from === uid || hiddenIds.has(from) || matched.has(from) || seen.has(from)) continue;
    if (data.passedAt) continue;
    seen.add(from);
    const priority = data.type === 'priority';
    rows.push({
      fromUid: from,
      createdAt: msOf(data.createdAt),
      priority,
      priorityAt: priority ? msOf(data.priorityAt) : 0,
      note: priority && typeof data.note === 'string' ? data.note : null,
    });
  }
  if (!rows.length) return [];
  const profiles = await db.getAll(...rows.map((r) => db.collection('profiles').doc(r.fromUid)));
  return rankLikes(rows.map((r, i) => (profiles[i].exists ? { ...r, profile: profiles[i].data() } : null)).filter(Boolean));
}

/** Tiny blurred thumbnail: enough to tease, never enough to recognize. Cached per photo. */
async function blurThumb(db, uid, url, opts = {}) {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return null;
  const ref = db.collection('likeBlurs').doc(uid);
  const snap = await ref.get().catch(() => null);
  if (snap && snap.exists && snap.data().src === url) return snap.data().data || null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await (opts.fetchImpl || fetch)(url, { signal: controller.signal });
    if (!res.ok) return null;
    const sharp = require('sharp');
    const out = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize(12, 16, { fit: 'cover' })
      .blur(1)
      .jpeg({ quality: 40 })
      .toBuffer();
    const data = `data:image/jpeg;base64,${out.toString('base64')}`;
    await ref.set({ src: url, data, at: Date.now() }).catch(() => undefined);
    return data;
  } catch (error) {
    console.warn('blurThumb failed', error && error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function publicLike(row) {
  const p = row.profile || {};
  return {
    uid: row.fromUid,
    displayName: typeof p.displayName === 'string' ? p.displayName : 'Member',
    mainPhotoUrl: typeof p.mainPhotoUrl === 'string' ? p.mainPhotoUrl : null,
    verificationStatus: typeof p.verificationStatus === 'string' ? p.verificationStatus : 'unverified',
    likedAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    priority: Boolean(row.priority),
    note: row.priority ? row.note || null : null,
  };
}

/**
 * What a member may see of their likes. Locked entries carry no identity at all.
 * Priority Likes are always revealed: the sender paid to be seen.
 */
async function buildLikes(db, rows, plus, opts = {}) {
  const priorityRows = rows.filter((r) => r.priority);
  const normalRows = rows.filter((r) => !r.priority);
  const revealedRows = [...priorityRows, ...(plus ? normalRows : normalRows.slice(0, FREE_REVEALED))];
  const lockedRows = plus ? [] : normalRows.slice(FREE_REVEALED);
  const thumbs = await Promise.all(
    lockedRows
      .slice(0, MAX_LOCKED_THUMBS)
      .map((r) => blurThumb(db, r.fromUid, r.profile && r.profile.mainPhotoUrl, opts)),
  );
  return {
    plus,
    total: rows.length,
    revealed: revealedRows.map(publicLike),
    locked: thumbs.map((blur) => ({ blur })),
  };
}

/** Local midnight for a client UTC offset (minutes, as from Date#getTimezoneOffset). */
function localDayStart(now, tzOffsetMinutes) {
  const off = Number.isFinite(tzOffsetMinutes) ? Math.max(-840, Math.min(840, tzOffsetMinutes)) : 0;
  const DAY = 24 * 60 * 60 * 1000;
  return Math.floor((now - off * 60000) / DAY) * DAY + off * 60000;
}

module.exports = {
  ENTITLEMENT_ID,
  FREE_REVEALED,
  MAX_LOCKED_THUMBS,
  buildLikes,
  entitlementState,
  isPlusUser,
  localDayStart,
  pendingLikes,
};
