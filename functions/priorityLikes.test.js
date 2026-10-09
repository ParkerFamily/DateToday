const test = require('node:test');
const assert = require('node:assert/strict');
const pl = require('./priorityLikes');

const err = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test('notes: trimmed to one line, empty means no note', () => {
  assert.equal(pl.cleanNote('  Drinks   tonight?\n '), 'Drinks tonight?');
  assert.equal(pl.cleanNote(''), null);
  assert.equal(pl.cleanNote('   '), null);
  assert.equal(pl.cleanNote(undefined), null);
  assert.equal(pl.cleanNote('You seem exactly my vibe.'), 'You seem exactly my vibe.');
  assert.equal(pl.cleanNote('Dinner at 7:30 later?'), 'Dinner at 7:30 later?');
  assert.equal(err(() => pl.cleanNote(42)), 'note_invalid');
});

test('notes: strict, configurable length', () => {
  assert.equal(pl.cleanNote('x'.repeat(80)).length, 80);
  assert.equal(err(() => pl.cleanNote('x'.repeat(81))), 'note_too_long');
  assert.equal(err(() => pl.cleanNote('x'.repeat(41), 40)), 'note_too_long');
});

test('notes: no links, emails, handles or phone numbers', () => {
  for (const bad of [
    'see https://x.co',
    'www.mysite',
    'my site is joe.com',
    'joe (dot) com',
    'me@mail.com',
    'me (at) gmail.com',
    'add @joe_23',
    'snap: joe23',
    'text 216-555-0199',
    'call (216) 555 0199',
    '2165550199',
  ]) {
    assert.equal(err(() => pl.cleanNote(bad)), 'note_contact', bad);
  }
});

test('notes: slurs and explicit asks are refused, including simple swaps', () => {
  assert.equal(err(() => pl.cleanNote('send nudes')), 'note_blocked');
  assert.equal(err(() => pl.cleanNote('you wh0re')), 'note_blocked');
  assert.equal(pl.cleanNote('Cocktails later?'), 'Cocktails later?');
});

test('ranking: priority first (newest first), then normal oldest first', () => {
  const out = pl.rankLikes([
    { fromUid: 'n2', createdAt: 2 },
    { fromUid: 'p1', createdAt: 5, priority: true, priorityAt: 5 },
    { fromUid: 'n1', createdAt: 1 },
    { fromUid: 'p2', createdAt: 3, priority: true, priorityAt: 8 },
  ]);
  assert.deepEqual(out.map((r) => r.fromUid), ['p2', 'p1', 'n1', 'n2']);
});

test('config: defaults and clamped overrides', () => {
  assert.deepEqual(pl.normalizeConfig(null), { enabled: true, noteMaxChars: 80, dailyLimit: 5 });
  assert.deepEqual(pl.normalizeConfig({ enabled: false, noteMaxChars: 5000, dailyLimit: 0 }), {
    enabled: false,
    noteMaxChars: 200,
    dailyLimit: 1,
  });
});

test('preferences: unknown gender never passes a specific preference', () => {
  assert.equal(pl.interestedIn('women', 'woman'), true);
  assert.equal(pl.interestedIn('women', 'man'), false);
  assert.equal(pl.interestedIn('women', undefined), false);
  assert.equal(pl.interestedIn('everyone', 'nonbinary'), true);
  assert.equal(pl.interestedIn(undefined, 'woman'), false);
});
