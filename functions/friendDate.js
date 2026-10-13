'use strict';

/**
 * Friend Date: platonic plans with people who are free today. It reuses Live, Likes, matches and
 * chat; only the intent differs, stored as `mode: 'friend'` on liveSessions, interests and matches
 * (missing = Dating). Free members get a few Friend Date Live sessions per rolling week; DateToday+
 * is unlimited. Likes come out of the one shared free allowance (freeLikes.js), never a second pool.
 *
 * appConfig/friendDate (admin-set, readable by the app): { enabled, freeSessionsPerWeek, passHours }
 * friendDateUsage/{uid}  (server only): { starts: [ms] } Friend Date sessions started, last 7 days
 * friendDatePasses/{uid} (server only, owner-readable): { until } Firestore rules require a current
 *   pass before a liveSessions doc can be active with mode 'friend'.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_CONFIG = { enabled: true, freeSessionsPerWeek: 3, passHours: 14 };

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function friendDateConfig(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    enabled: d.enabled !== false,
    freeSessionsPerWeek: clampInt(d.freeSessionsPerWeek, 0, 100, DEFAULT_CONFIG.freeSessionsPerWeek),
    passHours: clampInt(d.passHours, 1, 24, DEFAULT_CONFIG.passHours),
  };
}

async function loadConfig(db) {
  const snap = await db.collection('appConfig').doc('friendDate').get().catch(() => null);
  return friendDateConfig(snap && snap.exists ? snap.data() : null);
}

const isFriend = (d) => Boolean(d) && d.mode === 'friend';

function toMs(value) {
  if (value == null) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return Date.parse(value);
}

function recentStarts(usage, now) {
  const starts = Array.isArray(usage && usage.starts) ? usage.starts : [];
  return starts.filter((ms) => Number.isFinite(ms) && ms <= now && now - ms < WEEK_MS).sort((a, b) => a - b);
}

/** What the app shows: sessions left this week (null = unlimited) and when the oldest one frees up. */
function usageSummary(config, usage, { plus, now, passUntil = null }) {
  const starts = recentStarts(usage, now);
  const limit = config.freeSessionsPerWeek;
  const unlimited = plus || !config.enabled;
  const passMs = toMs(passUntil);
  return {
    enabled: config.enabled,
    plus: Boolean(plus),
    limit: unlimited ? null : limit,
    used: starts.length,
    left: unlimited ? null : Math.max(0, limit - starts.length),
    resetsAt: !unlimited && starts.length >= limit && starts.length ? new Date(starts[0] + WEEK_MS).toISOString() : null,
    passUntil: Number.isFinite(passMs) && passMs > now ? new Date(passMs).toISOString() : null,
  };
}

/**
 * Starting (or switching to) Friend Date Live. A pass that's still valid is reused for free, so
 * going offline and back on the same night isn't a second session. DateToday+ never counts.
 */
function planStart({ config, usage, pass, plus, now }) {
  const passMs = toMs(pass && pass.until);
  if (Number.isFinite(passMs) && passMs > now) return { allowed: true, count: false, passUntil: passMs };
  const until = now + config.passHours * HOUR_MS;
  if (plus) return { allowed: true, count: false, passUntil: until };
  const used = recentStarts(usage, now).length;
  if (used >= config.freeSessionsPerWeek) return { allowed: false, count: false, passUntil: null };
  return { allowed: true, count: true, passUntil: until };
}

function liveNow(d, now) {
  if (!d || d.status !== 'active' || d.endedAt) return false;
  const exp = toMs(d.expiresAt);
  return Number.isFinite(exp) && exp > now;
}

/**
 * Who a heart may reach in each mode. Friend Date: someone Live in Friend Date, or someone who opted
 * into Friend Date discovery and isn't Live for Dating right now. Dating never reaches someone who is
 * Live in Friend Date (they're only open to platonic plans tonight). Liking back is always allowed.
 */
