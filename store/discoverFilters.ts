/**
 * Discovery filters — free basics stay useful;
 * precision / lifestyle filters are DateToday+ (gated in UI with ✦).
 * Persisted on device so they survive restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { DatingIntention, TonightActivity } from '@/types';
import type { FoodCuisine } from '@/constants/tonightVibe';
import { FREE_DEFAULT_RADIUS } from '@/constants/tonightVibe';

const STORAGE_KEY = 'datetoday.discoverFilters.v2';

export const AGE_BOUNDS = { min: 18, max: 70 } as const;
export const HEIGHT_BOUNDS_CM = { min: 147, max: 213 } as const;

export interface DiscoverFilterValues {
  /** Free: up to 25 mi. Plus: up to 50. */
  maxDistanceMiles: number;
  /** Free: people free until at least this hour (24h). */
  freeUntilHour: number | null;
  /** Free: overlap with tonight activities. */
  vibeFilter: TonightActivity[];
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
}

export interface DiscoverFilterState extends DiscoverFilterValues {
  hydrated: boolean;
  patch: (next: Partial<DiscoverFilterValues>) => void;
  setMaxDistanceMiles: (miles: number) => void;
  setFreeUntilHour: (hour: number | null) => void;
  toggleVibeFilter: (activity: TonightActivity) => void;
  toggleFoodFilter: (cuisine: FoodCuisine, allowMany: boolean) => void;
  setVerifiedOnly: (value: boolean) => void;
  setMatchAllFilters: (value: boolean) => void;
  toggleIn: (
    key: 'intents' | 'drinking' | 'smoking' | 'interestFilter' | 'kids' | 'exercise',
    value: string,
  ) => void;
  reset: () => void;
}

export const DEFAULT_FILTERS: DiscoverFilterValues = {
  maxDistanceMiles: FREE_DEFAULT_RADIUS,
  freeUntilHour: null,
  vibeFilter: [],
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
};

const VALUE_KEYS = Object.keys(DEFAULT_FILTERS) as (keyof DiscoverFilterValues)[];

function pickValues(state: DiscoverFilterValues): DiscoverFilterValues {
  return Object.fromEntries(VALUE_KEYS.map((k) => [k, state[k]])) as unknown as DiscoverFilterValues;
}

function isValidSaved(fallback: unknown, value: unknown): boolean {
  if (value === undefined) return false;
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (fallback === null) return value === null || typeof value === 'number';
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
  setFreeUntilHour: (freeUntilHour) => set({ freeUntilHour }),
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
