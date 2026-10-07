import { getPromptById, TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';
import { assertFirebaseConfigured } from '@/lib/env';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import {
  describeUploadError,
  remoteMediaUrlOrNull,
  uploadLocalMedia,
} from '@/lib/firebase/uploadLocalMedia';
import { firstName, type OnboardingDraft } from '@/store/onboardingDraft';
import type { DatingPreferences, Profile } from '@/types';
import { isAtLeast18 } from '@/utils/time';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

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
> &
  Partial<Pick<OnboardingDraft, 'interests' | 'legalName'>>;

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
  return uploadLocalMedia(`users/${uid}/${pathSuffix}`, localUri, contentType);
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

export type FailedUpload = 'photo' | 'About You video' | 'Tonight video';

/**
 * Thrown before any Firestore write when selected media did not finish uploading.
 * `uploaded` holds download URLs that did complete, so a retry can skip re-uploading them.
 */
export class MediaUploadError extends Error {
  readonly failed: FailedUpload[];
  readonly detail: string;
  readonly uploaded: {
    mainPhotoUrl?: string;
    aboutVideoUrl?: string;
    tonightVideoUrl?: string;
  };

  constructor(failed: FailedUpload[], detail: string, uploaded: MediaUploadError['uploaded']) {
    super(`${failed.join(' and ')} upload failed`);
    this.name = 'MediaUploadError';
    this.failed = failed;
    this.detail = detail;
    this.uploaded = uploaded;
  }
}

export function isMediaUploadError(error: unknown): error is MediaUploadError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'MediaUploadError' &&
    Array.isArray((error as { failed?: unknown }).failed)
  );
}

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

  let mainPhotoUrl: string | null = remoteMediaUrlOrNull(draft.mainPhotoUri);
  let aboutVideoUrl: string | null = remoteMediaUrlOrNull(draft.aboutVideoUri);
  let tonightVideoUrl: string | null = remoteMediaUrlOrNull(draft.tonightVideoUri);
  const failed: FailedUpload[] = [];
  const uploaded: MediaUploadError['uploaded'] = {};
  let firstError: unknown = null;

  // Every selected file must finish uploading before anything is written to Firestore,
  // so a failed upload can never leave the profile saved with missing / local media.
  const tryUpload = async (
    what: FailedUpload,
    localUri: string | null,
    pathSuffix: string,
    contentType: string,
  ): Promise<string | null> => {
    if (!isUploadableUri(localUri) || remoteMediaUrlOrNull(localUri)) return null;
    try {
      return await uploadUserMedia(uid, localUri, pathSuffix, contentType);
    } catch (error) {
      console.warn(`[DateToday] ${what} upload failed`, error);
      failed.push(what);
      firstError ??= error;
      return null;
    }
  };

  const photo = await tryUpload('photo', draft.mainPhotoUri, 'photo.jpg', 'image/jpeg');
  if (photo) mainPhotoUrl = uploaded.mainPhotoUrl = photo;
  const about = await tryUpload('About You video', draft.aboutVideoUri, 'videos/about.mp4', 'video/mp4');
  if (about) aboutVideoUrl = uploaded.aboutVideoUrl = about;
  const tonight = await tryUpload('Tonight video', draft.tonightVideoUri, 'videos/tonight.mp4', 'video/mp4');
  if (tonight) tonightVideoUrl = uploaded.tonightVideoUrl = tonight;

  if (failed.length) {
    throw new MediaUploadError(failed, describeUploadError(firstError), uploaded);
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
    !remoteMediaUrlOrNull(mainPhotoUrl) &&
    firebaseUser?.photoURL &&
    (resolvedAuthProvider === 'google' || resolvedAuthProvider === 'apple')
  ) {
    mainPhotoUrl = firebaseUser.photoURL;
  }

  mainPhotoUrl = remoteMediaUrlOrNull(mainPhotoUrl);
  aboutVideoUrl = remoteMediaUrlOrNull(aboutVideoUrl);
  tonightVideoUrl = remoteMediaUrlOrNull(tonightVideoUrl);

  const aboutOk = Boolean(aboutVideoUrl);
  const tonightOk = Boolean(tonightVideoUrl);

  const profileCompletion = {
    onboardingComplete: true,
    name: (draft.displayName.trim() || firstName(draft.legalName)).length >= 2,
    age: Boolean(draft.dateOfBirth) && isAtLeast18(draft.dateOfBirth),
    gender: Boolean(draft.gender),
    preference: Boolean(draft.interestedIn),
    vibes: draft.vibes.length >= 1,
    mainPhoto: Boolean(mainPhotoUrl),
    videos: aboutOk && tonightOk,
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

    displayName:
      draft.displayName.trim() ||
      firstName(draft.legalName) ||
      firstName(firebaseUser?.displayName) ||
      'You',
    bio: draft.bio?.trim() || null,
    gender: draft.gender,
    vibes: draft.vibes,
    datingIntention: draft.vibes[0] ?? null,
    interests: draft.interests?.length ? draft.interests : null,

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

    // verificationStatus is owned by confirmPersonaVerification; a stale draft must never overwrite it.
    personaInquiryId: draft.personaInquiryId,

    onboardingComplete: true,
    onboardingCompletedAt: serverTimestamp(),
    profileCompletion,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  const userRef = doc(getDb(), 'users', uid);
  await setDoc(userRef, payload, { merge: true });

  // Separate write: rules reject changing a legal name that's already set.
  const legalName = draft.legalName?.trim().slice(0, 80);
  if (legalName) {
    await setDoc(userRef, { legalName }, { merge: true }).catch(() => {});
  }

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
      interests: payload.interests,
      mainPhotoUrl: payload.mainPhotoUrl,
      aboutPromptText: payload.aboutPromptText,
      aboutVideoUrl: payload.aboutVideoUrl,
      tonightPromptText: payload.tonightPromptText,
      tonightVideoUrl: payload.tonightVideoUrl,
      // Preferences stay on private users/{uid} — not public profiles.
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  const profile: Profile = {
    userId: uid,
    displayName: payload.displayName,
    legalName: legalName || null,
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
    interests: payload.interests,
    verificationStatus: draft.verificationStatus || 'unverified',
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
  console.log('[DateToday] Loading profile for user:', uid);
  
  try {
    const snap = await getDoc(doc(getDb(), 'users', uid));
    
    if (!snap.exists()) {
      console.log('[DateToday] No Firestore document found for user:', uid);
      return null;
    }
    
    const d = snap.data();
    console.log('[DateToday] Loaded Firestore data:', {
      displayName: d.displayName,
      verificationStatus: d.verificationStatus,
      mainPhotoUrl: d.mainPhotoUrl ? 'present' : 'missing',
      onboardingComplete: d.onboardingComplete,
    });

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

  const hasLegalConsent = Boolean(
    (d.consent as { acceptedAt?: string } | undefined)?.acceptedAt ||
      d.communityStandardsAcceptedAt ||
      storedCompletion.communityStandards ||
      d.termsVersion,
  );

  const profileCompletion: Record<string, boolean> = {
    ...storedCompletion,
    ...(d.onboardingComplete === true ? { onboardingComplete: true } : {}),
    ...(d.setupSkipped === true ? { setupSkipped: true } : {}),
    ...(ageConfirmed ? { age: true } : {}),
    ...(hasLegalConsent ? { communityStandards: true } : {}),
  };

  const profile: Profile = {
    userId: uid,
    displayName: String(d.displayName ?? 'You'),
    legalName: typeof d.legalName === 'string' && d.legalName.trim() ? d.legalName : null,
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
    exercise: (d.exercise as string | null) ?? null,
    kids: (d.kids as string | null) ?? null,
    pets: (d.pets as string | null) ?? null,
    quizLevel: Number((d.quiz as { level?: unknown } | undefined)?.level) || 0,
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
    hasLegalConsent,
  };
  } catch (error) {
    console.error('[DateToday] Error loading user profile:', error);
    return null;
  }
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
