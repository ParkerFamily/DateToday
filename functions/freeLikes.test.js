const test = require('node:test');
const assert = require('node:assert/strict');
const freeLikes = require('./freeLikes');

const config = freeLikes.freeLikesConfig(null);
const video = (uid, slot) =>
  `https://firebasestorage.googleapis.com/v0/b/datetoday-e1331.firebasestorage.app/o/users%2F${uid}%2Fvideos%2F${slot}.mp4?alt=media&token=t`;

test('defaults: 15 starter Likes, +3 for verifying, +3 for both videos, cap on', () => {
  assert.deepEqual(config, { enabled: true, starter: 15, verifiedBonus: 3, videoBonus: 3 });
  assert.equal(freeLikes.freeLikesConfig({ starter: 'x', enabled: false }).starter, 15);
  assert.equal(freeLikes.freeLikesConfig({ enabled: false }).enabled, false);
  assert.equal(freeLikes.freeLikesConfig({ starter: -4 }).starter, 0);
});

test('likesSummary: starter batch with no daily reset', () => {
  assert.deepEqual(freeLikes.likesSummary(config, undefined, {}, 'u1'), {
    left: 15,
    total: 15,
    verifiedBonus: false,
    videoBonus: false,
  });
  assert.equal(freeLikes.likesSummary(config, { used: 15 }, {}, 'u1').left, 0);
  assert.equal(freeLikes.likesSummary(config, { used: 40 }, {}, 'u1').left, 0);
});

test('bonuses: verification and both own videos each add 3, and stay once earned', () => {
  const verified = { verificationStatus: 'verified' };
  assert.equal(freeLikes.likesSummary(config, { used: 15 }, verified, 'u1').left, 3);
  const both = { aboutVideoUrl: video('u1', 'about'), tonightVideoUrl: video('u1', 'tonight') };
  assert.equal(freeLikes.likesSummary(config, { used: 15 }, both, 'u1').left, 3);
  assert.equal(freeLikes.likesSummary(config, { used: 0 }, { ...verified, ...both }, 'u1').total, 21);
  // Earned earlier, videos since removed: the bonus stays.
  assert.equal(freeLikes.likesSummary(config, { used: 15, videoBonus: true }, {}, 'u1').left, 3);
});

test('video bonus needs real uploads in their own folder, both slots', () => {
  assert.equal(freeLikes.isOwnVideo(video('u1', 'about'), 'u1'), true);
  assert.equal(freeLikes.isOwnVideo(video('u2', 'about'), 'u1'), false);
  assert.equal(freeLikes.isOwnVideo('https://example.com/users%2Fu1%2Fvideos%2Fa.mp4', 'u1'), false);
  const one = { aboutVideoUrl: video('u1', 'about') };
  assert.equal(freeLikes.earnedBonuses({}, one, 'u1').videoBonus, false);
});

test('countsAsLike: only a new free heart to someone who has not liked you', () => {
  const base = { plus: false, config, priority: false, alreadySent: false, theyLikedMe: false };
  assert.equal(freeLikes.countsAsLike(base), true);
  assert.equal(freeLikes.countsAsLike({ ...base, theyLikedMe: true }), false);
  assert.equal(freeLikes.countsAsLike({ ...base, alreadySent: true }), false);
  assert.equal(freeLikes.countsAsLike({ ...base, plus: true, config: null }), false);
  assert.equal(freeLikes.countsAsLike({ ...base, priority: true }), false);
  assert.equal(freeLikes.countsAsLike({ ...base, config: { ...config, enabled: false } }), false);
});

test('revealToken: stable per salt, different across members, no uid inside', () => {
  const a = freeLikes.revealToken('salt-1', 'personA');
  assert.equal(a, freeLikes.revealToken('salt-1', 'personA'));
  assert.notEqual(a, freeLikes.revealToken('salt-2', 'personA'));
  assert.notEqual(a, freeLikes.revealToken('salt-1', 'personB'));
  assert.equal(a.includes('personA'), false);
});
