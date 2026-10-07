import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { cleanTrip, usableTrip } from '@/features/travel/trip';
import type { TravelTrip } from '@/types';

const keyFor = (uid: string) => `dt.travelTrip.${uid}`;

type State = {
  uid: string | null;
  trip: TravelTrip | null;
  hydrate: (uid: string | null) => Promise<void>;
  setTrip: (trip: TravelTrip | null) => Promise<void>;
};

/** The Travel Mode trip you've set up on this device (per account). Applied only with DateToday+. */
export const useTravelMode = create<State>((set, get) => ({
  uid: null,
  trip: null,
  hydrate: async (uid) => {
    if (!uid) {
      set({ uid: null, trip: null });
      return;
    }
    if (get().uid === uid) return;
    set({ uid, trip: null });
    const raw = await AsyncStorage.getItem(keyFor(uid)).catch(() => null);
    let trip: TravelTrip | null = null;
    try {
      trip = usableTrip(cleanTrip(raw ? JSON.parse(raw) : null));
    } catch {
      trip = null;
    }
    if (get().uid !== uid) return;
    set({ trip });
    if (raw && !trip) await AsyncStorage.removeItem(keyFor(uid)).catch(() => undefined);
  },
  setTrip: async (trip) => {
    set({ trip });
    const uid = get().uid;
    if (!uid) return;
    if (trip) await AsyncStorage.setItem(keyFor(uid), JSON.stringify(trip)).catch(() => undefined);
    else await AsyncStorage.removeItem(keyFor(uid)).catch(() => undefined);
  },
}));
