import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { assertFirebaseConfigured } from '@/lib/env';
import type { OnboardingDraft } from '@/store/onboardingDraft';
import type { DatingPreferences, Profile } from '@/types';
import { isAtLeast18 } from '@/utils/time';

type DraftSnapshot = Pick<
  OnboardingDraft,
  | 'displayName'
  | 'dateOfBirth'
  | 'email'
  | 'authProvider'
  | 'gender'
  | 'interestedIn'
  | 'vibes'
  | 'minAge'
  | 'maxAge'
  | 'radiusMiles'
  | 'mainPhotoUri'
  | 'verificationStatus'
  | 'locationEnabled'
  | 'legalConsentAccepted'
>;

/**
 * Enter the app early without finishing setup.
 * Limits: Go Live / Ping stay locked until name, age, gender, preference, photo, videos, location.
 */
export async function skipSetupToApp(draft: DraftSnapshot): Promise<{
  profile: Profile;
  preferences: DatingPreferences;
}> {
  const name = draft.displayName.trim();
  if (name.length < 2) {
    throw new Error('Add your name first — it must match your government ID.');
  }

  assertFirebaseConfigured();
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in before continuing.');

  const providerIds =
    getFirebaseAuth().currentUser?.providerData.map((p) => p.providerId) ?? [];
  const authProvider =
    draft.authProvider ??
    (providerIds.includes('google.com')
      ? 'google'
      : providerIds.includes('apple.com')
        ? 'apple'
        : null);

  const profileCompletion = {
    onboardingComplete: false,
    setupSkipped: true,
    name: true,
    age: Boolean(draft.dateOfBirth) && isAtLeast18(draft.dateOfBirth),
    gender: Boolean(draft.gender),
    preference: Boolean(draft.interestedIn),
    vibes: draft.vibes.length >= 1,
    mainPhoto: Boolean(draft.mainPhotoUri),
    videos: false,
    location: draft.locationEnabled,
    communityStandards: Boolean(draft.legalConsentAccepted),
  };

  const nowIso = new Date().toISOString();
  const payload = {
    email: draft.email.trim() || getFirebaseAuth().currentUser?.email || null,
    authProvider,
    provider: authProvider,
    providerIds,
    displayName: name,
    dateOfBirth: draft.dateOfBirth || null,
    gender: draft.gender,
    vibes: draft.vibes,
    datingIntention: draft.vibes[0] ?? null,
    interestedIn: draft.interestedIn ?? 'everyone',
    minAge: draft.minAge,
    maxAge: draft.maxAge,
    maxDistanceMiles: draft.radiusMiles,
    mainPhotoUrl: draft.mainPhotoUri,
    verificationStatus: draft.verificationStatus || 'unverified',
    locationEnabled: draft.locationEnabled,
    setupSkipped: true,
    onboardingComplete: false,
    profileCompletion,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(getDb(), 'users', uid), payload, { merge: true });
  await setDoc(
    doc(getDb(), 'profiles', uid),
    {
      userId: uid,
      displayName: name,
      gender: draft.gender,
      vibes: draft.vibes,
      mainPhotoUrl: draft.mainPhotoUri,
      verificationStatus: payload.verificationStatus,
      setupSkipped: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const profile: Profile = {
    userId: uid,
    displayName: name,
    bio: null,
    dateOfBirth: draft.dateOfBirth || null,
    genderId: draft.gender,
    datingIntention: draft.vibes[0] ?? null,
    heightCm: null,
    occupation: null,
    school: null,
    hometown: null,
    neighborhoodLabel: null,
    zodiac: null,
    verificationStatus: payload.verificationStatus,
    mainPhotoUrl: draft.mainPhotoUri,
    profileCompletion,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const preferences: DatingPreferences = {
    userId: uid,
    interestedIn: draft.interestedIn ?? 'everyone',
    minAge: draft.minAge,
    maxAge: draft.maxAge,
    maxDistanceMiles: draft.radiusMiles,
    intentions: draft.vibes,
  };

  return { profile, preferences };
}
