/**
 * Live engagement: Stay Live / Go Offline (from notification actions or in-app) and a few
 * throttled pushes while someone is Live. Live = actively looking right now; it's a short
 * session (expiresAt) separate from Free Until (availableUntil), and never runs past the
 * user's local nightly reset (nightResetAt, written by the app).
 */

// Mirrors constants/liveConfig.ts. The app writes liveDurationMs per session; clamp it here.
const LIVE_SESSION_DEFAULT_MS = 3 * 60 * 60 * 1000;
const LIVE_SESSION_MIN_MS = 15 * 60 * 1000;
const LIVE_SESSION_MAX_MS = 6 * 60 * 60 * 1000;
const LIVE_ENDING_WARN_MS = 15 * 60 * 1000;
/** "Stay Live" still works if the tap lands shortly after Live lapsed. */
const STAY_GRACE_MS = 20 * 60 * 1000;
/** Sessions written without a nightly reset (older app versions). */
const FALLBACK_RESET_MS = 12 * 60 * 60 * 1000;

const NUDGE = {
  /** Hard cap of Live pushes per person per night, all kinds combined. */
  maxPerNight: 4,
  /** Minimum spacing between Live pushes to the same person. */
  minGapMs: 30 * 60 * 1000,
  /** "About to end" is the one that matters most; allow it sooner after another push. */
  endingGapMs: 10 * 60 * 1000,
  stillLiveAfterMs: 45 * 60 * 1000,
  /** Only nudge "You're still Live" when the app hasn't been open for this long. */
  idleMs: 30 * 60 * 1000,
  stillLookingAfterMs: 90 * 60 * 1000,
  /** "More people are out tonight" needs at least this many Live nearby, and this many more than last time. */
  moreMin: 3,
  moreStep: 3,
  /** Fan-out cap for "Someone new just went Live nearby". */
  newNearbyMaxRecipients: 50,
};

const LIVE_URL = '/live';

function toMs(value) {
  if (typeof value === 'string') return Date.parse(value);
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return NaN;
}

function liveDuration(d) {
  const n = Number(d && d.liveDurationMs);
  if (!Number.isFinite(n) || n <= 0) return LIVE_SESSION_DEFAULT_MS;
  return Math.min(LIVE_SESSION_MAX_MS, Math.max(LIVE_SESSION_MIN_MS, n));
}

function nightResetMs(d, now) {
  const t = toMs(d && d.nightResetAt);
  if (Number.isFinite(t)) return t;
  const start = toMs(d && d.startedAt);
  return (Number.isFinite(start) ? start : now) + FALLBACK_RESET_MS;
}

function isLive(d, now) {
  return Boolean(d) && d.status === 'active' && !d.endedAt && toMs(d.expiresAt) > now && now < nightResetMs(d, now);
}

/**
 * Stay Live: a fresh session window from now, never shorter than what's left, never past the
 * nightly reset. Returns null when the session can't be extended (ended, lapsed, past reset).
 */
function stayLiveExpiry(d, now) {
  if (!d) return null;
  const exp = toMs(d.expiresAt);
  const lapsed = d.status !== 'active' || d.endedAt;
  if (lapsed && d.endedReason !== 'expired') return null;
  if (!Number.isFinite(exp) || exp <= now - STAY_GRACE_MS) return null;
  const reset = nightResetMs(d, now);
  if (now >= reset) return null;
  return Math.max(exp, Math.min(now + liveDuration(d), reset));
}

