'use strict';

/**
 * Explore Tonight: place categories for Google Places / OpenStreetMap and nearby events from the
 * Ticketmaster Discovery API. Network calls take an injected fetchJson(url, init, timeoutMs) so the
 * mapping stays testable; keys never leave the server.
 */

const EXPLORE_CATEGORIES = ['foodie', 'drinks', 'coffee', 'activities', 'movies', 'late'];
const FOODIE_STYLES = ['anything', 'italian', 'sushi', 'mexican', 'seafood', 'steak', 'brunch', 'dessert'];
const EXPLORE_RADII = [1, 3, 5, 10, 25];

// The first type of each list is the most widely supported; it's the retry when Google rejects a newer one.
const GOOGLE_EXPLORE_TYPES = {
  foodie: {
    anything: ['restaurant'],
    italian: ['italian_restaurant', 'pizza_restaurant'],
    sushi: ['sushi_restaurant', 'japanese_restaurant'],
    mexican: ['mexican_restaurant'],
    seafood: ['seafood_restaurant'],
    steak: ['steak_house'],
    brunch: ['breakfast_restaurant', 'brunch_restaurant'],
    dessert: ['ice_cream_shop', 'bakery', 'dessert_shop', 'dessert_restaurant'],
  },
  drinks: ['bar', 'wine_bar', 'pub'],
  coffee: ['cafe', 'coffee_shop'],
  activities: ['bowling_alley', 'amusement_center', 'museum', 'art_gallery', 'park', 'aquarium', 'zoo', 'amusement_park'],
  movies: ['movie_theater'],
  late: ['bar', 'night_club', 'pub'],
};

const GOOGLE_EXPLORE_MASK = [
  'places.id',
  'places.displayName',
  'places.shortFormattedAddress',
  'places.location',
  'places.primaryTypeDisplayName',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.addressComponents',
  'places.photos',
  'places.regularOpeningHours',
  'places.utcOffsetMinutes',
  'places.googleMapsUri',
  'places.businessStatus',
].join(',');

const OSM_CUISINE = {
  italian: 'italian|pizza',
  sushi: 'sushi|japanese',
  mexican: 'mexican|tex-mex|taco',
  seafood: 'seafood|fish',
  steak: 'steak',
  brunch: 'breakfast|brunch',
};

/** Overpass tag filters for a category (each is appended to nwr(around:…)). */
function osmExploreFilters(category, style) {
  switch (category) {
    case 'foodie':
      if (style === 'dessert') {
        return [
          '["amenity"="ice_cream"]',
          '["shop"~"^(pastry|confectionery|chocolate)$"]',
          '["amenity"~"^(restaurant|cafe)$"]["cuisine"~"dessert|ice_cream|frozen_yogurt|cake|donut|crepe",i]',
        ];
      }
      if (OSM_CUISINE[style]) return [`["amenity"~"^(restaurant|cafe)$"]["cuisine"~"${OSM_CUISINE[style]}",i]`];
      return ['["amenity"="restaurant"]'];
    case 'drinks':
      return ['["amenity"~"^(bar|pub|biergarten)$"]'];
    case 'coffee':
      return ['["amenity"="cafe"]', '["shop"~"^(coffee|tea)$"]'];
    case 'activities':
      return [
        '["leisure"~"^(bowling_alley|miniature_golf|escape_game|amusement_arcade|trampoline_park|ice_rink)$"]',
        '["leisure"="sports_centre"]["sport"~"skating|bowling|climbing",i]',
        '["tourism"~"^(museum|gallery|aquarium|zoo|theme_park)$"]',
        '["amenity"="arts_centre"]',
        // Only notable parks; every pocket park would bury everything else.
        '["leisure"="park"]["wikidata"]',
      ];
    case 'movies':
      return ['["amenity"="cinema"]'];
    case 'late':
      return [
        '["amenity"~"^(nightclub|bar|pub)$"]',
        '["amenity"~"^(restaurant|fast_food|cafe)$"]["opening_hours"="24/7"]',
      ];
    default:
      return [];
  }
}

