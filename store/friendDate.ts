import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { analytics } from '@/lib/analytics';
import { useSessionStore } from '@/store/session';
import type { LiveMode } from '@/types';
import { isLiveSessionActive } from '@/utils/time';

const keyFor = (uid: string) => `dt.liveMode.${uid}`;

type State = {
  uid: string | null;
  /** The mode picked on this device (per account). While Live, the session's own mode wins. */
  mode: LiveMode;
  hydrate: (uid: string | null) => Promise<void>;
  setMode: (mode: LiveMode) => void;
};

export const useFriendDateMode = create<State>((set, get) => ({
  uid: null,
  mode: 'dating',
  hydrate: async (uid) => {
    if (!uid) {
      set({ uid: null, mode: 'dating' });
      return;
    }
    if (get().uid === uid) return;
    set({ uid, mode: 'dating' });
    const raw = await AsyncStorage.getItem(keyFor(uid)).catch(() => null);
    if (get().uid !== uid) return;
    set({ mode: raw === 'friend' ? 'friend' : 'dating' });
  },
  setMode: (mode) => {
    if (mode === get().mode) return;
    set({ mode });
    if (mode === 'friend') analytics.track('friend_date_mode_opened');
    const uid = get().uid;
    if (uid) void AsyncStorage.setItem(keyFor(uid), mode).catch(() => undefined);
  },
}));

/** The discovery stack being shown: the Live session's mode while Live, otherwise the picked mode. */
export function useFeedMode(): LiveMode {
  const picked = useFriendDateMode((s) => s.mode);
  const liveMode = useSessionStore((s) =>
    s.liveSession && isLiveSessionActive(s.liveSession, new Date()) ? (s.liveSession.mode ?? 'dating') : null,
  );
  return liveMode ?? picked;
}
