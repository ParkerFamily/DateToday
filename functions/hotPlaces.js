/**
 * "Hot right now" date spots: OpenAI (with live web search, pinned to the user's city) picks
 * popular, well-reviewed places, then every pick is geocoded against OpenStreetMap so we only
 * return real places with coordinates near the user.
 */

const UA = 'DateToday/1.0 (support@datetoday.app)';

const CATEGORY_ASK = {
  drinks: 'bars, cocktail lounges, wine bars, or rooftop bars',
  dinner: 'restaurants',
  coffee: 'coffee shops or cafés',
  activity: 'fun date activities (bowling, arcades, mini golf, museums, comedy clubs, escape rooms, etc.)',
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['places'],
  properties: {
    places: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'address', 'neighborhood', 'kind', 'rating', 'reviewCount', 'why'],
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          neighborhood: { type: ['string', 'null'] },
          kind: { type: 'string' },
          rating: { type: ['number', 'null'] },
          reviewCount: { type: ['integer', 'null'] },
          why: { type: 'string' },
        },
      },
    },
  },
};

async function getJson(url, init = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': UA, ...(init.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function miles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

async function reverseArea(lat, lng) {
  const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`;
  const json = await getJson(url, {}, 6000).catch(() => null);
  const p = (json && json.features && json.features[0] && json.features[0].properties) || {};
  return {
    city: p.city || p.town || p.village || p.county || null,
    region: p.state || null,
    country: p.countrycode ? String(p.countrycode).toUpperCase() : null,
    neighborhood: p.district || p.locality || null,
  };
}

function words(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and', 'bar', 'cafe', 'restaurant', 'kitchen'].includes(w));
}

function sameName(a, b) {
  const wa = words(a);
  const wb = new Set(words(b));
  if (!wa.length) return false;
  return wa.filter((w) => wb.has(w)).length / wa.length >= 0.5;
}

async function photon(q, near) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '5');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('lat', String(near.lat));
  url.searchParams.set('lon', String(near.lng));
  url.searchParams.set('location_bias_scale', '0.2');
  const json = await getJson(url.toString(), {}, 7000).catch(() => ({ features: [] }));
  return (json.features || []).map((f) => {
    const [lng, lat] = (f.geometry && f.geometry.coordinates) || [];
    return { props: f.properties || {}, lat, lng };
  });
}

/** Pin an AI pick to real coordinates; null if it can't be found near the user. */
async function verify(pick, near, area, maxMiles) {
  const inRange = (r) => r.lat != null && r.lng != null && miles(near, r) <= maxMiles;
  const byName = (await photon(`${pick.name} ${area.city || ''}`, near)).filter(inRange);
  const named = byName.find((r) => sameName(pick.name, r.props.name));
  if (named) {
    const p = named.props;
    return {
      lat: named.lat,
      lng: named.lng,
      address: streetLine(pick.address) || [p.housenumber, p.street].filter(Boolean).join(' ') || null,
      area: pick.neighborhood || p.district || p.locality || p.city || null,
    };
  }
  const street = streetLine(pick.address);
  if (!street) return null;
  const byAddress = (await photon(`${street} ${area.city || ''}`, near)).filter(inRange);
  const hit = byAddress.find((r) => r.props.housenumber || r.props.street) || byAddress[0];
  if (!hit) return null;
  return {
    lat: hit.lat,
    lng: hit.lng,
    address: streetLine(pick.address),
    area: pick.neighborhood || hit.props.district || hit.props.locality || hit.props.city || null,
  };
}

function streetLine(address) {
  const line = String(address || '').split(',')[0].trim();
  // "across from the market" isn't an address — only keep real street lines.
  return /^\d+[a-z]?\s+\S/i.test(line) ? line : null;
}

function outputText(resp) {
  for (const item of resp.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if (c.type === 'output_text' && c.text) return c.text;
    }
  }
  return '';
}

async function askOpenAi({ key, model, category, cuisine, area, near }) {
  const what =
    category === 'dinner' && cuisine && cuisine !== 'anything'
      ? `${String(cuisine).replace(/[^a-z ]/gi, '')} restaurants`
      : CATEGORY_ASK[category];
  const where = [area.neighborhood, area.city, area.region].filter(Boolean).join(', ') || 'the user';
  const input = [
    {
      role: 'system',
      content:
        'You recommend real, currently open date spots. Use web search. Never invent places, addresses, ratings, or review counts — use null when unsure. Only include places you found in search results.',
    },
    {
      role: 'user',
      content:
        `Find the 8 most popular, highly reviewed ${what} for a date near ${where} ` +
        `(within about 5 miles of ${near.lat.toFixed(4)}, ${near.lng.toFixed(4)}). ` +
        'Favor places that are buzzing right now: rated 4.3+ stars, strong recent Google/Yelp reviews, local "best of" lists, great date vibe. ' +
        `Search for things like "best ${what} ${area.city || ''} reviews" and "${what} ${area.city || ''} rating" so you can see each place's star rating. ` +
        'Skip chains and fast food. For each give: name, street address (street line only), neighborhood (or null), kind (short, like "Cocktail bar"), ' +
        'rating (the average star rating out of 5 shown on Google, Yelp, or Tripadvisor, or null if you did not see one), reviewCount (or null), ' +
        'and why: one specific line under 70 characters on why it makes a good date (no hype words, no emojis).',
    },
  ];
  const tool = { type: 'web_search', search_context_size: 'medium' };
  if (area.city || area.country) {
    tool.user_location = { type: 'approximate' };
    if (area.city) tool.user_location.city = area.city;
    if (area.region) tool.user_location.region = area.region;
    if (area.country && area.country.length === 2) tool.user_location.country = area.country;
  }
  const resp = await getJson(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        tools: [tool],
        tool_choice: 'required',
        input,
        text: { format: { type: 'json_schema', name: 'hot_places', strict: true, schema: SCHEMA } },
        max_output_tokens: 2000,
      }),
    },
    40000,
  );
  const parsed = JSON.parse(outputText(resp) || '{"places":[]}');
  return Array.isArray(parsed.places) ? parsed.places : [];
}

