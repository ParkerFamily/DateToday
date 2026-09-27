import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import {
  otherUserId,
  subscribeMatches,
  subscribeReceivedInterests,
  type MatchDoc,
  type ReceivedInterest,
} from '@/features/matches/api';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { subscribeHiddenUsers } from '@/features/safety/api';
import { useBlocksStore, useHiddenUserMap } from '@/store/blocks';
import { useSessionStore } from '@/store/session';

type MatchesState = {
  matches: MatchDoc[];
  loaded: boolean;
  error: string | null;
  /** Hearts I've received (null until first snapshot). */
  likedMe: ReceivedInterest[] | null;
  set: (patch: Partial<Omit<MatchesState, 'set'>>) => void;
};

export const useMatchesStore = create<MatchesState>((set) => ({
  matches: [],
  loaded: false,
  error: null,
  likedMe: null,
  set: (patch) => set(patch),
}));

/** Mount once (tabs layout). Keeps the signed-in user's matches and received hearts in sync. */
export function useMatchesSubscription() {
  const uid = useSessionStore((s) => s.userId);

  useEffect(() => {
    const store = useMatchesStore.getState();
    if (!uid || !isFirebaseConfigured()) {
      store.set({ matches: [], loaded: true, error: null, likedMe: [] });
      useBlocksStore.getState().setHidden([]);
      return;
    }
    const unsubHidden = subscribeHiddenUsers(uid);
    store.set({ loaded: false, error: null, likedMe: null });
    const unsubMatches = subscribeMatches(
      uid,
      (matches) => useMatchesStore.getState().set({ matches, loaded: true, error: null }),
      (error) => useMatchesStore.getState().set({ loaded: true, error: error.message }),
    );
    const unsubLikes = subscribeReceivedInterests(uid, (likedMe) =>
      useMatchesStore.getState().set({ likedMe }),
    );
    return () => {
      unsubMatches();
      unsubLikes();
      unsubHidden();
    };
  }, [uid]);
}

/** Hearts from people I haven't matched with (or blocked) yet. */
export function usePendingLikes() {
  const likedMe = useMatchesStore((s) => s.likedMe);
  const matches = useMatchesStore((s) => s.matches);
  const blocked = useHiddenUserMap();
  return useMemo(() => {
    if (!likedMe) return null;
    const matched = new Set(matches.flatMap((m) => m.userIds));
    return likedMe.filter((r) => r.fromUid && !matched.has(r.fromUid) && !blocked[r.fromUid]);
  }, [likedMe, matches, blocked]);
}

/** Matches minus anyone I've blocked. */
export function useVisibleMatches() {
  const uid = useSessionStore((s) => s.userId) ?? '';
  const matches = useMatchesStore((s) => s.matches);
  const blocked = useHiddenUserMap();
  return useMemo(() => matches.filter((m) => !blocked[otherUserId(m, uid)]), [matches, blocked, uid]);
}

export function useUnreadMatchCount() {
  const uid = useSessionStore((s) => s.userId) ?? '';
  const visible = useVisibleMatches();
  return visible.reduce((sum, m) => sum + (m.unread[uid] ?? 0), 0);
}
