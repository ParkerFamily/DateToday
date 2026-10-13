import type { FoodCuisine } from '@/constants/tonightVibe';
import type { Place, PlanCategory } from '@/features/places/search';
import type { LiveMode, TonightActivity } from '@/types';

export type ExploreCategory = 'foodie' | 'drinks' | 'coffee' | 'activities' | 'movies' | 'events' | 'late';
export type PlaceCategory = Exclude<ExploreCategory, 'events'>;
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

export type ExploreCategoryInfo = {
  value: ExploreCategory;
  emoji: string;
  label: string;
  blurb: string;
  /** Card art when a spot has no photo. */
  tint: [string, string];
  plusOnly?: boolean;
};

export const EXPLORE_CATEGORIES: ExploreCategoryInfo[] = [
  { value: 'foodie', emoji: '🍽', label: 'Foodie', blurb: 'Dinner spots worth the trip', tint: ['#7C2D12', '#1F0A12'] },
  { value: 'drinks', emoji: '🍸', label: 'Drinks', blurb: 'Bars, lounges & wine', tint: ['#6D28D9', '#160B2B'] },
  { value: 'coffee', emoji: '☕', label: 'Coffee', blurb: 'Easy first meets', tint: ['#78350F', '#1A1009'] },
  { value: 'activities', emoji: '🎳', label: 'Activities', blurb: 'Do something fun', tint: ['#0E7490', '#071A22'] },
  { value: 'movies', emoji: '🎬', label: 'Movies', blurb: 'Theaters near you', tint: ['#9F1239', '#1C0710'] },
  { value: 'events', emoji: '🎟', label: 'Events', blurb: 'Shows & things happening', tint: ['#A21CAF', '#1B0720'] },
  { value: 'late', emoji: '🌙', label: 'After Hours', blurb: 'Open late tonight', tint: ['#312E81', '#0A0918'], plusOnly: true },
];

export const FOODIE_STYLES: { value: FoodieStyle; label: string }[] = [
  { value: 'anything', label: 'Anything' },
  { value: 'italian', label: 'Italian' },
  { value: 'sushi', label: 'Sushi' },
  { value: 'mexican', label: 'Mexican' },
  { value: 'seafood', label: 'Seafood' },
  { value: 'steak', label: 'Steak' },
  { value: 'brunch', label: 'Brunch' },
  { value: 'dessert', label: 'Dessert' },
];

export const PLACE_RADII = [1, 3, 5, 10, 25] as const;
export const DEFAULT_PLACE_RADIUS = 5;
export const DEFAULT_EVENT_RADIUS = 10;

export function categoryInfo(value: ExploreCategory) {
  return EXPLORE_CATEGORIES.find((c) => c.value === value) ?? EXPLORE_CATEGORIES[0];
}

/**
 * Categories this person can see. Friend Date never assumes drinking, so Drinks and After Hours
 * (bars and clubs) need 21+, same rule as the Live screen.
 */
export function visibleCategories(mode: LiveMode, age: number | null) {
  const drinksOk = mode !== 'friend' || (age != null && age >= 21);
  return EXPLORE_CATEGORIES.filter((c) => drinksOk || (c.value !== 'drinks' && c.value !== 'late'));
}

const CUISINE_FOR_STYLE: Partial<Record<FoodieStyle, FoodCuisine>> = {
  italian: 'italian',
  sushi: 'sushi',
  mexican: 'mexican',
  seafood: 'seafood',
  steak: 'steakhouse',
};

const BAR_KIND = /\b(bar|pub|club|lounge|tavern|brew|wine|cocktail|beer|night)/i;

/** How an Explore pick maps onto the existing plan types (plan sheet, Live plans and filters). */
export function planShape(
  category: ExploreCategory,
  opts: { style?: FoodieStyle | null; kind?: string | null } = {},
): { plan: PlanCategory; activity: TonightActivity; cuisine: FoodCuisine | null; label: string | null } {
  switch (category) {
    case 'foodie':
      return { plan: 'dinner', activity: 'dinner', cuisine: CUISINE_FOR_STYLE[opts.style ?? 'anything'] ?? null, label: null };
    case 'drinks':
      return { plan: 'drinks', activity: 'drinks', cuisine: null, label: null };
    case 'coffee':
      return { plan: 'coffee', activity: 'coffee', cuisine: null, label: null };
    case 'movies':
      return { plan: 'activity', activity: 'activity', cuisine: null, label: '🎬 Movie' };
    case 'events':
      return { plan: 'activity', activity: 'activity', cuisine: null, label: '🎟 Event' };
    case 'late':
      return opts.kind && !BAR_KIND.test(opts.kind)
        ? { plan: 'dinner', activity: 'dinner', cuisine: null, label: '🌙 Late bite' }
        : { plan: 'drinks', activity: 'drinks', cuisine: null, label: '🌙 Late drinks' };
    default:
      return { plan: 'activity', activity: 'activity', cuisine: null, label: null };
  }
}

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

export type EventFilter = 'all' | 'music' | 'comedy' | 'arts' | 'sports' | 'other';

export const EVENT_FILTERS: { value: EventFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'music', label: 'Concerts' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'arts', label: 'Arts & Theatre' },
  { value: 'sports', label: 'Sports' },
  { value: 'other', label: 'More' },
];

export function eventKind(e: Pick<ExploreEvent, 'segment' | 'genre'>): Exclude<EventFilter, 'all'> {
  if (e.genre && /comedy/i.test(e.genre)) return 'comedy';
  if (e.segment === 'Music') return 'music';
  if (e.segment === 'Arts & Theatre') return 'arts';
  if (e.segment === 'Sports') return 'sports';
  return 'other';
}

export function eventTag(e: Pick<ExploreEvent, 'segment' | 'genre'>) {
  const kind = eventKind(e);
  if (kind === 'comedy') return 'Comedy';
  if (kind === 'music') return e.genre ? `${e.genre}` : 'Concert';
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

/** "Open until 2 AM" etc. Never guessed: only when the provider gave hours. */
export function hoursLine(p: Pick<ExplorePlace, 'openNow' | 'closesAt' | 'open24h'>) {
  if (p.open24h) return { text: 'Open 24 hours', open: true };
  if (p.openNow == null) return null;
  if (!p.openNow) return { text: 'Closed now', open: false };
  if (p.closesAt == null) return { text: 'Open now', open: true };
  const h = Math.floor(p.closesAt / 60);
  const m = p.closesAt % 60;
  const label = h === 0 && m === 0 ? 'midnight' : `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  return { text: `Open until ${label}`, open: true };
}

export function priceLabel(level: number | null | undefined) {
  if (level == null) return null;
  return level === 0 ? 'Free' : '$'.repeat(Math.min(4, Math.max(1, level)));
}
