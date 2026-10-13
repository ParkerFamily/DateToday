import { create } from 'zustand';
import type { FoodCuisine } from '@/constants/tonightVibe';
import type { TonightActivity } from '@/types';

/** A spot picked in Explore, waiting to be preselected on the Live screen ("Find someone for this"). */
export type ExploreDraft = {
  activity: TonightActivity;
  cuisine: FoodCuisine | null;
  /** Shown as their "spot in mind" on Live. */
  spot: string;
};

type State = {
  draft: ExploreDraft | null;
  setDraft: (draft: ExploreDraft) => void;
  takeDraft: () => ExploreDraft | null;
};

export const useExploreDraft = create<State>((set, get) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  takeDraft: () => {
    const { draft } = get();
    if (draft) set({ draft: null });
    return draft;
  },
}));
