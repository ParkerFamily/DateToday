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
import { flushOutbox } from '@/features/matches/outbox';
import { syncAppBadge } from '@/features/notifications/push';
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
  const unreadCount = useUnreadMatchCount();

  useEffect(() => {
    syncAppBadge(uid ? unreadCount : 0);
  }, [uid, unreadCount]);

  useEffect(() => {
    const store = useMatchesStore.getState();
    if (!uid || !isFirebaseConfigured()) {
      store.set({ matches: [], loaded: true, error: null, likedMe: [] });
      useBlocksStore.getState().setHidden([]);
      return;
    }
    void flushOutbox();
    store.set({ loaded: false, error: null, likedMe: null });
    // An errored listener never recovers on its own; keep every inbox listener live by resubscribing.
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const retryLater = (fn: () => void, ms: number) => {
      if (alive) timers.push(setTimeout(() => alive && fn(), ms));
    };
    let unsubMatches = () => {};
    let unsubLikes = () => {};
    let unsubHidden = () => {};
    const listenMatches = () => {
      unsubMatches = subscribeMatches(
        uid,
        (matches) => useMatchesStore.getState().set({ matches, loaded: true, error: null }),
        (error) => {
          useMatchesStore.getState().set({ loaded: true, error: error.message });
          retryLater(listenMatches, 5000);
        },
      );
    };
    const listenLikes = () => {
      unsubLikes = subscribeReceivedInterests(
        uid,
        (likedMe) => useMatchesStore.getState().set({ likedMe }),
        () => retryLater(listenLikes, 5000),
      );
    };
    const listenHidden = () => {
      unsubHidden = subscribeHiddenUsers(uid, () => retryLater(listenHidden, 5000));
    };
    listenHidden();
    listenMatches();
    listenLikes();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      unsubMatches();
      unsubLikes();
      unsubHidden();
    };
  }, [uid]);
}

/** Hearts from people I haven't matched with (or blocked) yet. */
export function usePendingLikes() {
  const likedMe = useMatchesStore((s) => s.likedMe);
  const loaded = useMatchesStore((s) => s.loaded);
  const matches = useMatchesStore((s) => s.matches);
  const blocked = useHiddenUserMap();
  
  return useMemo(() => {
    if (!likedMe || !loaded) return null;
    const matchedIds = new Set(matches.flatMap((m) => m.userIds));
    return likedMe.filter((r) => r.fromUid && !matchedIds.has(r.fromUid) && !blocked[r.fromUid]);
  }, [likedMe, loaded, matches, blocked]);
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
  return useMemo(() => visible.reduce((sum, m) => sum + (m.unread[uid] ?? 0), 0), [visible, uid]);
}
