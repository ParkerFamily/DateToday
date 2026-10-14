'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const explore = require('./explore');

// Wednesday 2026-10-14 20:00 UTC; with a -240 offset that's 4:00 PM local.
const WED_8PM_UTC = Date.UTC(2026, 9, 14, 20, 0);

test('osm filters cover every category and foodie style', () => {
  for (const category of explore.EXPLORE_CATEGORIES) {
    assert.ok(explore.osmExploreFilters(category, 'anything').length > 0, category);
  }
  for (const style of explore.FOODIE_STYLES) {
    assert.ok(explore.osmExploreFilters('foodie', style).length > 0, style);
  }
  assert.deepEqual(explore.osmExploreFilters('movies'), ['["amenity"="cinema"]']);
  assert.match(explore.osmExploreFilters('foodie', 'sushi')[0], /sushi\|japanese/);
  assert.match(explore.osmExploreQuery('coffee', null, 33.7, -84.4, 8000), /around:8000,33.7,-84.4/);
});

test('osm place maps cuisine, kind and 24/7 hours', () => {
  const p = explore.osmExplorePlace({
    type: 'node',
    id: 1,
    lat: 33.7,
    lon: -84.4,
    tags: { name: 'Luigi', amenity: 'restaurant', cuisine: 'italian;pizza', opening_hours: '24/7', 'addr:street': 'Main St' },
  });
  assert.equal(p.kind, 'Italian');
  assert.deepEqual(p.hours, { always: true });
  assert.equal(p.photo, null);
  assert.equal(explore.osmExplorePlace({ type: 'node', id: 2, lat: 1, lon: 1, tags: {} }), null);
  assert.equal(explore.osmExplorePlace({ type: 'node', id: 3, lat: 1, lon: 1, tags: { name: 'X', amenity: 'cinema' } }).kind, 'Movie theater');
});

test('google place maps rating, reviews, price, photo and skips closed businesses', () => {
  const raw = {
    id: 'abc',
    displayName: { text: 'Starlight Lanes' },
    shortFormattedAddress: '1 Pin Rd',
    location: { latitude: 33.7, longitude: -84.4 },
    primaryTypeDisplayName: { text: 'Bowling alley' },
    rating: 4.6,
    userRatingCount: 812,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    photos: [{ name: 'places/abc/photos/p1', authorAttributions: [{ displayName: 'Sam' }] }],
    googleMapsUri: 'https://maps.google.com/?cid=1',
    businessStatus: 'OPERATIONAL',
    utcOffsetMinutes: -240,
    regularOpeningHours: { periods: [{ open: { day: 3, hour: 12, minute: 0 }, close: { day: 4, hour: 1, minute: 0 } }] },
  };
  const p = explore.googleExplorePlace(raw);
  assert.equal(p.reviewCount, 812);
  assert.equal(p.priceLevel, 2);
  assert.equal(p.photoName, 'places/abc/photos/p1');
  assert.equal(p.photoCredit, 'Sam');
  assert.deepEqual(p.hours, { utcOffset: -240, periods: [[3, 720, 4, 60]] });
  assert.equal(explore.googleExplorePlace({ ...raw, businessStatus: 'CLOSED_PERMANENTLY' }), null);
});

test('hoursState is computed for right now in the place’s own time', () => {
  const hours = { utcOffset: -240, periods: [[3, 720, 4, 60]] }; // Wed noon → Thu 1 AM
  const open = explore.hoursState(hours, WED_8PM_UTC);
  assert.equal(open.openNow, true);
  assert.equal(open.closesAt, 60);
  assert.equal(open.lateTonight, true);

  const closed = explore.hoursState({ utcOffset: -240, periods: [[3, 1080, 3, 1320]] }, WED_8PM_UTC); // 6–10 PM
  assert.equal(closed.openNow, false);
  assert.equal(closed.lateTonight, false);

  // Saturday night → Sunday 2 AM wraps the week.
  const sat1am = Date.UTC(2026, 9, 18, 5, 0); // Sun 1:00 AM local
  const wrap = explore.hoursState({ utcOffset: -240, periods: [[6, 1200, 0, 120]] }, sat1am);
  assert.equal(wrap.openNow, true);
  assert.equal(wrap.closesAt, 120);

  assert.deepEqual(explore.hoursState(null, WED_8PM_UTC), { openNow: null, closesAt: null, lateTonight: null, open24h: false });
  assert.equal(explore.hoursState({ always: true }, WED_8PM_UTC).open24h, true);
});

test('publicPlace drops raw hours and photo names and adds distance', () => {
  const p = explore.publicPlace(
    { id: 'g-1', name: 'A', lat: 1, lng: 1, hours: null, photoName: 'places/x/photos/y', photo: 'https://lh3/x' },
    { lat: 1, lng: 1 },
    WED_8PM_UTC,
    () => 1.234,
  );
  assert.equal(p.distanceMiles, 1.2);
  assert.equal('hours' in p, false);
  assert.equal('photoName' in p, false);
  assert.equal(p.photo, 'https://lh3/x');
});

test('googleExploreNearby retries with the basic type and resolves photos without exposing the key', async () => {
  const calls = [];
  const fetchJson = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('searchNearby')) {
      const body = JSON.parse(init.body);
      if (body.includedTypes.length > 1) throw new Error('400 bad type');
      return { places: [{ id: 'p', displayName: { text: 'Gelato' }, photos: [{ name: 'places/p/photos/1' }] }] };
    }
    return { photoUri: 'https://lh3.googleusercontent.com/abc' };
  };
  const places = await explore.googleExploreNearby({
    key: 'KEY',
    lat: 1,
    lng: 2,
    radiusM: 8000,
    types: explore.googleTypesFor('foodie', 'dessert'),
    fetchJson,
  });
  assert.equal(places[0].photo, 'https://lh3.googleusercontent.com/abc');
  assert.equal(calls.length, 3);
  for (const c of calls) assert.equal(c.url.includes('KEY'), false);
  assert.equal(calls[2].init.headers['X-Goog-Api-Key'], 'KEY');
});

