import { missingStepKeys } from '@/features/profile/completionSteps';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import type { ProfileCompletionRequirements } from '@/types';
import { completionPercent, isProfileReadyForLive, missingLiveRequirements } from '@/utils/profileCompletion';
import { isAtLeast18 } from '@/utils/time';
import { useMemo } from 'react';

function ageSatisfied(
  completionAge: boolean | undefined,
  dateOfBirth: string | null | undefined,
): boolean {
  if (completionAge) return true;
  if (!dateOfBirth) return false;
  try {
    return isAtLeast18(dateOfBirth);
  } catch {
    return false;
  }
}

function deriveRequirements(): ProfileCompletionRequirements {
  const profile = useSessionStore.getState().profile;
  const preferences = useSessionStore.getState().preferences;
  const locationGranted = useSessionStore.getState().locationGranted;
  const draft = useOnboardingDraft.getState();
  const completion = profile?.profileCompletion ?? {};

  return {
    name: Boolean(profile?.displayName?.trim()) || Boolean(completion.name),
    age: ageSatisfied(completion.age, profile?.dateOfBirth ?? draft.dateOfBirth),
    gender: Boolean(profile?.genderId) || Boolean(completion.gender),
    preference: Boolean(preferences?.interestedIn) || Boolean(completion.preference),
    mainPhoto: Boolean(profile?.mainPhotoUrl) || Boolean(completion.mainPhoto),
    videos:
      Boolean(completion.videos) ||
      Boolean(profile?.aboutVideoUrl && profile?.tonightVideoUrl),
    location: locationGranted || Boolean(completion.location),
  };
}

export function useProfileCompletion() {
  const profile = useSessionStore((s) => s.profile);
  const preferences = useSessionStore((s) => s.preferences);
  const locationGranted = useSessionStore((s) => s.locationGranted);
  const draftDob = useOnboardingDraft((s) => s.dateOfBirth);

  const requirements = useMemo((): ProfileCompletionRequirements => {
    const completion = profile?.profileCompletion ?? {};
    return {
      name: Boolean(profile?.displayName?.trim()) || Boolean(completion.name),
      gender: Boolean(profile?.genderId) || Boolean(completion.gender),
      age: ageSatisfied(completion.age, profile?.dateOfBirth ?? draftDob),
      preference: Boolean(preferences?.interestedIn) || Boolean(completion.preference),
      mainPhoto: Boolean(profile?.mainPhotoUrl) || Boolean(completion.mainPhoto),
      videos:
        Boolean(completion.videos) ||
        Boolean(profile?.aboutVideoUrl && profile?.tonightVideoUrl),
      location: locationGranted || Boolean(completion.location),
    };
  }, [profile, preferences, locationGranted, draftDob]);

  return {
    requirements,
    percent: completionPercent(requirements),
    missing: missingLiveRequirements(requirements),
    missingKeys: missingStepKeys(requirements),
    readyForLive: isProfileReadyForLive(requirements),
  };
}

/** Non-hook snapshot for tests / services. */
export function getProfileCompletionFromStore(): ProfileCompletionRequirements {
  return deriveRequirements();
}
