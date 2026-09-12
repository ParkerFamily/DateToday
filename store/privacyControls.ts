import { create } from 'zustand';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';

/**
 * Privacy controls that DateToday can actually honor today.
 * Do not add toggles here that the backend cannot enforce.
 */
export type PrivacyControls = {
  /** When false, you should not appear in discovery/live pools. */
  showInDiscovery: boolean;
  /** Prefer showing neighborhood / hidden distance instead of miles. */
  hideDistance: boolean;
  /** Soft pause (also mirrored in session.discoveryPaused). */
  pauseDiscovery: boolean;
  /** Show dating intentions/vibes on public profile. */
  showIntentions: boolean;
};

const DEFAULTS: PrivacyControls = {
  showInDiscovery: true,
  hideDistance: false,
  pauseDiscovery: false,
  showIntentions: true,
};

type State = PrivacyControls & {
  hydrated: boolean;
  setControls: (patch: Partial<PrivacyControls>) => Promise<void>;
  hydrate: (controls?: Partial<PrivacyControls> | null) => void;
  reset: () => void;
};

async function persist(controls: PrivacyControls) {
  if (!isBackendConfigured()) return;
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  await setDoc(
    doc(getDb(), 'users', uid),
    {
      privacyControls: controls,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export const usePrivacyControls = create<State>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: (controls) =>
    set({
      ...DEFAULTS,
      ...controls,
      hydrated: true,
    }),
  setControls: async (patch) => {
    const next = { ...get(), ...patch };
    const controls: PrivacyControls = {
      showInDiscovery: next.showInDiscovery,
      hideDistance: next.hideDistance,
      pauseDiscovery: next.pauseDiscovery,
      showIntentions: next.showIntentions,
    };
    set({ ...controls });
    await persist(controls);
  },
  reset: () => set({ ...DEFAULTS, hydrated: false }),
}));
