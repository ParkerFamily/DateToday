'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const referrals = require('./referrals');
const freeLikes = require('./freeLikes');

test('makeCode: 8 characters from the unambiguous set', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = referrals.makeCode();
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  }
});

test('normalizeCode: typed, spaced, dashed, or pasted as a link', () => {
  assert.equal(referrals.normalizeCode('ab2c3d4e'), 'AB2C3D4E');
  assert.equal(referrals.normalizeCode(' ab2c 3d4e '), 'AB2C3D4E');
  assert.equal(referrals.normalizeCode('AB2C-3D4E'), 'AB2C3D4E');
  assert.equal(referrals.normalizeCode('https://x.net/invite?c=AB2C3D4E'), 'AB2C3D4E');
  assert.equal(referrals.normalizeCode('datetoday://invite/ab2c3d4e'), 'AB2C3D4E');
  assert.equal(referrals.normalizeCode('https://datetd.com/invite/AB2C3D4E'), 'AB2C3D4E');
  assert.equal(referrals.normalizeCode('AB2C3D4'), null);
  assert.equal(referrals.normalizeCode('AB2C3D4O'), null);
  assert.equal(referrals.normalizeCode(''), null);
});

test('rewardsFor: milestones add up and never include DateToday+', () => {
  assert.deepEqual(referrals.rewardsFor(0), { likes: 0, reveals: 0, badge: false });
  assert.deepEqual(referrals.rewardsFor(1), { likes: 5, reveals: 0, badge: false });
  assert.deepEqual(referrals.rewardsFor(3), { likes: 5, reveals: 1, badge: false });
  assert.deepEqual(referrals.rewardsFor(5), { likes: 15, reveals: 1, badge: false });
  assert.deepEqual(referrals.rewardsFor(10), { likes: 15, reveals: 1, badge: true });
  assert.deepEqual(referrals.rewardsFor(40), { likes: 15, reveals: 1, badge: true });
  assert.ok(referrals.MILESTONES.every((m) => !/plus|premium/i.test(m.label)));
});

test('freeLikes: invite Likes raise the allowance', () => {
  const config = freeLikes.freeLikesConfig({});
  const base = freeLikes.likesSummary(config, { used: 2 }, {}, 'u1');
  const more = freeLikes.likesSummary(config, { used: 2, referralLikes: 15, invitedLikes: 5 }, {}, 'u1');
  assert.equal(more.total - base.total, 20);
  assert.equal(more.left - base.left, 20);
});

test('freeLikes: one reveal, plus earned ones; the old single pick still counts', () => {
  assert.equal(freeLikes.revealsLeft({}), 1);
  assert.equal(freeLikes.revealsLeft({ revealUsed: true, revealedUid: 'a' }), 0);
  assert.equal(freeLikes.revealsLeft({ revealUsed: true, revealedUid: 'a', referralReveals: 1 }), 1);
  assert.equal(freeLikes.revealsLeft({ revealedUids: ['a', 'b'], revealedUid: 'b', referralReveals: 1 }), 0);
  assert.deepEqual(freeLikes.revealedUids({ revealedUid: 'a' }), ['a']);
  assert.deepEqual(freeLikes.revealedUids({ revealedUid: 'b', revealedUids: ['a', 'b'] }), ['a', 'b']);
});

test('referrals endpoint: unknown actions are refused', async () => {
  const handler = referrals.createReferralsEndpoint({ pushToUser: async () => {} });
  await assert.rejects(() => handler({ body: { action: 'toString' } }, {}), (e) => e.status === 400);
});
