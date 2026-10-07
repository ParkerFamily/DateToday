const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LIVE_SESSION_DEFAULT_MS,
  NUDGE,
  STAY_GRACE_MS,
  isLive,
  liveDuration,
  mutuallyVisible,
  nudgeAllowed,
  stayLiveExpiry,
} = require('./liveEngagement');

const NOW = Date.parse('2026-10-07T23:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
const HOUR = 60 * 60 * 1000;

function session(overrides = {}) {
  return {
    status: 'active',
    endedAt: null,
    startedAt: iso(NOW - HOUR),
    expiresAt: iso(NOW + 10 * 60 * 1000),
    nightResetAt: iso(NOW + 6 * HOUR),
    liveDurationMs: 2 * HOUR,
    ...overrides,
  };
}

test('Stay Live extends by the session duration from now', () => {
  assert.equal(stayLiveExpiry(session(), NOW), NOW + 2 * HOUR);
});

test('Stay Live never runs past the nightly reset', () => {
  assert.equal(stayLiveExpiry(session({ nightResetAt: iso(NOW + 30 * 60 * 1000) }), NOW), NOW + 30 * 60 * 1000);
  assert.equal(stayLiveExpiry(session({ nightResetAt: iso(NOW - 1) }), NOW), null);
});

test('Stay Live never shortens a longer session', () => {
  const far = NOW + 3 * HOUR;
  assert.equal(stayLiveExpiry(session({ expiresAt: iso(far) }), NOW), far);
});

test('Stay Live works shortly after expiry, not after Go Offline or long after', () => {
  const lapsed = session({ status: 'ended', endedAt: iso(NOW - 60_000), endedReason: 'expired', expiresAt: iso(NOW - 60_000) });
  assert.equal(stayLiveExpiry(lapsed, NOW), NOW + 2 * HOUR);
  assert.equal(stayLiveExpiry({ ...lapsed, endedReason: 'offline' }, NOW), null);
  assert.equal(stayLiveExpiry({ ...lapsed, expiresAt: iso(NOW - STAY_GRACE_MS - 1) }, NOW), null);
  assert.equal(stayLiveExpiry(null, NOW), null);
});

test('session duration is clamped; missing uses the default', () => {
  assert.equal(liveDuration({}), LIVE_SESSION_DEFAULT_MS);
  assert.equal(liveDuration({ liveDurationMs: 60_000 }), 15 * 60 * 1000);
  assert.equal(liveDuration({ liveDurationMs: 48 * HOUR }), 6 * HOUR);
});

test('isLive respects expiry, ended state and the nightly reset', () => {
  assert.equal(isLive(session(), NOW), true);
  assert.equal(isLive(session({ expiresAt: iso(NOW - 1) }), NOW), false);
  assert.equal(isLive(session({ endedAt: iso(NOW) }), NOW), false);
  assert.equal(isLive(session({ nightResetAt: iso(NOW - 1) }), NOW), false);
});

test('nudges are capped per night, spaced out, and deduped per key', () => {
  const opts = { kind: 'still', key: 'k1', nightKey: 'n1', gapMs: NUDGE.minGapMs, now: NOW };
  assert.equal(nudgeAllowed(null, opts), true);
  assert.equal(nudgeAllowed({ nightKey: 'n1', nightCount: NUDGE.maxPerNight }, opts), false);
  assert.equal(nudgeAllowed({ nightKey: 'n0', nightCount: NUDGE.maxPerNight }, opts), true);
  assert.equal(nudgeAllowed({ lastSentAt: NOW - 60_000 }, opts), false);
  assert.equal(nudgeAllowed({ sent: { still: 'k1' } }, opts), false);
  assert.equal(nudgeAllowed({ sent: { still: 'k0' } }, opts), true);
  assert.equal(nudgeAllowed({}, { ...opts, allow: () => false }), false);
});

test('mutual visibility needs both radii and both "show me" prefs', () => {
  const a = { latitude: 33.75, longitude: -84.39, radiusMiles: 10, gender: 'man', interestedIn: 'women' };
  const b = { latitude: 33.78, longitude: -84.38, radiusMiles: 5, gender: 'woman', interestedIn: 'men' };
  assert.equal(mutuallyVisible(a, b), true);
  assert.equal(mutuallyVisible(a, { ...b, interestedIn: 'women' }), false);
  assert.equal(mutuallyVisible(a, { ...b, latitude: 34.5 }), false);
  assert.equal(mutuallyVisible(a, { ...b, latitude: undefined }), false);
});
