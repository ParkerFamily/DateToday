import type { Profile } from '@/types';

/**
 * True only after the user has intentionally entered the app:
 * finished onboarding, or tapped "Skip setup" (persisted on the account).
 * Firebase Auth alone / Firestore auth stubs do NOT count.
 */
export function hasEnteredApp(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  const c = profile.profileCompletion ?? {};
  if (c.onboardingComplete || c.setupSkipped) return true;

  // Fallback for older docs that finished setup but missed nested flags:
  // a real profile with name + gender + photo is not an auth stub.
  const looksComplete =
    Boolean(profile.displayName?.trim()) &&
    Boolean(profile.genderId) &&
    Boolean(profile.mainPhotoUrl) &&
    (Boolean(c.age) || Boolean(profile.dateOfBirth));
  if (looksComplete) return true;

  // Partial setup that was clearly past auth stub (gender + prefs/vibes).
  const looksPastStub =
    Boolean(profile.displayName?.trim()) &&
    Boolean(profile.genderId) &&
    (Boolean(profile.datingIntention) || Boolean(c.preference) || Boolean(c.vibes));
  return looksPastStub;
}
