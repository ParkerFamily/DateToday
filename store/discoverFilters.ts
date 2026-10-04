/**
 * Discovery filters — free basics stay useful;
 * precision / lifestyle filters are DateToday+ (gated in UI with ✦).
 * Persisted on device so they survive restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { DatingIntention, TonightActivity, TonightEnergy, TravelPref } from '@/types';
import type { FoodCuisine } from '@/constants/tonightVibe';
import { FREE_DEFAULT_RADIUS } from '@/constants/tonightVibe';
import type { FreeFor, HowSoon, OutLate } from '@/constants/afterHours';
import type { TraitKey } from '@/constants/datingTraits';

const STORAGE_KEY = 'datetoday.discoverFilters.v2';

export const AGE_BOUNDS = { min: 18, max: 70 } as const;
export const HEIGHT_BOUNDS_CM = { min: 147, max: 213 } as const;

type TraitFilters = Record<TraitKey, string[]>;

export interface DiscoverFilterValues extends TraitFilters {
  /** Free: up to 25 mi. Plus: up to 50. */
  maxDistanceMiles: number;
  /** Free: what they're down for tonight. */
  vibeFilter: TonightActivity[];
  /** Free: tonight's energy they picked when going live. */
  energy: TonightEnergy[];
  /** Free: how long they're free once available. */
  freeFor: FreeFor | null;
  /** Free: only people with a spot or idea already in mind. */
  planInMind: boolean;
  /** Free: how they're getting there. */
  travel: TravelPref[];
  /** Free: live tonight, or nearby and seen in the last day. */
  recentlyActive: boolean;
  /** Free: one cuisine; Plus: several. */
  foodFilter: FoodCuisine[];
  /** Free — trust / safety. */
  verifiedOnly: boolean;
  /** Free: people into at least one of these interests. */
  interestFilter: string[];
  /** Free: people who share at least one of my profile interests. */
  sharedInterestsOnly: boolean;
  /** Plus: kids / workout (profile values). */
  kids: string[];
  exercise: string[];
  /** Free: age range; null end = no bound. */
  ageMin: number | null;
  ageMax: number | null;
  /** Plus: what they're looking for. */
  intents: DatingIntention[];
  /** Plus: height range in cm. */
  minHeightCm: number | null;
  maxHeightCm: number | null;
  /** Plus: lifestyle (profile values: Never / Sometimes / Socially / Often). */
  drinking: string[];
  smoking: string[];
  /** Plus: only people with a video intro. */
  videoOnly: boolean;
  /** Plus: require every filter (and hide people missing that info). */
  matchAllFilters: boolean;
  /** Free: now / 30 min / 1 hour / later tonight. */
  howSoon: HowSoon | null;
  /** Plus, 9 PM–5 AM only: free until at least this late. */
  outLate: OutLate | null;
  /** Plus, 9 PM–5 AM only: live right now (not "free later"). */
  afterHoursNow: boolean;
  /** Plus, 9 PM–5 AM only: picked any late-night option when going live. */
  lateNightOpen: boolean;
  /** Plus, 9 PM–5 AM only: tagged themselves "Still outside". */
  stillOut: boolean;
  /** Plus: went live in the last 45 min. */
  lastMinute: boolean;
  /** Plus: confirmed they're free in the last 30 min. */
  readyNow: boolean;
  /** Plus: ultra-tight radius (1 / 2 / 5 mi). */
  closeByMiles: number | null;
}

export interface DiscoverFilterState extends DiscoverFilterValues {
  hydrated: boolean;
  patch: (next: Partial<DiscoverFilterValues>) => void;
  setMaxDistanceMiles: (miles: number) => void;
  toggleVibeFilter: (activity: TonightActivity) => void;
  toggleFoodFilter: (cuisine: FoodCuisine, allowMany: boolean) => void;
  setVerifiedOnly: (value: boolean) => void;
  setMatchAllFilters: (value: boolean) => void;
  toggleIn: (
    key:
      | 'intents'
      | 'drinking'
      | 'smoking'
      | 'interestFilter'
      | 'kids'
      | 'exercise'
      | 'vibeFilter'
      | 'energy'
      | 'travel'
      | TraitKey,
    value: string,
  ) => void;
  reset: () => void;
}

export const DEFAULT_FILTERS: DiscoverFilterValues = {
  maxDistanceMiles: FREE_DEFAULT_RADIUS,
  vibeFilter: [],
  energy: [],
  freeFor: null,
  planInMind: false,
  travel: [],
  recentlyActive: false,
  foodFilter: [],
  verifiedOnly: false,
  interestFilter: [],
  sharedInterestsOnly: false,
  kids: [],
  exercise: [],
  ageMin: null,
  ageMax: null,
  intents: [],
  minHeightCm: null,
  maxHeightCm: null,
  drinking: [],
  smoking: [],
  videoOnly: false,
  matchAllFilters: false,
  howSoon: null,
  outLate: null,
  afterHoursNow: false,
  lateNightOpen: false,
  stillOut: false,
  lastMinute: false,
  readyNow: false,
  closeByMiles: null,
  weed: [],
  pets: [],
  education: [],
  industry: [],
  religion: [],
  politics: [],
  loveLanguage: [],
  communication: [],
  chronotype: [],
  socialEnergy: [],
};

const VALUE_KEYS = Object.keys(DEFAULT_FILTERS) as (keyof DiscoverFilterValues)[];

function pickValues(state: DiscoverFilterValues): DiscoverFilterValues {
  return Object.fromEntries(VALUE_KEYS.map((k) => [k, state[k]])) as unknown as DiscoverFilterValues;
}

function isValidSaved(fallback: unknown, value: unknown): boolean {
  if (value === undefined) return false;
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (fallback === null) return value === null || typeof value === 'number' || typeof value === 'string';
  return typeof value === typeof fallback;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export const useDiscoverFilters = create<DiscoverFilterState>((set, get) => ({
  ...DEFAULT_FILTERS,
  hydrated: false,
  patch: (next) => set(next),
  setMaxDistanceMiles: (maxDistanceMiles) => set({ maxDistanceMiles }),
  toggleVibeFilter: (activity) => set({ vibeFilter: toggle(get().vibeFilter, activity) }),
  toggleFoodFilter: (cuisine, allowMany) => {
    const current = get().foodFilter;
    if (current.includes(cuisine)) {
      set({ foodFilter: current.filter((c) => c !== cuisine) });
      return;
    }
    set({ foodFilter: allowMany ? [...current, cuisine].slice(0, 4) : [cuisine] });
  },
  setVerifiedOnly: (verifiedOnly) => set({ verifiedOnly }),
  setMatchAllFilters: (matchAllFilters) => set({ matchAllFilters }),
  toggleIn: (key, value) => set({ [key]: toggle(get()[key] as string[], value) }),
  reset: () => set({ ...DEFAULT_FILTERS }),
}));

void AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const clean = Object.fromEntries(
      VALUE_KEYS.filter((k) => isValidSaved(DEFAULT_FILTERS[k], saved[k])).map((k) => [k, saved[k]]),
    );
    useDiscoverFilters.setState(clean);
  })
  .catch(() => undefined)
  .finally(() => {
    useDiscoverFilters.setState({ hydrated: true });
    useDiscoverFilters.subscribe((state) => {
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pickValues(state))).catch(() => undefined);
    });
  });
