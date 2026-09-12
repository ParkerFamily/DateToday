import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseAuth, getDb, getFirebaseStorage } from '@/lib/firebase/client';
import { assertFirebaseConfigured } from '@/lib/env';
import type { OnboardingDraft } from '@/store/onboardingDraft';
import type { DatingPreferences, Profile } from '@/types';
import { getPromptById, TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';
import { isAtLeast18 } from '@/utils/time';

const DEV_SKIP = 'datetoday://dev-skip-video';

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
  | 'aboutPromptId'
  | 'aboutVideoUri'
  | 'tonightVideoUri'
  | 'mainPhotoUri'
  | 'bio'
  | 'locationEnabled'
  | 'notificationsEnabled'
  | 'verificationStatus'
  | 'personaInquiryId'
  | 'legalConsentAccepted'
>;

function isUploadableUri(uri: string | null | undefined): uri is string {
  if (!uri) return false;
  if (uri === DEV_SKIP) return false;
  if (uri.startsWith('datetoday://')) return false;
  return (
    uri.startsWith('file:') ||
    uri.startsWith('content:') ||
    uri.startsWith('ph:') ||
    uri.startsWith('assets-library:') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  );
}

async function uploadUserMedia(
  uid: string,
  localUri: string,
  pathSuffix: string,
  contentType: string,
): Promise<string> {
  // Remote URLs already hosted — keep as-is.
  if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
    return localUri;
  }

  const storage = getFirebaseStorage();
  const objectRef = ref(storage, `users/${uid}/${pathSuffix}`);
  const response = await fetch(localUri);
  const blob = await response.blob();
  await uploadBytes(objectRef, blob, { contentType });
  return getDownloadURL(objectRef);
}

export type SavedOnboarding = {
  profile: Profile;
  preferences: DatingPreferences;
  firestorePath: string;
  dateOfBirth?: string | null;
  privacyControls?: {
    showInDiscovery?: boolean;
    hideDistance?: boolean;
    pauseDiscovery?: boolean;
    showIntentions?: boolean;
  } | null;
  hasLegalConsent?: boolean;
};

/**
 * Persist full onboarding draft to Firestore (+ Storage for photo/videos).
 * Shape: users/{uid} with nested profile + preferences fields.
 */