function osmExploreQuery(category, style, lat, lng, radiusM) {
  const parts = osmExploreFilters(category, style)
    .map((f) => `nwr(around:${radiusM},${lat},${lng})${f}["name"];`)
    .join('');
  return `[out:json][timeout:15];(${parts});out center 400;`;
}

const OSM_KIND = {
  bar: 'Bar', pub: 'Pub', biergarten: 'Beer garden', restaurant: 'Restaurant', cafe: 'Café', coffee: 'Coffee',
  tea: 'Tea', bowling_alley: 'Bowling', miniature_golf: 'Mini golf', escape_game: 'Escape room',
  amusement_arcade: 'Arcade', trampoline_park: 'Trampoline park', ice_rink: 'Skating', sports_centre: 'Activity',
  cinema: 'Movie theater', arts_centre: 'Arts center', museum: 'Museum', gallery: 'Art gallery', aquarium: 'Aquarium',
  zoo: 'Zoo', theme_park: 'Theme park', park: 'Park', nightclub: 'Club', ice_cream: 'Ice cream', pastry: 'Bakery',
  confectionery: 'Sweets', chocolate: 'Chocolate', fast_food: 'Food', bakery: 'Bakery', deli: 'Deli',
};

function titleCase(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function osmExplorePlace(e) {
  const t = (e && e.tags) || {};
  if (!t.name) return null;
  const lat = e.lat != null ? e.lat : e.center && e.center.lat;
  const lng = e.lon != null ? e.lon : e.center && e.center.lon;
  if (lat == null || lng == null) return null;
  const kindKey = t.amenity || t.leisure || t.tourism || t.shop || '';
  const cuisine = t.cuisine ? titleCase(t.cuisine.split(';')[0]) : null;
  const kind =
    kindKey === 'restaurant' && cuisine ? cuisine : kindKey === 'sports_centre' && t.sport ? titleCase(t.sport.split(';')[0]) : OSM_KIND[kindKey] || cuisine;
  return {
    id: `osm-${e.type}-${e.id}`,
    name: String(t.name).slice(0, 80),
    address: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || null,
    area: t['addr:suburb'] || t['addr:neighbourhood'] || t['addr:city'] || null,
    lat,
    lng,
    kind: kind || null,
    rating: null,
    reviewCount: null,
    priceLevel: null,
    photo: null,
    photoCredit: null,
    mapsUri: null,
    hours: t.opening_hours === '24/7' ? { always: true } : null,
    source: 'osm',
  };
}

// Photon only matches words in a place's name, so each category searches a handful of telling words.
const PHOTON_EXPLORE = {
  foodie: {
    anything: [['restaurant', ['amenity:restaurant']], ['grill', ['amenity:restaurant']], ['kitchen', ['amenity:restaurant']], ['bistro', ['amenity:restaurant']]],
    italian: [['italian', ['amenity:restaurant']], ['pizza', ['amenity:restaurant']], ['trattoria', ['amenity:restaurant']], ['pasta', ['amenity:restaurant']]],
    sushi: [['sushi', ['amenity:restaurant']], ['japanese', ['amenity:restaurant']], ['omakase', ['amenity:restaurant']]],
    mexican: [['mexican', ['amenity:restaurant']], ['taco', ['amenity:restaurant', 'amenity:fast_food']], ['cantina', ['amenity:restaurant']], ['taqueria', ['amenity:restaurant']]],
    seafood: [['seafood', ['amenity:restaurant']], ['oyster', ['amenity:restaurant']], ['crab', ['amenity:restaurant']], ['fish', ['amenity:restaurant']]],
    steak: [['steak', ['amenity:restaurant']], ['steakhouse', ['amenity:restaurant']], ['chophouse', ['amenity:restaurant']]],
    brunch: [['brunch', ['amenity:restaurant', 'amenity:cafe']], ['breakfast', ['amenity:restaurant', 'amenity:cafe']], ['pancake', ['amenity:restaurant']], ['biscuit', ['amenity:restaurant']]],
    dessert: [['ice cream', ['amenity:ice_cream']], ['gelato', ['amenity:ice_cream', 'amenity:cafe']], ['bakery', ['shop:bakery', 'shop:pastry']], ['dessert', ['amenity:cafe', 'amenity:restaurant']], ['donut', ['shop:bakery', 'amenity:cafe']]],
  },
  drinks: [['bar', ['amenity:bar', 'amenity:pub']], ['pub', ['amenity:pub', 'amenity:bar']], ['lounge', ['amenity:bar']], ['tavern', ['amenity:bar', 'amenity:pub']], ['taproom', ['amenity:bar', 'amenity:pub']]],
  coffee: [['coffee', ['amenity:cafe']], ['cafe', ['amenity:cafe']], ['espresso', ['amenity:cafe']], ['roasters', ['amenity:cafe']]],
  activities: [
    ['bowling', ['leisure:bowling_alley']],
    ['arcade', ['leisure:amusement_arcade']],
    ['museum', ['tourism:museum']],
    ['gallery', ['tourism:gallery']],
    ['escape', ['leisure:escape_game']],
    ['golf', ['leisure:miniature_golf']],
    ['skate', ['leisure:ice_rink', 'leisure:sports_centre']],
  ],
  movies: [['cinema', ['amenity:cinema']], ['theater', ['amenity:cinema']], ['theatre', ['amenity:cinema']], ['amc', ['amenity:cinema']], ['regal', ['amenity:cinema']], ['cinemark', ['amenity:cinema']]],
  late: [['bar', ['amenity:bar', 'amenity:pub', 'amenity:nightclub']], ['club', ['amenity:nightclub']], ['lounge', ['amenity:bar', 'amenity:nightclub']], ['pub', ['amenity:pub']], ['tavern', ['amenity:bar', 'amenity:pub']]],
};

function photonExploreTerms(category, style) {
  if (category === 'foodie') return PHOTON_EXPLORE.foodie[style] || PHOTON_EXPLORE.foodie.anything;
  return PHOTON_EXPLORE[category] || [];
}

function photonExploreUrl(term, tags, lat, lng, radiusM) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', term);
  tags.forEach((t) => url.searchParams.append('osm_tag', t));
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '16');
  url.searchParams.set('location_bias_scale', '0.05');
  url.searchParams.set('limit', '20');
  const dLat = radiusM / 111000;
  const dLng = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  url.searchParams.set('bbox', [lng - dLng, lat - dLat, lng + dLng, lat + dLat].join(','));
  return url.toString();
}

