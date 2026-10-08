import type { TravelTrip, TripBadge } from '@/types';

/** How far ahead a trip can start, and how long it can run. */
export const TRIP_MAX_DAYS_AHEAD = 14;
export const TRIP_MAX_NIGHTS = 7;

export type TripPhase = 'upcoming' | 'here' | 'over';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD (sortable as a string). */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local noon on that day, so DST shifts never move it to a neighbor. */
export function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: string, days: number): string {
  const d = dayFromKey(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayFromKey(to).getTime() - dayFromKey(from).getTime()) / 86_400_000);
}

export function tripPhase(trip: Pick<TripBadge, 'startsOn' | 'endsOn'>, now: Date = new Date()): TripPhase {
  const today = dayKey(now);
  if (today > trip.endsOn) return 'over';
  return today < trip.startsOn ? 'upcoming' : 'here';
}

/** "today", "tomorrow", "Fri" within the week, else "Oct 12". */
export function shortDay(key: string, now: Date = new Date()): string {
  const diff = daysBetween(dayKey(now), key);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  const d = dayFromKey(key);
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * How a traveler is labelled to everyone else. Never implies they're nearby:
 * "Traveling to Atlanta · Fri" before the trip, "In Atlanta through Sun" during it.
 */
export function tripLabel(trip: TripBadge, now: Date = new Date()): string {
  if (tripPhase(trip, now) === 'upcoming') return `Traveling to ${trip.city} · ${cap(shortDay(trip.startsOn, now))}`;
  if (trip.endsOn === dayKey(now)) return `In ${trip.city} today`;
  return `In ${trip.city} through ${shortDay(trip.endsOn, now)}`;
}

/** "Fri – Sun", "Today – Tue", or a single day. */
export function tripDatesLabel(trip: Pick<TripBadge, 'startsOn' | 'endsOn'>, now: Date = new Date()): string {
  const start = cap(shortDay(trip.startsOn, now));
  if (trip.startsOn === trip.endsOn) return start;
  return `${start} – ${cap(shortDay(trip.endsOn, now))}`;
}

/** A trip someone else wrote, checked before we label anyone with it. */
export function cleanTripBadge(raw: unknown): TripBadge | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const city = typeof t.city === 'string' ? t.city.trim().slice(0, 60) : '';
  const startsOn = typeof t.startsOn === 'string' && DAY_KEY.test(t.startsOn) ? t.startsOn : null;
  const endsOn = typeof t.endsOn === 'string' && DAY_KEY.test(t.endsOn) ? t.endsOn : null;
  if (!city || !startsOn || !endsOn || startsOn > endsOn) return null;
  return { city, startsOn, endsOn };
}

export function cleanTrip(raw: unknown): TravelTrip | null {
  const badge = cleanTripBadge(raw);
  if (!badge) return null;
  const t = raw as Record<string, unknown>;
  const latitude = Number(t.latitude);
  const longitude = Number(t.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    ...badge,
    region: typeof t.region === 'string' ? t.region.slice(0, 60) : null,
    latitude,
    longitude,
  };
}

/** A trip you can still go Live with: not over, and inside the allowed window. */
export function usableTrip(trip: TravelTrip | null | undefined, now: Date = new Date()): TravelTrip | null {
  if (!trip || tripPhase(trip, now) === 'over') return null;
  const today = dayKey(now);
  if (daysBetween(today, trip.startsOn) > TRIP_MAX_DAYS_AHEAD) return null;
  if (daysBetween(trip.startsOn, trip.endsOn) > TRIP_MAX_NIGHTS) return null;
  return trip;
}

export type CityPick = { name: string; region: string; lat: number; lng: number };

/** One-tap picks; anything else comes from city search. */
export const POPULAR_CITIES: CityPick[] = [
  { name: 'Atlanta', region: 'Georgia', lat: 33.749, lng: -84.388 },
  { name: 'Miami', region: 'Florida', lat: 25.762, lng: -80.192 },
  { name: 'New York', region: 'New York', lat: 40.713, lng: -74.006 },
  { name: 'Los Angeles', region: 'California', lat: 34.052, lng: -118.244 },
  { name: 'Chicago', region: 'Illinois', lat: 41.878, lng: -87.63 },
  { name: 'Houston', region: 'Texas', lat: 29.76, lng: -95.37 },
  { name: 'Nashville', region: 'Tennessee', lat: 36.163, lng: -86.781 },
  { name: 'Las Vegas', region: 'Nevada', lat: 36.17, lng: -115.14 },
  { name: 'Austin', region: 'Texas', lat: 30.267, lng: -97.743 },
  { name: 'New Orleans', region: 'Louisiana', lat: 29.951, lng: -90.072 },
  { name: 'Washington', region: 'D.C.', lat: 38.907, lng: -77.037 },
  { name: 'Dallas', region: 'Texas', lat: 32.777, lng: -96.797 },
];

/**
 * How far someone really is from the viewer. In Travel Mode that's from the viewer's actual location
 * (null when unknown), never from the trip city's center.
 */
export function shownDistanceMiles(card: { distanceMiles: number; awayMiles?: number | null }): number | null {
  return card.awayMiles === undefined ? card.distanceMiles : card.awayMiles;
}

/** Traveler whose trip hasn't started: they aren't out in that city tonight. */
export function isUpcomingTraveler(card: { trip?: TripBadge | null }, now: Date = new Date()): boolean {
  return Boolean(card.trip && tripPhase(card.trip, now) === 'upcoming');
}