export async function saveOnboardingProfile(draft: DraftSnapshot): Promise<SavedOnboarding> {
  assertFirebaseConfigured();
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in before saving your profile.');
  }

  let mainPhotoUrl = draft.mainPhotoUri;
  let aboutVideoUrl = draft.aboutVideoUri;
  let tonightVideoUrl = draft.tonightVideoUri;

  try {
    if (isUploadableUri(draft.mainPhotoUri)) {
      mainPhotoUrl = await uploadUserMedia(uid, draft.mainPhotoUri, 'photo.jpg', 'image/jpeg');
    }
  } catch {
    // Keep local URI if upload fails (e.g. Storage rules not set yet).
    mainPhotoUrl = draft.mainPhotoUri;
  }

  try {
    if (isUploadableUri(draft.aboutVideoUri)) {
      aboutVideoUrl = await uploadUserMedia(
        uid,
        draft.aboutVideoUri,
        'videos/about.mp4',
        'video/mp4',
      );
    }
  } catch {
    aboutVideoUrl = draft.aboutVideoUri;
  }

  try {
    if (isUploadableUri(draft.tonightVideoUri)) {
      tonightVideoUrl = await uploadUserMedia(
        uid,
        draft.tonightVideoUri,
        'videos/tonight.mp4',
        'video/mp4',
      );
    }
  } catch {
    tonightVideoUrl = draft.tonightVideoUri;
  }

  const aboutPrompt = draft.aboutPromptId ? getPromptById(draft.aboutPromptId) : undefined;
  const nowIso = new Date().toISOString();
  const firebaseUser = auth.currentUser;

  // Prefer draft; fall back to Firebase Auth provider for Google/Apple.
  const providerIds = firebaseUser?.providerData.map((p) => p.providerId) ?? [];
  const resolvedAuthProvider: 'google' | 'apple' | 'email' | null =
    draft.authProvider ??
    (providerIds.includes('google.com')
      ? 'google'
      : providerIds.includes('apple.com')
        ? 'apple'
        : providerIds.includes('password')
          ? 'email'
          : null);

  // If they never uploaded a photo, keep Google/Apple avatar when present.
  if (
    (!mainPhotoUrl || mainPhotoUrl === DEV_SKIP) &&
    firebaseUser?.photoURL &&
    (resolvedAuthProvider === 'google' || resolvedAuthProvider === 'apple')
  ) {
    mainPhotoUrl = firebaseUser.photoURL;
  }

  const profileCompletion = {
    onboardingComplete: true,
    name: draft.displayName.trim().length >= 2,
    age: Boolean(draft.dateOfBirth) && isAtLeast18(draft.dateOfBirth),
    gender: Boolean(draft.gender),
    preference: Boolean(draft.interestedIn),
    vibes: draft.vibes.length >= 1,
    mainPhoto: Boolean(mainPhotoUrl && mainPhotoUrl !== DEV_SKIP),
    videos: Boolean(aboutVideoUrl && tonightVideoUrl),
    location: draft.locationEnabled,
    verification: draft.verificationStatus === 'verified',
    communityStandards: Boolean(draft.legalConsentAccepted),
  };

  const payload = {
    email: draft.email.trim() || firebaseUser?.email || null,
    authProvider: resolvedAuthProvider,
    provider: resolvedAuthProvider,
    providerIds,
    photoURL: firebaseUser?.photoURL ?? null,
    dateOfBirth: draft.dateOfBirth || null,
    ageConfirmed: true,

    displayName: draft.displayName.trim() || firebaseUser?.displayName || 'You',
    bio: draft.bio?.trim() || null,
    gender: draft.gender,
    vibes: draft.vibes,
    datingIntention: draft.vibes[0] ?? null,

    mainPhotoUrl: mainPhotoUrl && mainPhotoUrl !== DEV_SKIP ? mainPhotoUrl : null,
    aboutPromptId: draft.aboutPromptId,
    aboutPromptText: aboutPrompt?.text ?? null,
    aboutVideoUrl: aboutVideoUrl && aboutVideoUrl !== DEV_SKIP ? aboutVideoUrl : null,
    tonightPromptId: TONIGHT_SIGNATURE_PROMPT.id,
    tonightPromptText: TONIGHT_SIGNATURE_PROMPT.text,
    tonightVideoUrl: tonightVideoUrl && tonightVideoUrl !== DEV_SKIP ? tonightVideoUrl : null,

    interestedIn: draft.interestedIn ?? 'everyone',
    minAge: draft.minAge,
    maxAge: draft.maxAge,
    maxDistanceMiles: draft.radiusMiles,

    locationEnabled: draft.locationEnabled,
    notificationsEnabled: draft.notificationsEnabled,

    // Keep server-confirmed verified; otherwise persist draft (pending/unverified/failed).
    verificationStatus:
      draft.verificationStatus === 'verified'
        ? 'verified'
        : draft.verificationStatus || 'unverified',
    personaInquiryId: draft.personaInquiryId,

    onboardingComplete: true,
    onboardingCompletedAt: serverTimestamp(),
    profileCompletion,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  const userRef = doc(getDb(), 'users', uid);
  await setDoc(userRef, payload, { merge: true });

  // Public discovery slice — no DOB/email/coords; verification only if already trusted server-side.
  await setDoc(
    doc(getDb(), 'profiles', uid),
    {
      userId: uid,
      displayName: payload.displayName,
      bio: payload.bio,
      gender: payload.gender,
      vibes: payload.vibes,
      datingIntention: payload.datingIntention,
      mainPhotoUrl: payload.mainPhotoUrl,
      aboutPromptText: payload.aboutPromptText,
      aboutVideoUrl: payload.aboutVideoUrl,
      tonightPromptText: payload.tonightPromptText,
      tonightVideoUrl: payload.tonightVideoUrl,
      verificationStatus: payload.verificationStatus,
      // Preferences stay on private users/{uid} — not public profiles.
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  const profile: Profile = {
    userId: uid,
    displayName: payload.displayName,
    bio: payload.bio,
    dateOfBirth: draft.dateOfBirth || null,
    genderId: payload.gender,
    datingIntention: payload.datingIntention,
    heightCm: null,
    occupation: null,
    school: null,
    hometown: null,
    neighborhoodLabel: null,
    zodiac: null,
    verificationStatus: payload.verificationStatus as Profile['verificationStatus'],
    mainPhotoUrl: payload.mainPhotoUrl,
    photoUrls: payload.mainPhotoUrl ? [payload.mainPhotoUrl] : [],
    aboutPromptId: draft.aboutPromptId,
    aboutPromptText: aboutPrompt?.text ?? null,
    aboutVideoUrl: payload.aboutVideoUrl,
    tonightPromptId: TONIGHT_SIGNATURE_PROMPT.id,
    tonightPromptText: TONIGHT_SIGNATURE_PROMPT.text,
    tonightVideoUrl: payload.tonightVideoUrl,
    profileCompletion,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const preferences: DatingPreferences = {
    userId: uid,
    interestedIn: payload.interestedIn,
    minAge: payload.minAge,
    maxAge: payload.maxAge,
    maxDistanceMiles: payload.maxDistanceMiles,
    intentions: draft.vibes,
  };

  return { profile, preferences, firestorePath: `users/${uid}`, dateOfBirth: draft.dateOfBirth || null };
}
export async function loadUserProfile(uid: string): Promise<SavedOnboarding | null> {
  assertFirebaseConfigured();
  const snap = await getDoc(doc(getDb(), 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();

  const storedCompletion = (d.profileCompletion as Record<string, boolean>) ?? {};
  const dateOfBirth = typeof d.dateOfBirth === 'string' ? d.dateOfBirth : null;
  let ageConfirmed =
    d.ageConfirmed === true || Boolean(storedCompletion.age);
  if (!ageConfirmed && dateOfBirth) {
    try {
      ageConfirmed = isAtLeast18(dateOfBirth);
    } catch {
      ageConfirmed = false;
    }
  }

  const profileCompletion: Record<string, boolean> = {
    ...storedCompletion,
    ...(d.onboardingComplete === true ? { onboardingComplete: true } : {}),
    ...(d.setupSkipped === true ? { setupSkipped: true } : {}),
    ...(ageConfirmed ? { age: true } : {}),
  };

  const profile: Profile = {
    userId: uid,
    displayName: String(d.displayName ?? 'You'),
    bio: (d.bio as string | null) ?? null,
    dateOfBirth,
    genderId: (d.gender as string | null) ?? null,
    datingIntention: (d.datingIntention as Profile['datingIntention']) ?? null,
    heightCm: typeof d.heightCm === 'number' ? d.heightCm : null,
    occupation: (d.occupation as string | null) ?? null,
    school: (d.school as string | null) ?? null,
    hometown: (d.hometown as string | null) ?? null,
    neighborhoodLabel: (d.neighborhoodLabel as string | null) ?? null,
    zodiac: (d.zodiac as string | null) ?? null,
    pronouns: (d.pronouns as string | null) ?? null,
    drinking: (d.drinking as string | null) ?? null,
    smoking: (d.smoking as string | null) ?? null,
    interests: Array.isArray(d.interests) ? (d.interests as string[]) : null,
    foodPreference: (d.foodPreference as string | null) ?? null,
    verificationStatus: (d.verificationStatus as Profile['verificationStatus']) ?? 'unverified',
    mainPhotoUrl:
      (d.mainPhotoUrl as string | null) ??
      (typeof d.photoURL === 'string' && d.photoURL ? d.photoURL : null) ??
      null,
    photoUrls: (() => {
      const fromArray = Array.isArray(d.photoUrls)
        ? (d.photoUrls as unknown[]).filter((u): u is string => typeof u === 'string' && u.length > 0)
        : [];
      if (fromArray.length) return fromArray.slice(0, 3);
      const main =
        (d.mainPhotoUrl as string | null) ??
        (typeof d.photoURL === 'string' && d.photoURL ? d.photoURL : null);
      return main ? [main] : [];
    })(),
    aboutPromptId: (d.aboutPromptId as string | null) ?? null,
    aboutPromptText: (d.aboutPromptText as string | null) ?? null,
    aboutVideoUrl: (d.aboutVideoUrl as string | null) ?? null,
    tonightPromptId: (d.tonightPromptId as string | null) ?? null,
    tonightPromptText: (d.tonightPromptText as string | null) ?? null,
    tonightVideoUrl: (d.tonightVideoUrl as string | null) ?? null,
    profileCompletion,
    createdAt: nowOrString(d.createdAt),
    updatedAt: nowOrString(d.updatedAt),
  };

  const preferences: DatingPreferences = {
    userId: uid,
    interestedIn: (d.interestedIn as DatingPreferences['interestedIn']) ?? 'everyone',
    minAge: Number(d.minAge ?? 18),
    maxAge: Number(d.maxAge ?? 99),
    maxDistanceMiles: Number(d.maxDistanceMiles ?? 25),
    intentions: (d.vibes as DatingPreferences['intentions']) ?? [],
  };

  return {
    profile,
    preferences,
    firestorePath: `users/${uid}`,
    dateOfBirth,
    privacyControls: (d.privacyControls as SavedOnboarding['privacyControls']) ?? null,
    hasLegalConsent: Boolean(
      (d.consent as { acceptedAt?: string } | undefined)?.acceptedAt ||
        d.communityStandardsAcceptedAt ||
        storedCompletion.communityStandards ||
        d.termsVersion,
    ),
  };
}

function nowOrString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value) {
    try {
      // Firestore Timestamp
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      /* fall through */
    }
  }
  return new Date().toISOString();
}