function photonExplorePlace(f) {
  const p = (f && f.properties) || {};
  const [lng, lat] = (f && f.geometry && f.geometry.coordinates) || [];
  if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `photon-${p.osm_type}-${p.osm_id}`,
    name: String(p.name).slice(0, 80),
    address: [p.housenumber, p.street].filter(Boolean).join(' ') || null,
    area: p.district || p.locality || p.city || null,
    lat,
    lng,
    kind: OSM_KIND[String(p.osm_value)] || null,
    rating: null,
    reviewCount: null,
    priceLevel: null,
    photo: null,
    photoCredit: null,
    mapsUri: null,
    hours: null,
    source: 'osm',
  };
}

async function photonExploreNearby({ category, style, lat, lng, radiusM, fetchJson }) {
  const lists = await Promise.all(
    photonExploreTerms(category, style).map(([term, tags]) =>
      fetchJson(photonExploreUrl(term, tags, lat, lng, radiusM), {}, 12000)
        .then((json) => (json.features || []).map(photonExplorePlace).filter(Boolean))
        .catch(() => []),
    ),
  );
  return lists.flat();
}

const PRICE_LEVEL = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** Google's weekly hours as [openDay, openMin, closeDay, closeMin] in the place's local time. */
function compactHours(p) {
  const periods = p && p.regularOpeningHours && p.regularOpeningHours.periods;
  if (!Array.isArray(periods) || !periods.length) return null;
  if (periods.length === 1 && periods[0].open && !periods[0].close) return { always: true };
  if (!Number.isFinite(p.utcOffsetMinutes)) return null;
  const minutes = (x) => (x.hour || 0) * 60 + (x.minute || 0);
  const list = periods
    .filter((x) => x && x.open && x.close)
    .map((x) => [x.open.day, minutes(x.open), x.close.day, minutes(x.close)]);
  return list.length ? { utcOffset: p.utcOffsetMinutes, periods: list } : null;
}