function heartAllowed(mode, { theirLive, theirNearby, theyLikedMe, now }) {
  if (theyLikedMe) return { ok: true };
  const live = liveNow(theirLive, now) ? theirLive : null;
  if (mode === 'friend') {
    if (live && isFriend(live)) return { ok: true };
    if (!live && theirNearby && theirNearby.friendDate === true) return { ok: true };
    return { ok: false, code: 'not_friend_date', message: 'They aren’t open to Friend Date right now.' };
  }
  if (live && isFriend(live)) {
    return { ok: false, code: 'friend_date_only', message: 'They’re in Friend Date right now, so they’re only up for platonic plans.' };
  }
  return { ok: true };
}

/** A match is Friend Date if either heart was. Never silently upgraded to Dating. */
function matchMode(myMode, ...interests) {
  return myMode === 'friend' || interests.some(isFriend) ? 'friend' : 'dating';
}

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

/** POST { action: 'summary' | 'start' } (signed in). `hasPlus(db, uid, opts)` is DateToday+. */
function createFriendDateEndpoint({ hasPlus }) {
  return async (req, { db, decoded }) => {
    const action = req.body && req.body.action;
    if (action !== 'summary' && action !== 'start') throw httpError(400, 'Unknown action.');
    const uid = decoded.uid;
    const usageRef = db.collection('friendDateUsage').doc(uid);
    const passRef = db.collection('friendDatePasses').doc(uid);
    const config = await loadConfig(db);
    let plus = await hasPlus(db, uid);

    if (action === 'summary') {
      const [usage, pass] = await Promise.all([usageRef.get(), passRef.get()]);
      return usageSummary(config, usage.data(), { plus, now: Date.now(), passUntil: pass.exists ? pass.data().until : null });
    }

    if (!config.enabled) throw httpError(403, 'Friend Date isn’t available right now.', 'friend_date_unavailable');
    const attempt = () =>
      db.runTransaction(async (tx) => {
        const now = Date.now();
        const [usage, pass] = await Promise.all([tx.get(usageRef), tx.get(passRef)]);
        const plan = planStart({ config, usage: usage.data(), pass: pass.exists ? pass.data() : null, plus, now });
        if (!plan.allowed) return { plan, usage: usage.data(), now };
        let nextUsage = usage.data();
        if (plan.count) {
          nextUsage = { starts: [...recentStarts(usage.data(), now), now] };
          tx.set(usageRef, { ...nextUsage, updatedAt: FieldValue.serverTimestamp() });
        }
        if (!pass.exists || toMs(pass.data().until) !== plan.passUntil) {
          tx.set(passRef, { until: Timestamp.fromMillis(plan.passUntil), updatedAt: FieldValue.serverTimestamp() });
        }
        return { plan, usage: nextUsage, now };
      });

    let result = await attempt();
    if (!result.plan.allowed && !plus) {
      // Don't wall someone whose purchase just went through.
      plus = await hasPlus(db, uid, { fresh: true });
      if (plus) result = await attempt();
    }
    const summary = usageSummary(config, result.usage, {
      plus,
      now: result.now,
      passUntil: result.plan.passUntil,
    });
    if (!result.plan.allowed) {
      throw Object.assign(
        httpError(403, 'You’ve used this week’s free Friend Dates. DateToday+ makes them unlimited.', 'friend_date_limit'),
        { summary },
      );
    }
    return { ...summary, counted: result.plan.count };
  };
}

async function purgeUser(db, uid) {
  await Promise.all([
    db.collection('friendDateUsage').doc(uid).delete().catch(() => undefined),
    db.collection('friendDatePasses').doc(uid).delete().catch(() => undefined),
  ]);
}

module.exports = {
  DEFAULT_CONFIG,
  WEEK_MS,
  createFriendDateEndpoint,
  friendDateConfig,
  heartAllowed,
  isFriend,
  liveNow,
  loadConfig,
  matchMode,
  planStart,
  purgeUser,
  usageSummary,
};
