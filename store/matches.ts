import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import {
  fetchLikes,
  otherUserId,
  subscribeLikeInbox,
  subscribeMatches,
  type LikesFeed,
  type MatchDoc,
} from '@/features/matches/api';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { isPlusActive } from '@/lib/entitlements';
import { flushOutbox } from '@/features/matches/outbox';
import { syncAppBadge } from '@/features/notifications/push';
import { subscribeHiddenUsers } from '@/features/safety/api';
import { useBlocksStore, useHiddenUserMap } from '@/store/blocks';
import { useSessionStore } from '@/store/session';

type MatchesState = {
  matches: MatchDoc[];
  loaded: boolean;
  error: string | null;
  /** "Likes you" from the server (null until first load). */
  likes: LikesFeed | null;
  set: (patch: Partial<Omit<MatchesState, 'set'>>) => void;
};

export const useMatchesStore = create<MatchesState>((set) => ({
  matches: [],
  loaded: false,
  error: null,
  likes: null,
  set: (patch) => set(patch),
}));

let likesInFlight: Promise<void> | null = null;
let likesAgain = false;
let likesAgainFresh = false;
let likesRetry: ReturnType<typeof setTimeout> | null = null;

/** Refetch "Likes you". Calls during a fetch collapse into one follow-up. */
export function refreshLikes(fresh = false): Promise<void> {
  if (likesInFlight) {
    likesAgain = true;
    likesAgainFresh ||= fresh;
    return likesInFlight;
  }
  if (likesRetry) {
    clearTimeout(likesRetry);
    likesRetry = null;
  }
  likesInFlight = fetchLikes(fresh)
    .then((likes) => useMatchesStore.getState().set({ likes }))
    .catch(() => {
      // Keep the last known likes instead of flashing "No likes yet"; try again shortly.
      likesRetry = setTimeout(() => void refreshLikes(), 5000);
    })
    .finally(() => {
      likesInFlight = null;
      if (likesAgain) {
        const again = likesAgainFresh;
        likesAgain = false;
        likesAgainFresh = false;
        void refreshLikes(again);
      }
    });
  return likesInFlight;
}

/** Mount once (tabs layout). Keeps the signed-in user's matches and received hearts in sync. */
export function useMatchesSubscription() {
  const uid = useSessionStore((s) => s.userId);
  const plus = useSessionStore((s) => isPlusActive(s.entitlements));
  const unreadCount = useUnreadMatchCount();
  const matchCount = useMatchesStore((s) => s.matches.length);
  const hiddenCount = Object.keys(useHiddenUserMap()).length;

  useEffect(() => {
    syncAppBadge(uid ? unreadCount : 0);
  }, [uid, unreadCount]);

  useEffect(() => {
    const store = useMatchesStore.getState();
    if (!uid || !isFirebaseConfigured()) {
      store.set({ matches: [], loaded: true, error: null, likes: { plus: false, total: 0, revealed: [], locked: [] } });
      useBlocksStore.getState().setHidden([]);
      return;
    }
    void flushOutbox();
    store.set({ loaded: false, error: null, likes: null });
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
      unsubLikes = subscribeLikeInbox(
        uid,
        () => void refreshLikes(),
        () => {
          void refreshLikes();
          retryLater(listenLikes, 5000);
        },
      );
    };
    const listenHidden = () => {
      unsubHidden = subscribeHiddenUsers(uid, () => retryLater(listenHidden, 5000));
    };
    listenHidden();
    listenMatches();
    listenLikes();
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshLikes();
    });
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      unsubMatches();
      unsubLikes();
      unsubHidden();
      appState.remove();
    };
  }, [uid]);

  // A new match or block changes who's pending (and which like a free member sees next).
  useEffect(() => {
    if (uid && isFirebaseConfigured() && useMatchesStore.getState().likes) void refreshLikes();
  }, [uid, matchCount, hiddenCount]);

  // Just upgraded (or restored): re-verify with the store so every like unlocks right away.
  useEffect(() => {
    if (uid && plus && isFirebaseConfigured()) void refreshLikes(true);
  }, [uid, plus]);
}

/** Likes from people I haven't matched with (or blocked) yet. */
export function usePendingLikes(): LikesFeed | null {
  const likes = useMatchesStore((s) => s.likes);
  const loaded = useMatchesStore((s) => s.loaded);
  const matches = useMatchesStore((s) => s.matches);
  const blocked = useHiddenUserMap();

  return useMemo(() => {
    if (!likes || !loaded) return null;
    // The server already excludes these; this just hides them instantly until the refetch lands.
    const matchedIds = new Set(matches.flatMap((m) => m.userIds));
    const revealed = likes.revealed.filter((r) => !matchedIds.has(r.uid) && !blocked[r.uid]);
    return { ...likes, revealed, total: likes.total - (likes.revealed.length - revealed.length) };
  }, [likes, loaded, matches, blocked]);
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