function googleExplorePlace(p) {
  if (!p || !p.id) return null;
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return null;
  const comps = p.addressComponents || [];
  const comp = (type) => (comps.find((c) => (c.types || []).includes(type)) || {}).shortText || null;
  const photo = (p.photos || [])[0] || null;
  const credit = photo && (photo.authorAttributions || [])[0];
  return {
    id: `g-${p.id}`,
    name: (p.displayName && p.displayName.text) || 'Place',
    address: p.shortFormattedAddress || null,
    area: comp('neighborhood') || comp('sublocality') || comp('locality'),
    lat: p.location ? p.location.latitude : null,
    lng: p.location ? p.location.longitude : null,
    kind: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviewCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    priceLevel: p.priceLevel in PRICE_LEVEL ? PRICE_LEVEL[p.priceLevel] : null,
    photoName: photo && photo.name ? photo.name : null,
    photo: null,
    photoCredit: credit && credit.displayName ? String(credit.displayName).slice(0, 60) : null,
    mapsUri: p.googleMapsUri || null,
    hours: compactHours(p),
    source: 'google',
  };
}

const WEEK_MIN = 7 * 1440;
const LATE_CLOSE_MIN = 23 * 60;

/**
 * Open/closing state right now from cached weekly hours, so a day-old cache never shows a stale
 * "Open now". closesAt is minutes after midnight in the place's own time.
 */
function hoursState(hours, nowMs) {
  if (!hours) return { openNow: null, closesAt: null, lateTonight: null, open24h: false };
  if (hours.always) return { openNow: true, closesAt: null, lateTonight: true, open24h: true };
  const local = new Date(nowMs + hours.utcOffset * 60000);
  const today = local.getUTCDay();
  const now = today * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();
  let openNow = false;
  let closesAt = null;
  let lateTonight = false;
  for (const [od, om, cd, cm] of hours.periods) {
    const start = od * 1440 + om;
    let end = cd * 1440 + cm;
    if (end <= start) end += WEEK_MIN;
    for (const t of [now, now + WEEK_MIN]) {
      if (t >= start && t < end) {
        openNow = true;
        closesAt = end % 1440;
      }
    }
    if (od === today) {
      const crossesMidnight = Math.floor(end / 1440) > od;
      if (crossesMidnight || end % 1440 >= LATE_CLOSE_MIN) lateTonight = true;
    }
  }
  if (openNow && local.getUTCHours() < 5) lateTonight = true;
  return { openNow, closesAt, lateTonight, open24h: false };
}

/** What the app receives for a place: hours resolved for right now, raw weekly hours dropped. */
function publicPlace(p, me, nowMs, milesBetween) {
  const { hours, photoName, ...rest } = p;
  return {
    ...rest,
    ...hoursState(hours, nowMs),
    distanceMiles:
      me && p.lat != null && p.lng != null ? Math.round(milesBetween(me, p) * 10) / 10 : null,
  };
}

