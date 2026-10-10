import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { isBackendConfigured } from '@/lib/env';
import { getDb } from '@/lib/firebase/client';
import { AGE_BOUNDS, useDiscoverFilters } from '@/store/discoverFilters';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';

/** 18–99 means "any age". */
export const ANY_MIN_AGE = 18;
export const ANY_MAX_AGE = 99;

/** Discover keeps a device copy of the account age range; null = no limit on that end. */
export function ageFilterFor(minAge: number | null | undefined, maxAge: number | null | undefined) {
  return {
    ageMin: minAge != null && minAge > ANY_MIN_AGE ? minAge : null,
    ageMax: maxAge != null && maxAge < ANY_MAX_AGE ? maxAge : null,
  };
}

/** The slider tops out at 70, which means "70 and up". */
export function sliderToAgeRange(low: number, high: number): { minAge: number; maxAge: number } {
  return {
    minAge: Math.max(ANY_MIN_AGE, low),
    maxAge: high >= AGE_BOUNDS.max ? ANY_MAX_AGE : high,
  };
}

export function syncDiscoverAge(minAge: number | null | undefined, maxAge: number | null | undefined) {
  useDiscoverFilters.getState().patch(ageFilterFor(minAge, maxAge));
}

/** The account's age range is the one source of truth: Settings, Filters and sign-up all write here. */
export async function saveAgeRange(minAge: number, maxAge: number): Promise<void> {
  const session = useSessionStore.getState();
  if (session.preferences) session.setPreferences({ ...session.preferences, minAge, maxAge });
  useOnboardingDraft.getState().setAgeRange(minAge, maxAge);
  syncDiscoverAge(minAge, maxAge);
  if (!isBackendConfigured() || !session.userId) return;
  await setDoc(
    doc(getDb(), 'users', session.userId),
    { minAge, maxAge, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