function tmEvent(over = {}) {
  return {
    type: 'event',
    id: 'e1',
    name: 'Jazz Night',
    url: 'https://www.ticketmaster.com/event/e1',
    images: [
      { ratio: '16_9', width: 205, url: 'https://s1.ticketm.net/small.jpg' },
      { ratio: '16_9', width: 1024, url: 'https://s1.ticketm.net/big.jpg' },
      { ratio: '16_9', width: 640, url: 'https://s1.ticketm.net/mid.jpg' },
    ],
    dates: { start: { localDate: '2026-10-14', localTime: '19:30:00', dateTime: '2026-10-14T23:30:00Z' }, status: { code: 'onsale' } },
    classifications: [{ segment: { name: 'Music' }, genre: { name: 'Jazz' } }],
    _embedded: {
      venues: [{ name: 'Blue Room', address: { line1: '5 Note St' }, city: { name: 'Atlanta' }, state: { stateCode: 'GA' }, location: { latitude: '33.75', longitude: '-84.39' } }],
    },
    ...over,
  };
}

test('eventFromTicketmaster keeps real fields and drops parking, cancelled and undated listings', () => {
  const e = explore.eventFromTicketmaster(tmEvent());
  assert.equal(e.image, 'https://s1.ticketm.net/mid.jpg');
  assert.equal(e.localTime, '19:30');
  assert.equal(e.startsAt, '2026-10-14T23:30:00Z');
  assert.equal(e.area, 'Atlanta, GA');
  assert.equal(e.lat, 33.75);
  assert.equal(e.genre, 'Jazz');
  assert.equal(explore.eventFromTicketmaster(tmEvent({ name: 'Stadium Parking Pass' })), null);
  assert.equal(explore.eventFromTicketmaster(tmEvent({ dates: { start: { localDate: '2026-10-14' }, status: { code: 'cancelled' } } })), null);
  assert.equal(explore.eventFromTicketmaster(tmEvent({ dates: { start: { dateTBD: true } } })), null);
  const noTime = explore.eventFromTicketmaster(tmEvent({ dates: { start: { localDate: '2026-10-14', noSpecificTime: true } } }));
  assert.equal(noTime.localTime, null);
  assert.equal(noTime.startsAt, null);
});

test('ticketmasterEvents de-dupes ticket-type duplicates', async () => {
  const fetchJson = async (url) => {
    assert.match(url, /latlong=33\.7000%2C-84\.4000/);
    assert.match(url, /startDateTime=2026-10-14T20%3A00%3A00Z/);
    return { _embedded: { events: [tmEvent(), tmEvent({ id: 'e2' }), tmEvent({ id: 'e3', name: 'Comedy Hour' })] } };
  };
  const events = await explore.ticketmasterEvents({
    key: 'K',
    lat: 33.7,
    lng: -84.4,
    radiusMiles: 10,
    startMs: WED_8PM_UTC,
    endMs: WED_8PM_UTC + 8 * 3600e3,
    fetchJson,
  });
  assert.deepEqual(events.map((e) => e.id), ['tm-e1', 'tm-e3']);
});

test('eventWindow clamps to the present and a month, bucketed by hour', () => {
  const now = WED_8PM_UTC + 17 * 60e3;
  const w = explore.eventWindow({ startMs: now - 5 * 3600e3, endMs: now + 90 * 24 * 3600e3 }, now);
  assert.equal(w.startMs, WED_8PM_UTC - 3600e3 + 0);
  assert.ok(w.endMs - w.startMs <= 33 * 24 * 3600e3);
  const d = explore.eventWindow({}, now);
  assert.equal(d.startMs, WED_8PM_UTC);
});

test('exploreRadius only allows the offered distances', () => {
  assert.equal(explore.exploreRadius(10), 10);
  assert.equal(explore.exploreRadius(7), 5);
  assert.equal(explore.exploreRadius('3'), 5);
});

const miles = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
};

test('halfwayPoint lands between both people, snapped to the grid', () => {
  const westEnd = { lat: 33.735, lng: -84.42 };
  const midtown = { lat: 33.785, lng: -84.384 };
  const mid = explore.halfwayPoint(westEnd, midtown);
  assert.deepEqual(mid, { lat: 33.76, lng: -84.4 });
  assert.ok(Math.abs(miles(mid, westEnd) - miles(mid, midtown)) < 1.5);
  // Across the date line still wraps into range.
  const wrap = explore.halfwayPoint({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 });
  assert.ok(Math.abs(Math.abs(wrap.lng) - 180) < 0.02);
});

test('rankHalfway puts the fairest trip first and only exposes my distance', () => {
  const me = { lat: 33.735, lng: -84.42 };
  const them = { lat: 33.785, lng: -84.384 };
  const nearMe = { name: 'Near me', lat: 33.736, lng: -84.419 };
  const middle = { name: 'Middle', lat: 33.76, lng: -84.402 };
  const nowhere = { name: 'No coords', lat: null, lng: null };
  const ranked = explore.rankHalfway([nearMe, nowhere, middle], me, them, miles);
  assert.deepEqual(ranked.map((p) => p.name), ['Middle', 'Near me']);
  assert.equal(ranked[0].distanceMiles, Math.round(miles(me, middle) * 10) / 10);
  assert.ok(explore.HALFWAY_MAX_APART_MILES >= 30);
});
