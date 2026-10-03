import { useEffect, useState } from 'react';
import { fetchPublicCard, type PublicCard } from '@/features/matches/api';

export const FREE_LIKES_PREVIEW = 1;

/** Loads public cards for the given uids; null = profile missing/deleted. */
export function usePublicCards(uids: string[]) {
  const [cards, setCards] = useState<Record<string, PublicCard | null>>({});

  useEffect(() => {
    const missing = uids.filter((id) => !(id in cards));
    if (!missing.length) return;
    let alive = true;
    void Promise.all(missing.map(async (id) => [id, await fetchPublicCard(id)] as const)).then((pairs) => {
      if (!alive) return;
      setCards((prev) => {
        const next = { ...prev };
        for (const [id, card] of pairs) next[id] = card;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [uids, cards]);

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
