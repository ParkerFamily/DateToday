import { create } from 'zustand';
import type { LiveSession, Profile, DatingPreferences } from '@/types';
import type { EntitlementState } from '@/lib/entitlements';
import { DEFAULT_ENTITLEMENTS } from '@/lib/entitlements';

export type ProfileHydration = 'idle' | 'loading' | 'done';

interface SessionState {
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  /** Prevents AuthGate from dumping returning users into onboarding mid-fetch. */
  profileHydration: ProfileHydration;
  preferences: DatingPreferences | null;
  liveSession: LiveSession | null;
  entitlements: EntitlementState;
  locationGranted: boolean;
  notificationsAsked: boolean;
  onboardingStep: number;
  /** Someone marked interest while user is on another tab */
  discoverAttention: boolean;
  /** After accepting a plan — optionally pause Discover */
  discoveryPaused: boolean;
  /** Soft Live badge when a tonight plan is locked */
  datePlannedTonight: boolean;
  /** Ping feed size while Live — Discover is the result of Pinging */
  pingResultCount: number;
  /** Unseen people who entered the Ping since last Discover open */
  newInPing: number;
  setAuth: (userId: string | null, email: string | null) => void;
  setProfileHydration: (profileHydration: ProfileHydration) => void;
  setProfile: (profile: Profile | null) => void;
  setPreferences: (preferences: DatingPreferences | null) => void;
  setLiveSession: (session: LiveSession | null) => void;
  setEntitlements: (entitlements: EntitlementState) => void;
  setLocationGranted: (granted: boolean) => void;
  setNotificationsAsked: (asked: boolean) => void;
  setOnboardingStep: (step: number) => void;
  setDiscoverAttention: (discoverAttention: boolean) => void;
  setDiscoveryPaused: (discoveryPaused: boolean) => void;
  setDatePlannedTonight: (datePlannedTonight: boolean) => void;
  setPingResults: (pingResultCount: number, newInPing?: number) => void;
  clearNewInPing: () => void;
  reset: () => void;
}

const initial = {
  userId: null as string | null,
  email: null as string | null,
  profile: null as Profile | null,
  profileHydration: 'idle' as ProfileHydration,
  preferences: null as DatingPreferences | null,
  liveSession: null as LiveSession | null,
  entitlements: DEFAULT_ENTITLEMENTS,
  locationGranted: false,
  notificationsAsked: false,
  onboardingStep: 0,
  discoverAttention: false,
  discoveryPaused: false,
  datePlannedTonight: false,
  pingResultCount: 0,
  newInPing: 0,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,
  setAuth: (userId, email) =>
    set((s) => {
      // Same signed-in user (token refresh) — keep loaded profile.
      if (userId && userId === s.userId) return { userId, email };
      // Sign-out — drop everything.
      if (!userId) {
        return {
          ...initial,
          userId: null,
          email: null,
          profileHydration: 'idle',
        };
      }
      // Different account sign-in — reset state but mark as loading so
      // AuthGate waits for hydration before routing decisions.
      return {
        ...initial,
        userId,
        email,
        profileHydration: 'loading',
      };
    }),
  setProfileHydration: (profileHydration) => set({ profileHydration }),
  setProfile: (profile) => 
    set((s) => {
      // Defensive: don't clear a valid profile unless explicitly setting to null for a different user
      if (!profile && s.profile && s.userId) {
        console.warn('[DateToday] Attempted to clear profile while user is signed in');
        return s;
      }
      return { profile };
    }),
  setPreferences: (preferences) => set({ preferences }),
  setLiveSession: (liveSession) => set({ liveSession }),
  setEntitlements: (entitlements) => set({ entitlements }),
  setLocationGranted: (locationGranted) => set({ locationGranted }),
  setNotificationsAsked: (notificationsAsked) => set({ notificationsAsked }),
  setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
  setDiscoverAttention: (discoverAttention) => set({ discoverAttention }),
  setDiscoveryPaused: (discoveryPaused) => set({ discoveryPaused }),
  setDatePlannedTonight: (datePlannedTonight) => set({ datePlannedTonight }),
  setPingResults: (pingResultCount, newInPing) =>
    set((s) => ({
      pingResultCount,
      ...(typeof newInPing === 'number' ? { newInPing } : {}),
    })),
  clearNewInPing: () => set({ newInPing: 0 }),
  reset: () => set({ ...initial }),
}));