function milesBetween(a, b) {
  const r = (v) => (v * Math.PI) / 180;
  const dLat = r(b.latitude - a.latitude);
  const dLon = r(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Live in Travel Mode: placed at a chosen city, not where their phone is. */
function isTraveling(d) {
  return Boolean(d && d.trip && typeof d.trip.city === 'string');
}

/** Same rule as wantsToSee() in features/live/firestoreLive.ts. */
function wantsToSee(viewer, other) {
  const pref = viewer.interestedIn;
  const gender = other.gender;
  if (pref === 'men' && gender && gender !== 'man') return false;
  if (pref === 'women' && gender && gender !== 'woman') return false;
  return true;
}

/** Both would see each other in Out Tonight: inside both radii and both "show me" prefs. */
function mutuallyVisible(a, b) {
  const pa = { latitude: Number(a.latitude), longitude: Number(a.longitude) };
  const pb = { latitude: Number(b.latitude), longitude: Number(b.longitude) };
  if (![pa.latitude, pa.longitude, pb.latitude, pb.longitude].every(Number.isFinite)) return false;
  const limit = Math.min(Number(a.radiusMiles) || 10, Number(b.radiusMiles) || 10);
  return milesBetween(pa, pb) <= limit && wantsToSee(a, b) && wantsToSee(b, a);
}

/**
 * Pure throttle decision for one push. `state` is liveNudges/{uid}.
 * key dedupes per session/window (e.g. the expiresAt an "about to end" was sent for).
 */
function nudgeAllowed(state, { kind, key, nightKey, gapMs, now, allow }) {
  const s = state || {};
  const count = s.nightKey === nightKey ? Number(s.nightCount) || 0 : 0;
  if (count >= NUDGE.maxPerNight) return false;
  if (now - (Number(s.lastSentAt) || 0) < gapMs) return false;
  if (key != null && s.sent && s.sent[kind] === key) return false;
  if (allow && !allow(s)) return false;
  return true;
}

/** Claims a push slot in a transaction so the sweep and triggers can't double-send. */
async function claimNudge(db, FieldValue, uid, opts) {
  const ref = db.collection('liveNudges').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = snap.exists ? snap.data() : null;
    if (!nudgeAllowed(state, opts)) return false;
    const sameNight = state && state.nightKey === opts.nightKey;
    tx.set(
      ref,
      {
        nightKey: opts.nightKey,
        nightCount: (sameNight ? Number(state.nightCount) || 0 : 0) + 1,
        lastSentAt: opts.now,
        sent: { [opts.kind]: opts.key != null ? opts.key : opts.now },
        ...(opts.extra || {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return true;
  });
}

function nightKeyOf(d, now) {
  return String(Math.round(nightResetMs(d, now)));
}

/** Body of the liveAction HTTPS function. */
async function liveAction(req, res, { db, FieldValue, requireUser }) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    const decoded = await requireUser(req);
    const action = req.body && req.body.action;
    if (action !== 'stay' && action !== 'offline') return res.status(400).json({ error: 'Invalid action.' });
    const rawNonce = req.body && req.body.nonce;
    const nonce = typeof rawNonce === 'string' && /^[A-Za-z0-9:_.-]{1,160}$/.test(rawNonce) ? rawNonce : null;
    const ref = db.collection('liveSessions').doc(decoded.uid);
    const now = Date.now();

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() : null;
      if (action === 'offline') {
        // Ends Live and its priority only; nearby presence (if they allow it) is untouched.
        if (d && d.status === 'active' && !d.endedAt) {
          tx.set(
            ref,
            {
              status: 'ended',
              endedAt: new Date(now).toISOString(),
              endedReason: 'offline',
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        return { live: false, expiresAt: null };
      }
      if (nonce && d && d.lastActionNonce === nonce) {
        return { live: isLive(d, now), expiresAt: d.expiresAt || null };
      }
      const next = stayLiveExpiry(d, now);
      if (next == null) return { live: false, expiresAt: null, gone: true };
      const expiresAt = new Date(next).toISOString();
      tx.set(
        ref,
        {
          status: 'active',
          endedAt: null,
          endedReason: null,
          expiresAt,
          confirmedAt: new Date(now).toISOString(),
          lastActionNonce: nonce,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { live: true, expiresAt };
    });

    if (result.gone) return res.status(409).json({ error: 'You’re not Live right now. Go Live again from the app.', live: false });
    return res.json({ live: result.live, expiresAt: result.expiresAt });
  } catch (error) {
    console.error('liveAction failed', error);
    return res.status(error.status || 500).json({ error: 'Could not update Live right now.' });
  }
}

/** Scheduled: retire expired sessions, then send at most one throttled Live push per person. */
async function liveEngagementSweep({ db, FieldValue, pushToUser, now = Date.now() }) {
  const snap = await db.collection('liveSessions').where('status', '==', 'active').limit(500).get();
  const live = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (isLive(d, now)) {
      live.push({ uid: doc.id, d });
      continue;
    }
    if (d.endedAt) continue;
    // Expired or past the nightly reset: drop the Live badge/priority. Nearby presence stays.
    const end = Math.min(toMs(d.expiresAt) || now, nightResetMs(d, now), now);
    const ended = await doc.ref
      .set(
        { status: 'ended', endedAt: new Date(end).toISOString(), endedReason: 'expired', updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
      .then(() => true)
      .catch((e) => {
        console.warn('expire live failed', doc.id, e && e.message);
        return false;
      });
    // Android's pinned "You're live" notification can't expire on its own; this lets the app clear it while closed.
    if (ended) {
      await pushToUser(db, doc.id, { data: { type: 'live_ended' } }, { platform: 'android', silent: true }).catch(
        () => undefined,
      );
    }
  }

  let sent = 0;
  for (const { uid, d } of live) {
    const exp = toMs(d.expiresAt);
    const left = exp - now;
    const nightKey = nightKeyOf(d, now);
    const lastConfirm = toMs(d.confirmedAt) || toMs(d.startedAt);
    const since = Number.isFinite(lastConfirm) ? now - lastConfirm : 0;
    const base = { nightKey, now };
    const send = async (kind, opts, message) => {
      const ok = await claimNudge(db, FieldValue, uid, { kind, ...base, ...opts }).catch(() => false);
      if (!ok) return false;
      await pushToUser(db, uid, message);
      sent += 1;
      return true;
    };

    if (left <= LIVE_ENDING_WARN_MS) {
      await send(
        'ending',
        { key: String(d.expiresAt), gapMs: NUDGE.endingGapMs },
        {
          title: 'Your Live session is about to end',
          body: 'Stay Live to keep showing up first tonight.',
          data: { type: 'live_ending', url: LIVE_URL, expiresAt: String(d.expiresAt) },
        },
      );
      continue;
    }

    if (since >= NUDGE.stillLookingAfterMs && left > 2 * LIVE_ENDING_WARN_MS) {
      const ok = await send(
        'looking',
        { key: String(d.confirmedAt || d.startedAt), gapMs: NUDGE.minGapMs },
        {
          title: 'Still looking tonight?',
          body: 'Stay Live so people nearby know you’re free.',
          data: { type: 'live_check', url: LIVE_URL, expiresAt: String(d.expiresAt) },
        },
      );
      if (ok) continue;
    }

    const others = isTraveling(d)
      ? 0
      : live.filter((o) => o.uid !== uid && !isTraveling(o.d) && mutuallyVisible(d, o.d)).length;
    if (others >= NUDGE.moreMin) {
      const ok = await send(
        'more',
        {
          key: String(others),
          gapMs: NUDGE.minGapMs,
          allow: (s) => others >= (Number(s.moreCount) || 0) + NUDGE.moreStep,
          extra: { moreCount: others },
        },
        {
          title: 'More people are out tonight',
          body: `${others} people are Live near you right now.`,
          data: { type: 'live_more', url: LIVE_URL },
        },
      );
      if (ok) continue;
    }

    if (since >= NUDGE.stillLiveAfterMs) {
      const presence = await db.collection('nearbyProfiles').doc(uid).get().catch(() => null);
      const seen = presence && presence.exists ? toMs(presence.data().lastActiveAt) : NaN;
      if (!Number.isFinite(seen) || now - seen >= NUDGE.idleMs) {
        await send(
          'still',
          { key: String(d.startedAt), gapMs: NUDGE.minGapMs },
          {
            title: 'You’re still Live ⚡',
            body: 'People nearby can still see you.',
            data: { type: 'live_still', url: LIVE_URL },
          },
        );
      }
    }
  }
  return { live: live.length, sent };
}

/** Someone just went Live: tell a few nearby Live people who'd see them (throttled per recipient). */
async function notifyNewLiveNearby({ db, FieldValue, pushToUser, isHiddenFrom, uid, session, now = Date.now() }) {
  // Travel Mode sessions sit at a city they may not be in yet; never pitch them as "nearby".
  if (!isLive(session, now) || isTraveling(session)) return 0;
  const snap = await db.collection('liveSessions').where('status', '==', 'active').limit(500).get();
  const recipients = snap.docs
    .filter(
      (doc) =>
        doc.id !== uid && isLive(doc.data(), now) && !isTraveling(doc.data()) && mutuallyVisible(session, doc.data()),
    )
    .map((doc) => ({
      uid: doc.id,
      d: doc.data(),
      miles: milesBetween(
        { latitude: Number(session.latitude), longitude: Number(session.longitude) },
        { latitude: Number(doc.data().latitude), longitude: Number(doc.data().longitude) },
      ),
    }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, NUDGE.newNearbyMaxRecipients);

  let sent = 0;
  for (const r of recipients) {
    if (await isHiddenFrom(db, r.uid, uid).catch(() => true)) continue;
    const ok = await claimNudge(db, FieldValue, r.uid, {
      kind: 'newNearby',
      key: `${uid}:${String(session.startedAt)}`,
      nightKey: nightKeyOf(r.d, now),
      gapMs: NUDGE.minGapMs,
      now,
    }).catch(() => false);
    if (!ok) continue;
    await pushToUser(db, r.uid, {
      title: 'Someone new just went Live nearby',
      body: 'Tap to see who’s out tonight.',
      data: { type: 'live_new_nearby', url: LIVE_URL },
    });
    sent += 1;
  }
  return sent;
}

module.exports = {
  LIVE_SESSION_DEFAULT_MS,
  LIVE_ENDING_WARN_MS,
  NUDGE,
  STAY_GRACE_MS,
  isLive,
  liveAction,
  liveDuration,
  liveEngagementSweep,
  mutuallyVisible,
  notifyNewLiveNearby,
  nudgeAllowed,
  stayLiveExpiry,
};