async function googleExploreNearby({ key, lat, lng, radiusM, types, fetchJson }) {
  const call = (includedTypes) =>
    fetchJson(
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': GOOGLE_EXPLORE_MASK },
        body: JSON.stringify({
          includedTypes,
          maxResultCount: 20,
          rankPreference: 'POPULARITY',
          locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
        }),
      },
      12000,
    );
  let json;
  try {
    json = await call(types);
  } catch (error) {
    if (!String(error.message).startsWith('400') || types.length < 2) throw error;
    json = await call([types[0]]);
  }
  const places = (json.places || []).map(googleExplorePlace).filter(Boolean);
  // Resolve each photo to a key-free image URL here, so the app never needs the Places key.
  await Promise.all(
    places.map(async (p) => {
      if (!p.photoName) return;
      const media = await fetchJson(
        `https://places.googleapis.com/v1/${p.photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
        { headers: { 'X-Goog-Api-Key': key } },
        6000,
      ).catch(() => null);
      p.photo = media && typeof media.photoUri === 'string' ? media.photoUri : null;
      if (!p.photo) p.photoCredit = null;
    }),
  );
  return places;
}

function googleTypesFor(category, style) {
  if (category === 'foodie') return GOOGLE_EXPLORE_TYPES.foodie[style] || GOOGLE_EXPLORE_TYPES.foodie.anything;
  return GOOGLE_EXPLORE_TYPES[category] || null;
}

// ---------------------------------------------------------------------------
// Events (Ticketmaster Discovery API)

const TM_NOT_AN_EVENT = /\b(parking|vip upgrade|upsell|add-?on|tailgate|locker|shuttle|gift card|voucher|season (tickets?|pass(es)?)|hotel package)\b/i;
const TM_DEAD_STATUS = new Set(['cancelled', 'canceled', 'postponed']);

function tmIso(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function ticketmasterUrl({ key, lat, lng, radiusMiles, startMs, endMs }) {
  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  url.searchParams.set('apikey', key);
  url.searchParams.set('latlong', `${lat.toFixed(4)},${lng.toFixed(4)}`);
  url.searchParams.set('radius', String(Math.max(1, Math.round(radiusMiles))));
  url.searchParams.set('unit', 'miles');
  url.searchParams.set('startDateTime', tmIso(startMs));
  url.searchParams.set('endDateTime', tmIso(endMs));
  url.searchParams.set('sort', 'date,asc');
  url.searchParams.set('size', '60');
  url.searchParams.set('includeTBA', 'no');
  url.searchParams.set('includeTBD', 'no');
  url.searchParams.set('includeTest', 'no');
  return url.toString();
}

function pickImage(images) {
  const list = (Array.isArray(images) ? images : []).filter((i) => i && typeof i.url === 'string' && i.url.startsWith('https://'));
  const wide = list.filter((i) => i.ratio === '16_9').sort((a, b) => (a.width || 0) - (b.width || 0));
  return (wide.find((i) => (i.width || 0) >= 640) || wide[wide.length - 1] || list[0] || {}).url || null;
}

const usable = (s) => (typeof s === 'string' && s && s !== 'Undefined' && s !== 'Other' ? s : null);

function eventFromTicketmaster(e) {
  if (!e || e.type !== 'event' || !e.id || !e.name || typeof e.url !== 'string') return null;
  if (TM_NOT_AN_EVENT.test(e.name)) return null;
  const dates = e.dates || {};
  const start = dates.start || {};
  if (TM_DEAD_STATUS.has(String((dates.status && dates.status.code) || '').toLowerCase())) return null;
  if (!start.localDate || start.dateTBD || start.dateTBA) return null;
  const venue = (e._embedded && e._embedded.venues && e._embedded.venues[0]) || {};
  const lat = venue.location ? Number(venue.location.latitude) : NaN;
  const lng = venue.location ? Number(venue.location.longitude) : NaN;
  const cls = (e.classifications || [])[0] || {};
  const segment = usable(cls.segment && cls.segment.name);
  const genre = usable(cls.genre && cls.genre.name);
  const hasTime = Boolean(start.localTime) && !start.timeTBA && !start.noSpecificTime;
  return {
    id: `tm-${e.id}`,
    name: String(e.name).slice(0, 120),
    url: e.url,
    image: pickImage(e.images),
    startsAt: hasTime && start.dateTime ? start.dateTime : null,
    localDate: start.localDate,
    localTime: hasTime ? String(start.localTime).slice(0, 5) : null,
    venueName: venue.name ? String(venue.name).slice(0, 80) : null,
    address: venue.address && venue.address.line1 ? String(venue.address.line1).slice(0, 80) : null,
    area:
      [venue.city && venue.city.name, venue.state && venue.state.stateCode].filter(Boolean).join(', ') || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    segment,
    genre,
    source: 'ticketmaster',
  };
}

async function ticketmasterEvents({ key, lat, lng, radiusMiles, startMs, endMs, fetchJson }) {
  const json = await fetchJson(ticketmasterUrl({ key, lat, lng, radiusMiles, startMs, endMs }), {}, 10000);
  const seen = new Set();
  const events = [];
  const earliestDate = new Date(startMs - 24 * 3600 * 1000).toISOString().slice(0, 10);
  for (const raw of (json._embedded && json._embedded.events) || []) {
    const ev = eventFromTicketmaster(raw);
    if (!ev) continue;
    // Multi-date passes come back under their first date, which can be weeks ago.
    if (ev.startsAt ? Date.parse(ev.startsAt) < startMs - 3 * 3600 * 1000 : ev.localDate < earliestDate) continue;
    // The same show is often listed once per ticket type.
    const k = `${ev.name.toLowerCase()}|${ev.localDate}|${ev.localTime || ''}|${(ev.venueName || '').toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    events.push(ev);
  }
  return events;
}

/** Clamp the requested event window: never in the past by more than an hour, at most ~a month long. */
function eventWindow(body, nowMs) {
  const HOUR = 3600 * 1000;
  const start = Number.isFinite(body.startMs) ? Math.max(body.startMs, nowMs - HOUR) : nowMs;
  const end = Number.isFinite(body.endMs) ? Math.min(Math.max(body.endMs, start + HOUR), start + 32 * 24 * HOUR) : start + 24 * HOUR;
  // Hour buckets keep the cache shared between people opening Explore a few minutes apart.
  return { startMs: Math.floor(start / HOUR) * HOUR, endMs: Math.ceil(end / HOUR) * HOUR };
}

function exploreRadius(miles) {
  return EXPLORE_RADII.includes(miles) ? miles : 5;
}

/** Past this, "halfway" is a road trip; Near me or Search makes more sense. */
const HALFWAY_MAX_APART_MILES = 60;
const HALFWAY_GRID_DEG = 0.02;

/**
 * Great-circle midpoint, snapped to a ~1.4 mile grid. The snap keeps the search area shared in the
 * cache and stops anyone working back from the results to where their match is.
 */
function halfwayPoint(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const dLng = rad(b.lng - a.lng);
  const bx = Math.cos(lat2) * Math.cos(dLng);
  const by = Math.cos(lat2) * Math.sin(dLng);
  const lat = Math.atan2(Math.sin(lat1) + Math.sin(lat2), Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2));
  const lng = rad(a.lng) + Math.atan2(by, Math.cos(lat1) + bx);
  const snap = (v) => Math.round(Math.round(v / HALFWAY_GRID_DEG) * HALFWAY_GRID_DEG * 100) / 100;
  return { lat: snap(deg(lat)), lng: snap(((deg(lng) + 540) % 360) - 180) };
}

/**
 * Fairest spots first: the longer of the two trips, plus a little for lopsidedness.
 * `distanceMiles` is the caller's own distance; `theirMiles` is for ranking only and must be dropped.
 */
function rankHalfway(places, me, them, milesFn) {
  return places
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => {
      const mine = milesFn(me, p);
      const theirs = milesFn(them, p);
      return { p, mine, theirs, score: Math.max(mine, theirs) + 0.25 * Math.abs(mine - theirs) };
    })
    .sort((x, y) => x.score - y.score)
    .map(({ p, mine, theirs }) => ({ ...p, distanceMiles: Math.round(mine * 10) / 10, theirMiles: theirs }));
}

module.exports = {
  EXPLORE_CATEGORIES,
  FOODIE_STYLES,
  EXPLORE_RADII,
  GOOGLE_EXPLORE_MASK,
  osmExploreFilters,
  osmExploreQuery,
  osmExplorePlace,
  googleExplorePlace,
  googleExploreNearby,
  googleTypesFor,
  photonExploreTerms,
  photonExplorePlace,
  photonExploreNearby,
  compactHours,
  hoursState,
  publicPlace,
  ticketmasterUrl,
  eventFromTicketmaster,
  ticketmasterEvents,
  eventWindow,
  exploreRadius,
  HALFWAY_MAX_APART_MILES,
  halfwayPoint,
  rankHalfway,
};
