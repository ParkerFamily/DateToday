import * as Location from 'expo-location';
import { functionsUrl } from '@/features/matches/api';
import { getFirebaseAuth } from '@/lib/firebase/client';

export type LatLng = { lat: number; lng: number };

export type Place = {
  id: string;
  name: string;
  /** Street line, e.g. "10th St NE". */
  address: string | null;
  /** Neighborhood or city. */
  area: string | null;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
  kind: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  /** One line on why it's a good date — AI picks only. */
  why?: string | null;
  hot?: boolean;
};

export type PlanCategory = 'drinks' | 'dinner' | 'coffee' | 'activity';

export function formatMiles(mi: number | null | undefined) {
  if (mi == null) return null;
  return mi < 0.1 ? 'Right nearby' : `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi away`;
}

/** Throws a user-facing message when location is off, so callers can show it directly. */
export async function getMyLocation(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Turn on location for DateToday to see spots near you.');
  const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }).catch(() => null);
  const pos =
    last ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
  if (!pos) throw new Error('Couldn’t find your location. Try searching instead.');
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/** Location only if already allowed — never prompts. Used to bias search results. */
export async function getMyLocationQuietly(): Promise<LatLng | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** POST to the searchPlaces function; `slowMessage` is shown when it times out. */
export async function placesRequest<T>(
  body: Record<string, unknown>,
  { timeoutMs = 32000, slowMessage = 'Places are taking too long. Type it in instead.' } = {},
): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(functionsUrl('searchPlaces'), {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(json.error || 'Couldn’t load places right now.');
    return json;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new Error(slowMessage);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function callSearch(body: Record<string, unknown>, timeoutMs = 32000): Promise<Place[]> {
  const json = await placesRequest<{ places?: Place[] }>(body, { timeoutMs });
  return json.places ?? [];
}

const nearbyCache = new Map<string, Promise<Place[]>>();
const hotCache = new Map<string, Promise<Place[]>>();

function cachedCall(cache: Map<string, Promise<Place[]>>, key: string, run: () => Promise<Place[]>) {
  const hit = cache.get(key);
  if (hit) return hit;
  const task = run();
  cache.set(key, task);
  task.then(
    (places) => {
      if (!places.length) cache.delete(key);
    },
    () => cache.delete(key),
  );
  return task;
}

/**
 * Public spots near you for a date type, closest first. Shared in-flight/cached per ~100 m so the
 * sheet can prefetch on open and "Near me" resolves instantly.
 */
export function nearbyPlaces(me: LatLng, category: PlanCategory, cuisine?: string | null) {
  const key = `${category}|${cuisine ?? ''}|${me.lat.toFixed(3)},${me.lng.toFixed(3)}`;
  return cachedCall(nearbyCache, key, () =>
    callSearch({ mode: 'nearby', lat: me.lat, lng: me.lng, category, cuisine: cuisine ?? null }),
  );
}

/** Popular, well-reviewed spots picked by AI from live web search. Slow on a cold area, instant after. */
export function hotPlaces(me: LatLng, category: PlanCategory, cuisine?: string | null) {
  const key = `${category}|${cuisine ?? ''}|${me.lat.toFixed(2)},${me.lng.toFixed(2)}`;
  return cachedCall(hotCache, key, () =>
    callSearch({ mode: 'hot', lat: me.lat, lng: me.lng, category, cuisine: cuisine ?? null }, 55000),
  );
}

/** Warm the nearby and hot lists for where "near me" means (see `getHereQuietly`). */
export async function prefetchNearby(me: LatLng | null, category: PlanCategory, cuisine?: string | null) {
  if (!me) return;
  await Promise.all([
    nearbyPlaces(me, category, cuisine).catch(() => undefined),
    hotPlaces(me, category, cuisine).catch(() => undefined),
  ]);
}

export function ratingLine(p: Pick<Place, 'rating' | 'reviewCount'>) {
  if (!p.rating) return null;
  const count = p.reviewCount
    ? ` (${p.reviewCount >= 1000 ? `${(p.reviewCount / 1000).toFixed(p.reviewCount >= 10000 ? 0 : 1)}k` : p.reviewCount})`
    : '';
  return `★ ${p.rating.toFixed(1)}${count}`;
}

export type CityResult = {
  id: string;
  name: string;
  region: string | null;
  country: string | null;
  lat: number;
  lng: number;
};

/** Travel Mode city picker. */
export async function searchCities(query: string): Promise<CityResult[]> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(functionsUrl('searchPlaces'), {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'city', query }),
    });
    const json = (await res.json().catch(() => ({}))) as { cities?: CityResult[]; error?: string };
    if (!res.ok) throw new Error(json.error || 'Couldn’t search cities right now.');
    return json.cities ?? [];
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new Error('City search is taking too long. Try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Search restaurants, bars, and other spots by name, biased to where you are. */
export function searchPlaces(query: string, me: LatLng | null) {
  return callSearch({ mode: 'search', query, lat: me?.lat ?? null, lng: me?.lng ?? null });
}

export type HalfwayStatus = 'ok' | 'close' | 'unavailable' | 'too_far';

/**
 * Spots about halfway between you and a match, fairest trip first. The server works out where they
 * are; only places and your own distance come back.
 */
export async function halfwayPlaces(args: {
  me: LatLng;
  matchId: string;
  category: PlanCategory;
  cuisine?: string | null;
  kind?: 'theaters';
}) {
  const { me, matchId, category, cuisine, kind } = args;
  const key = `${matchId}|${kind ?? category}|${cuisine ?? ''}|${me.lat.toFixed(2)},${me.lng.toFixed(2)}`;
  const hit = halfwayCache.get(key);
  if (hit) return hit;
  const task = placesRequest<{ places?: Place[]; halfway?: HalfwayStatus }>(
    { mode: 'halfway', matchId, lat: me.lat, lng: me.lng, category, cuisine: cuisine ?? null, kind: kind ?? null },
    { timeoutMs: 32000, slowMessage: 'Halfway spots are taking a while. Try again in a moment.' },
  ).then((json) => ({ places: json.places ?? [], status: json.halfway ?? ('ok' as HalfwayStatus) }));
  halfwayCache.set(key, task);
  task.then(
    (r) => {
      if (!r.places.length) halfwayCache.delete(key);
    },
    () => halfwayCache.delete(key),
  );
  return task;
}

const halfwayCache = new Map<string, Promise<{ places: Place[]; status: HalfwayStatus }>>();