async function findHotPlaces({ lat, lng, category, cuisine }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  const model = process.env.OPENAI_PLACES_MODEL || 'gpt-4.1-mini';
  const near = { lat, lng };
  const area = await reverseArea(lat, lng);
  const picks = await askOpenAi({ key, model, category, cuisine, area, near });
  if (process.env.HOT_DEBUG) console.log(`hot picks: ${picks.length} from ${model}`);

  const verified = await Promise.all(
    picks.slice(0, 10).map(async (pick, i) => {
      if (!pick || !pick.name) return null;
      const spot = await verify(pick, near, area, 12).catch(() => null);
      if (!spot) return null;
      const rating = typeof pick.rating === 'number' && pick.rating >= 1 && pick.rating <= 5 ? pick.rating : null;
      const reviewCount = Number.isInteger(pick.reviewCount) && pick.reviewCount > 0 ? pick.reviewCount : null;
      return {
        id: `hot-${category}-${i}-${String(pick.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        name: String(pick.name).slice(0, 80),
        address: spot.address ? String(spot.address).slice(0, 120) : null,
        area: spot.area ? String(spot.area).slice(0, 60) : null,
        lat: spot.lat,
        lng: spot.lng,
        kind: pick.kind ? String(pick.kind).slice(0, 40) : null,
        rating: rating == null ? null : Math.round(rating * 10) / 10,
        reviewCount,
        why: pick.why ? String(pick.why).slice(0, 90) : null,
        hot: true,
      };
    }),
  );
  const seen = new Set();
  return verified.filter((p) => {
    if (!p) return false;
    const k = p.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

module.exports = { findHotPlaces };
