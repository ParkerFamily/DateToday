import { isAfterHours, type AfterHoursTag } from '@/constants/afterHours';
import type { FoodCuisine } from '@/constants/tonightVibe';
import type { PlanCategory } from '@/features/places/search';
import type { LiveMode, TonightActivity } from '@/types';

export type RoomId = 'foodie' | 'drinks' | 'coffee' | 'activities' | 'movies' | 'events' | 'late' | 'spontaneous';

export type Room = {
  id: RoomId;
  emoji: string;
  label: string;
  blurb: string;
  /** What you're Live for in this room. After Hours is any plan, tagged late-night. */
  activity: TonightActivity | null;
  /** Card art. */
  tint: [string, string];
};

/** Explore Tonight: one Live pool per mood. Being in a room is just being Live for that plan. */
export const ROOMS: Room[] = [
  { id: 'foodie', emoji: '🍽', label: 'Foodie', blurb: 'Live for dinner & food plans', activity: 'dinner', tint: ['#9A3412', '#2A0D0A'] },
  { id: 'drinks', emoji: '🍸', label: 'Drinks', blurb: 'Bars, lounges, a drink tonight', activity: 'drinks', tint: ['#7C3AED', '#1A0B33'] },
  { id: 'coffee', emoji: '☕', label: 'Coffee', blurb: 'Coffee, dessert, low-key', activity: 'coffee', tint: ['#92400E', '#1F1209'] },
  { id: 'activities', emoji: '🎳', label: 'Activities', blurb: 'Bowling, arcades, mini golf & more', activity: 'activity', tint: ['#0E7490', '#08202A'] },
  { id: 'movies', emoji: '🎬', label: 'Movies', blurb: 'Down for a movie date', activity: 'movie', tint: ['#BE123C', '#24060F'] },
  { id: 'events', emoji: '🎟', label: 'Events', blurb: 'Concerts, comedy & shows', activity: 'event', tint: ['#A21CAF', '#22072A'] },
  { id: 'late', emoji: '🌙', label: 'After Hours', blurb: 'Still out and up for late plans', activity: null, tint: ['#3730A3', '#0D0B24'] },
  { id: 'spontaneous', emoji: '⚡', label: 'Spontaneous', blurb: 'Down for whatever, right now', activity: 'surprise', tint: ['#B45309', '#231204'] },
];

export function roomInfo(id: RoomId): Room {
  return ROOMS.find((r) => r.id === id) ?? ROOMS[0];
}

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === 'string' && ROOMS.some((r) => r.id === value);
}

/** Friend Date never assumes drinking: Drinks and After Hours need 21+, same rule as the Live screen. */
export function visibleRooms(mode: LiveMode, age: number | null): Room[] {
  const drinksOk = mode !== 'friend' || (age != null && age >= 21);
  return ROOMS.filter((r) => drinksOk || (r.id !== 'drinks' && r.id !== 'late'));
}

export function inRoom(
  person: { activities?: readonly TonightActivity[] | null; afterHours?: readonly AfterHoursTag[] | null },
  room: RoomId,
): boolean {
  if (room === 'late') return (person.afterHours?.length ?? 0) > 0;
  const activity = roomInfo(room).activity;
  return activity != null && (person.activities ?? []).includes(activity);
}

/** After Hours only runs 9 PM–5 AM. */
export function roomOpen(room: RoomId, now: Date = new Date()): boolean {
  return room !== 'late' || isAfterHours(now);
}

/** What going Live in After Hours means for the plan. Drinks is dropped for under-21 Friend Date. */
export type LatePlan = 'drinks' | 'dinner' | 'surprise';
export const LATE_PLANS: { value: LatePlan; label: string }[] = [
  { value: 'drinks', label: 'Late drinks' },
  { value: 'dinner', label: 'Late bite' },
  { value: 'surprise', label: 'Whatever’s open' },
];

export type RoomLive = {
  activities: TonightActivity[];
  foodCuisines: FoodCuisine[];
  afterHours: AfterHoursTag[];
};

/** The Live session fields for going Live in a room. */
export function roomLive(room: RoomId, opts: { cuisine?: FoodCuisine | null; late?: LatePlan | null } = {}): RoomLive {
  if (room === 'late') {
    const plan = opts.late ?? 'surprise';
    return { activities: [plan], foodCuisines: plan === 'dinner' ? ['anything'] : [], afterHours: ['late_meet'] };
  }
  const activity = roomInfo(room).activity ?? 'surprise';
  return {
    activities: [activity],
    foodCuisines: room === 'foodie' ? [opts.cuisine ?? 'anything'] : [],
    afterHours: [],
  };
}

/** Joining a room while already Live: add its plan to tonight's, keep everything else. */
export function joinRoom(
  current: RoomLive,
  room: RoomId,
  opts: { cuisine?: FoodCuisine | null; late?: LatePlan | null } = {},
): RoomLive {
  const add = roomLive(room, opts);
  return {
    activities: [...new Set([...current.activities, ...add.activities])],
    foodCuisines: add.foodCuisines.length
      ? [...new Set([...current.foodCuisines.filter((c) => c !== 'anything'), ...add.foodCuisines])].slice(0, 4)
      : current.foodCuisines,
    afterHours: [...new Set([...current.afterHours, ...add.afterHours])],
  };
}

const ROOM_FOR_ACTIVITY: Partial<Record<TonightActivity, RoomId>> = {
  dinner: 'foodie',
  drinks: 'drinks',
  coffee: 'coffee',
  activity: 'activities',
  movie: 'movies',
  event: 'events',
  surprise: 'spontaneous',
};

/**
 * The room a match is about: the room you were browsing if they're in it too, else the first plan
 * you share. Picks which place or event list the plan sheet opens with.
 */
export function sharedRoom(
  browsing: RoomId | null,
  mine: { activities?: readonly TonightActivity[] | null },
  theirs: { activities?: readonly TonightActivity[] | null; afterHours?: readonly AfterHoursTag[] | null },
): RoomId | null {
  if (browsing && inRoom(theirs, browsing)) return browsing;
  const theirActs = new Set(theirs.activities ?? []);
  for (const a of mine.activities ?? []) {
    const room = ROOM_FOR_ACTIVITY[a];
    if (room && theirActs.has(a)) return room;
  }
  return null;
}

/** "Spot", "Movie" or "Event" — the Activity choices in the plan sheet. */
export type PlanPick = 'spot' | 'movie' | 'event';

/** How the plan sheet opens for a room: which kind of date, and for Activity, what to pick. */
export function planStartFor(room: RoomId | null): { category: PlanCategory; pick: PlanPick } | null {
  switch (room) {
    case 'foodie':
      return { category: 'dinner', pick: 'spot' };
    case 'drinks':
    case 'late':
      return { category: 'drinks', pick: 'spot' };
    case 'coffee':
      return { category: 'coffee', pick: 'spot' };
    case 'activities':
      return { category: 'activity', pick: 'spot' };
    case 'movies':
      return { category: 'activity', pick: 'movie' };
    case 'events':
      return { category: 'activity', pick: 'event' };
    default:
      return null;
  }
}
