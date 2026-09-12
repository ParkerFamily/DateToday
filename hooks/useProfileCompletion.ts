import { useMemo } from 'react';
import type { ProfileCompletionRequirements } from '@/types';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { completionPercent, isProfileReadyForLive, missingLiveRequirements } from '@/utils/profileCompletion';
import { isAtLeast18 } from '@/utils/time';

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
    communityStandards:
      Boolean(completion.communityStandards) ||
      Boolean(draft.legalConsentAccepted) ||
      Boolean(completion.onboardingComplete),
  };
}

export function useProfileCompletion() {
  const profile = useSessionStore((s) => s.profile);
  const preferences = useSessionStore((s) => s.preferences);
  const locationGranted = useSessionStore((s) => s.locationGranted);
  const draftDob = useOnboardingDraft((s) => s.dateOfBirth);
  const legalConsentAccepted = useOnboardingDraft((s) => s.legalConsentAccepted);

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
      communityStandards:
        Boolean(completion.communityStandards) ||
        Boolean(legalConsentAccepted) ||
        Boolean(completion.onboardingComplete),
    };
  }, [profile, preferences, locationGranted, draftDob, legalConsentAccepted]);

  return {
    requirements,
    percent: completionPercent(requirements),
    missing: missingLiveRequirements(requirements),
    readyForLive: isProfileReadyForLive(requirements),
  };
}

/** Non-hook snapshot for tests / services. */
export function getProfileCompletionFromStore(): ProfileCompletionRequirements {
  return deriveRequirements();
}
