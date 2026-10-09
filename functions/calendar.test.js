const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIcs, eventFor, googleCalendarUrl, icsEscape } = require('./calendar');

const proposal = {
  activity: 'dinner',
  activityLabel: '🍽 Dinner',
  startsAt: '2026-10-08T00:30:00.000Z',
  venueName: 'Wylie & Rum, Island Grill',
  venueAddress: '1 Main St',
  neighborhood: 'Reynoldstown',
  venueLat: 33.75,
  venueLng: -84.35,
};

test('event is titled from the reader’s side and lasts by activity', () => {
  const ev = eventFor(proposal, 'Vito');
  assert.equal(ev.title, 'Date with Vito · Dinner');
  assert.equal(ev.end - ev.start, 2 * 60 * 60 * 1000);
  assert.equal(eventFor({ ...proposal, activity: 'coffee' }, 'Vito').end - ev.start, 60 * 60 * 1000);
  assert.equal(eventFor({ ...proposal, startsAt: null }, 'Vito'), null);
});

test('ics is valid-looking, escaped, with an alarm', () => {
  const ics = buildIcs(eventFor(proposal, 'Vito'), 'abc', Date.parse('2026-10-07T15:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261008T003000Z\r\n/);
  assert.match(ics, /DTEND:20261008T023000Z\r\n/);
  assert.match(ics, /LOCATION:Wylie & Rum\\, Island Grill\\, 1 Main St\\, Reynoldstown/);
  assert.match(ics, /UID:abc@datetoday\.app/);
  assert.match(ics, /TRIGGER:-PT1H/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  assert.equal(icsEscape('a;b,c\nd'), 'a\\;b\\,c\\nd');
});

test('google link carries the same event', () => {
  const url = new URL(googleCalendarUrl(eventFor(proposal, 'Vito')));
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Date with Vito · Dinner');
  assert.equal(url.searchParams.get('dates'), '20261008T003000Z/20261008T023000Z');
});

test('cancel ics reuses the UID and drops the alarm', () => {
  const { eventUidFor } = require('./calendar');
  const uid = eventUidFor('m1', 'msg1', 'u1');
  assert.equal(uid, eventUidFor('m1', 'msg1', 'u1'));
  assert.notEqual(uid, eventUidFor('m1', 'msg1', 'u2'));
  const ics = buildIcs(eventFor(proposal, 'Vito'), uid, Date.parse('2026-10-07T15:00:00Z'), { canceled: true });
  assert.match(ics, /METHOD:CANCEL\r\n/);
  assert.match(ics, /STATUS:CANCELLED\r\n/);
  assert.match(ics, new RegExp(`UID:${uid}@datetoday\\.app`));
  assert.doesNotMatch(ics, /VALARM/);
});
