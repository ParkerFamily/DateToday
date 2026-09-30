import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  onAuthStateChanged,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getDb, isFirebaseConfigured } from '@/lib/firebase/client';
import { assertFirebaseConfigured } from '@/lib/env';
import { isAtLeast18 } from '@/utils/time';
import { analytics } from '@/lib/analytics';
import { recordLegalConsent } from '@/features/consent/recordConsent';
import { useOnboardingDraft } from '@/store/onboardingDraft';

export const signUpSchema = z
  .object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    ageConfirmed: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm you are at least 18' }),
    }),
  })
  .superRefine((data, ctx) => {
    if (!isAtLeast18(data.dateOfBirth)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dateOfBirth'],
        message: 'You must be at least 18 years old',
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type AuthSession = {
  user: { id: string; email: string | null };
} | null;

export async function signUpWithEmail(input: SignUpInput) {
  assertFirebaseConfigured();
  analytics.track('signup_started');

  const parsed = signUpSchema.parse(input);
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, parsed.email, parsed.password);

  await updateProfile(cred.user, {
    displayName: parsed.email.split('@')[0],
  });

  // Seed user doc — verification stays honest (unverified until Persona).
  await setDoc(
    doc(getDb(), 'users', cred.user.uid),
    {
      email: parsed.email,
      dateOfBirth: parsed.dateOfBirth,
      ageConfirmed: true,
      authProvider: 'email',
      provider: 'email',
      providerIds: ['password'],
      verificationStatus: 'unverified',
      lastSignInAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  analytics.track('signup_completed');
  if (useOnboardingDraft.getState().legalConsentAccepted) {
    await recordLegalConsent('signup').catch(() => undefined);
  }
  return { user: { id: cred.user.uid, email: cred.user.email } };
}

export async function signInWithEmail(input: LoginInput) {
  assertFirebaseConfigured();
  const parsed = loginSchema.parse(input);
  const cred = await signInWithEmailAndPassword(
    getFirebaseAuth(),
    parsed.email,
    parsed.password,
  );
  await setDoc(
    doc(getDb(), 'users', cred.user.uid),
    {
      email: cred.user.email,
      authProvider: 'email',
      provider: 'email',
      lastSignInAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { user: { id: cred.user.uid, email: cred.user.email } };
}

const SIGNED_OUT_KEY = 'dt.auth.signedOut';

/**
 * Written the instant someone taps Log out, before any slow cleanup. If the app is closed or
 * reloaded mid-logout, startup still sees it and finishes the sign-out instead of restoring.
 */
export async function markSignedOut() {
  await AsyncStorage.setItem(SIGNED_OUT_KEY, '1').catch(() => undefined);
}

/** Only a real sign-in during this run clears the mark — never a restored session. */
export async function clearSignedOutMark() {
  await AsyncStorage.removeItem(SIGNED_OUT_KEY).catch(() => undefined);
}

/** Cleanup must never block sign-out: offline Firestore writes can hang indefinitely. */
async function bestEffort(task: () => Promise<unknown>, ms = 4000) {
  try {
    await Promise.race([task(), new Promise((resolve) => setTimeout(resolve, ms))]);
  } catch {
    /* ignore */
  }
}

export async function signOut() {
  if (!isFirebaseConfigured()) return;
  await markSignedOut();
  const { useSessionStore } = await import('@/store/session');
  const live = useSessionStore.getState().liveSession;
  await Promise.all([
    live
      ? bestEffort(async () => {
          const { endFirestoreLiveSession } = await import('@/features/live/firestoreLive');
          await endFirestoreLiveSession(live.id);
        })
      : Promise.resolve(),
    bestEffort(async () => {
      const { unregisterPushTokenAsync } = await import('@/features/notifications/push');
      await unregisterPushTokenAsync();
    }),
    bestEffort(async () => {
      const { endLiveActivity } = await import('@/features/live/liveActivity');
      await endLiveActivity();
    }),
    bestEffort(async () => {
      const { signOutGoogle } = await import('@/features/auth/social');
      await signOutGoogle();
    }),
  ]);
  await firebaseSignOut(getFirebaseAuth());
}

/**
 * Permanently delete the signed-in account.
 * Prefer server Cloud Function; falls back to client purge.
 * @deprecated Import from `@/features/auth/deleteAccount` for new code.
 */
export async function deleteAccount(): Promise<void> {
  const { getIdToken, requestServerAccountDeletion } = await import('@/features/auth/deleteAccount');
  const token = await getIdToken();
  await requestServerAccountDeletion(token);
}

/** Leave onboarding and return to the welcome/landing screen. */
export async function exitToWelcome() {
  try {
    await signOut();
  } catch {
    // Still clear local state even if Firebase sign-out fails.
  }
}

export async function getSession(): Promise<AuthSession> {
  if (!isFirebaseConfigured()) return null;
  const user = await restoreAuthUser();
  if (!user) return null;
  return { user: { id: user.uid, email: user.email } };
}

/**
 * Wait for Firebase Auth persistence to restore. `currentUser` is often null
 * on cold start/reload until the first onAuthStateChanged fires — using it
 * too early incorrectly treats signed-in users as logged out / unfinished.
 */
export function waitForAuthUser(): Promise<User | null> {
  if (!isFirebaseConfigured()) return Promise.resolve(null);
  const auth = getFirebaseAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

/** Saved session on cold start — unless this device logged out, even if that logout never finished. */
export async function restoreAuthUser(): Promise<User | null> {
  const [user, mark] = await Promise.all([
    waitForAuthUser(),
    AsyncStorage.getItem(SIGNED_OUT_KEY).catch(() => null),
  ]);
  if (user && mark === '1') {
    await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
    return null;
  }
  return user;
}

export function subscribeAuth(callback: (user: User | null) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(getFirebaseAuth(), callback);
}
