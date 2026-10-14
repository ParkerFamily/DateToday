import type { Place } from '@/features/places/search';

/** Server-side Explore place categories (functions/explore.js). The plan sheet uses `movies` for theaters. */
export type PlaceCategory = 'foodie' | 'drinks' | 'coffee' | 'activities' | 'movies' | 'late';
export type FoodieStyle = 'anything' | 'italian' | 'sushi' | 'mexican' | 'seafood' | 'steak' | 'brunch' | 'dessert';
export type EventWindow = 'tonight' | 'soon';

export type ExplorePlace = Place & {
  /** 0 (free) – 4; only from Google. */
  priceLevel: number | null;
  /** Key-free image URL; only from Google. */
  photo: string | null;
  photoCredit: string | null;
  /** Google Maps listing. */
  mapsUri: string | null;
  /** null when the provider has no hours for this place. */
  openNow: boolean | null;
  /** Minutes after midnight, place-local, while open. */
  closesAt: number | null;
  lateTonight: boolean | null;
  open24h: boolean;
  source: 'google' | 'osm';
};

export type ExploreEvent = {
  id: string;
  name: string;
  /** Ticketmaster event page (tickets live there). */
  url: string;
  image: string | null;
  /** Exact start; null when the listing has no set time. */
  startsAt: string | null;
  /** YYYY-MM-DD in the venue's time zone. */
  localDate: string;
  /** HH:MM, venue time; null when not set. */
  localTime: string | null;
  venueName: string | null;
  address: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
  segment: string | null;
  genre: string | null;
  source: 'ticketmaster';
};

/** Ticketmaster lists the start in the venue's time; show it as "Tonight · 7:30 PM" / "Sat, Oct 17 · 8 PM". */
export function eventWhenLabel(e: Pick<ExploreEvent, 'localDate' | 'localTime'>, now: Date = new Date()) {
  const [y, m, d] = e.localDate.split('-').map(Number);
  const day = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  let time: string | null = null;
  let evening = false;
  if (e.localTime) {
    const [hh, mm] = e.localTime.split(':').map(Number);
    evening = hh >= 17;
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    time = `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${hh >= 12 ? 'PM' : 'AM'}`;
  }
  const dayText =
    diff === 0
      ? evening || !time
        ? 'Tonight'
        : 'Today'
      : diff === 1
        ? 'Tomorrow'
        : day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return time ? `${dayText} · ${time}` : `${dayText} · Time TBA`;
}

export function eventTag(e: Pick<ExploreEvent, 'segment' | 'genre'>) {
  if (e.genre && /comedy/i.test(e.genre)) return 'Comedy';
  if (e.segment === 'Music') return e.genre || 'Concert';
  return e.genre || e.segment || 'Event';
}

/** Tonight runs until 4 AM; "Coming up" is the next two weeks. */
export function eventRange(window: EventWindow, now: Date = new Date()) {
  const end = new Date(now);
  if (window === 'soon') {
    end.setDate(end.getDate() + 14);
  } else {
    if (now.getHours() >= 4) end.setDate(end.getDate() + 1);
    end.setHours(4, 0, 0, 0);
  }
  return { startMs: now.getTime(), endMs: end.getTime() };
}

/**
 * Events worth planning a date around: not already started, and one row per show and venue
 * (timed-entry attractions list every 15-minute slot). Keeps the earliest upcoming slot.
 */
export function plannableEvents<E extends Pick<ExploreEvent, 'name' | 'venueName' | 'startsAt'>>(
  events: readonly E[],
  now: Date = new Date(),
): E[] {
  const seen = new Set<string>();
  const out: E[] = [];
  for (const e of events) {
    const at = e.startsAt ? Date.parse(e.startsAt) : NaN;
    if (Number.isFinite(at) && at < now.getTime()) continue;
    const key = `${e.name.trim().toLowerCase()}|${(e.venueName ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
