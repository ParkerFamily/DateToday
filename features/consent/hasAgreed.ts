import { doc, setDoc } from 'firebase/firestore';
import { recordLegalConsent } from '@/features/consent/recordConsent';
import { getDb } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import type { Profile } from '@/types';

/** Terms / Privacy / Guidelines are an account gate, not a profile step. */
export function hasAgreedToTerms(profile: Profile | null, draftAccepted: boolean): boolean {
  return draftAccepted || Boolean(profile?.profileCompletion?.communityStandards);
}

/** Saves consent for an account that is already signed in (e.g. created before consent was recorded). */
export async function acceptTermsForAccount(): Promise<void> {
  useOnboardingDraft.getState().acceptLegalConsent();
  const { profile, setProfile } = useSessionStore.getState();
  if (profile) {
    setProfile({
      ...profile,
      profileCompletion: { ...profile.profileCompletion, communityStandards: true },
    });
  }
  if (!isBackendConfigured()) return;
  await recordLegalConsent('reconsent');
  const uid = useSessionStore.getState().userId;
  if (uid) {
    await setDoc(doc(getDb(), 'users', uid), { profileCompletion: { communityStandards: true } }, { merge: true });
  }
}
