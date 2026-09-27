import { useMemo } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'datetoday.blockedUsers.v1';

export type BlockedEntry = {
  blockedId: string;
  displayName?: string | null;
  reason?: string | null;
  blockedAt: string;
};

type BlocksState = {
  byId: Record<string, BlockedEntry>;
  /** From hiddenUsers/{uid}: includes people who blocked me, who I must never see. */
  hidden: Record<string, true>;
  hydrated: boolean;
  setHidden: (uids: string[]) => void;
  hydrate: () => Promise<void>;
  isBlocked: (userId: string | null | undefined) => boolean;
  list: () => BlockedEntry[];
  addLocal: (entry: Omit<BlockedEntry, 'blockedAt'> & { blockedAt?: string }) => Promise<void>;
  removeLocal: (blockedId: string) => Promise<void>;
  replaceAll: (entries: BlockedEntry[]) => Promise<void>;
  reset: () => void;
};

async function persist(byId: Record<string, BlockedEntry>) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(byId));
  } catch {
    /* ignore */
  }
}

export const useBlocksStore = create<BlocksState>((set, get) => ({
  byId: {},
  hidden: {},
  hydrated: false,

  setHidden: (uids) => {
    const hidden: Record<string, true> = {};
    for (const id of uids) if (id) hidden[id] = true;
    set({ hidden });
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, BlockedEntry>;
        set({ byId: parsed ?? {}, hydrated: true });
        return;
      }
    } catch {
      /* ignore */
    }
    set({ hydrated: true });
  },

  isBlocked: (userId) => {
    if (!userId) return false;
    return Boolean(get().byId[userId] || get().hidden[userId]);
  },

  list: () => Object.values(get().byId).sort((a, b) => b.blockedAt.localeCompare(a.blockedAt)),

  addLocal: async (entry) => {
    const next = {
      ...get().byId,
      [entry.blockedId]: {
        blockedId: entry.blockedId,
        displayName: entry.displayName ?? null,
        reason: entry.reason ?? null,
        blockedAt: entry.blockedAt ?? new Date().toISOString(),
      },
    };
    set({ byId: next });
    await persist(next);
  },

  removeLocal: async (blockedId) => {
    const next = { ...get().byId };
    delete next[blockedId];
    set({ byId: next });
    await persist(next);
  },

  replaceAll: async (entries) => {
    const next: Record<string, BlockedEntry> = {};
    for (const e of entries) next[e.blockedId] = e;
    set({ byId: next, hydrated: true });
    await persist(next);
  },

  reset: () => set({ byId: {}, hidden: {}, hydrated: false }),
}));

/** Everyone who must not appear anywhere: my blocks + people who blocked me. */
export function useHiddenUserMap(): Record<string, unknown> {
  const byId = useBlocksStore((s) => s.byId);
  const hidden = useBlocksStore((s) => s.hidden);
  return useMemo(() => ({ ...hidden, ...byId }), [byId, hidden]);
}

/** Filter helper for discovery / dates / chats. */
export function excludeBlockedIds<T extends { userId?: string; id?: string; partnerId?: string }>(
  rows: T[],
  getId: (row: T) => string | undefined = (row) => row.userId ?? row.partnerId ?? row.id,
): T[] {
  const { byId, hidden } = useBlocksStore.getState();
  return rows.filter((row) => {
    const id = getId(row);
    return !id || (!byId[id] && !hidden[id]);
  });
}
