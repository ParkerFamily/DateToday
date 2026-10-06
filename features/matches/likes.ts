import { useEffect, useState } from 'react';
import { fetchPublicCard, type PublicCard } from '@/features/matches/api';

export const FREE_LIKES_PREVIEW = 1;

/** Loads public cards for the given uids; null = profile missing/deleted. Failed loads retry. */
export function usePublicCards(uids: string[]) {
  const [cards, setCards] = useState<Record<string, PublicCard | null>>({});
  const [retryTick, setRetryTick] = useState(0);
  // Callers rebuild the array on every snapshot; key on contents so in-flight loads aren't dropped.
  const key = uids.join(',');

  useEffect(() => {
    const missing = (key ? key.split(',') : []).filter((id) => !(id in cards));
    if (!missing.length) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    void Promise.all(missing.map(async (id) => [id, await fetchPublicCard(id)] as const)).then((pairs) => {
      if (!alive) return;
      const loaded = pairs.filter((p): p is readonly [string, PublicCard | null] => p[1] !== undefined);
      if (loaded.length) {
        setCards((prev) => {
          const next = { ...prev };
          for (const [id, card] of loaded) next[id] = card;
          return next;
        });
      }
      if (loaded.length < pairs.length) retry = setTimeout(() => setRetryTick((n) => n + 1), 5000);
    });
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryTick]);

  return cards;
}

/**
 * Free sees the oldest like until they match with them, so new likes can't rotate who's revealed.
 * Likes arrive newest first.
 */
export function splitLikes<T extends { fromUid: string }>(all: T[], unlocked: boolean) {
  if (unlocked) return { visible: all, locked: [] as T[] };
  const shown = new Set(all.slice(-FREE_LIKES_PREVIEW).map((r) => r.fromUid));
  return {
    visible: all.filter((r) => shown.has(r.fromUid)),
    locked: all.filter((r) => !shown.has(r.fromUid)),
  };
}
