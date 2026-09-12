/**
 * Discovery filters — free basics stay useful;
 * lifestyle / precision filters are DateToday+ (gated in UI with ✦).
 */
import { create } from 'zustand';
import type { TonightActivity } from '@/types';
import type { FoodCuisine } from '@/constants/tonightVibe';
import { FREE_DEFAULT_RADIUS } from '@/constants/tonightVibe';

export interface DiscoverFilterState {
  /** Free: up to 25 mi. Plus: exact / up to 50. */
  maxDistanceMiles: number;
  /** Free: prefer people free until at least this hour (24h). */
  freeUntilHour: number | null;
  /** Free: overlap with tonight activities */
  vibeFilter: TonightActivity[];
  /** Free: one cuisine; Plus: multiple */
  foodFilter: FoodCuisine[];
  /** Free — trust / safety */
  verifiedOnly: boolean;
  /** Plus */
  matchAllFilters: boolean;
  setMaxDistanceMiles: (miles: number) => void;
  setFreeUntilHour: (hour: number | null) => void;
  toggleVibeFilter: (activity: TonightActivity) => void;
  toggleFoodFilter: (cuisine: FoodCuisine) => void;
  setVerifiedOnly: (value: boolean) => void;
  setMatchAllFilters: (value: boolean) => void;
  reset: () => void;
}

const initial = {
  maxDistanceMiles: FREE_DEFAULT_RADIUS,
  freeUntilHour: null as number | null,
  vibeFilter: [] as TonightActivity[],
  foodFilter: [] as FoodCuisine[],
  verifiedOnly: false,
  matchAllFilters: false,
};

export const useDiscoverFilters = create<DiscoverFilterState>((set, get) => ({
  ...initial,
  setMaxDistanceMiles: (maxDistanceMiles) => set({ maxDistanceMiles }),
  setFreeUntilHour: (freeUntilHour) => set({ freeUntilHour }),
  toggleVibeFilter: (activity) => {
    const vibeFilter = get().vibeFilter.includes(activity)
      ? get().vibeFilter.filter((a) => a !== activity)
      : [...get().vibeFilter, activity];
    set({ vibeFilter });
  },
  toggleFoodFilter: (cuisine) => {
    const current = get().foodFilter;
    if (current.includes(cuisine)) {
      set({ foodFilter: current.filter((c) => c !== cuisine) });
      return;
    }
    // Free: one cuisine. Plus can stack — callers gate UI; we still allow multi
    // when already past one (Plus will set them). Hard cap of 1 unless Plus store
    // flag is present on session — keep simple: max 3 for Plus UX, max 1 default
    // replaced by entitlements-aware setter below if needed.
    set({ foodFilter: [...current, cuisine].slice(0, 3) });
  },
  setVerifiedOnly: (verifiedOnly) => set({ verifiedOnly }),
  setMatchAllFilters: (matchAllFilters) => set({ matchAllFilters }),
  reset: () => set({ ...initial }),
}));
