import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  getAdditionalUserInfo,
  type UserCredential,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { assertFirebaseConfigured, env } from '@/lib/env';
import { analytics } from '@/lib/analytics';
import { useOnboardingDraft } from '@/store/onboardingDraft';

WebBrowser.maybeCompleteAuthSession();

export type SocialAuthResult = {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    isNewUser: boolean;
    provider: 'google' | 'apple';
  };
};

function randomNonce(length = 32): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** Google iOS OAuth expects this reversed-client-id scheme — not the bundle id. */
export function googleIosRedirectUri(): string | undefined {
  const iosClientId = env.googleIosClientId;
  if (!iosClientId) return undefined;
  const guid = iosClientId.replace(/\.apps\.googleusercontent\.com$/i, '');
  if (!guid || guid === iosClientId) return undefined;
  return `com.googleusercontent.apps.${guid}:/oauthredirect`;
}

export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

async function ensureUserDoc(
  uid: string,
  email: string | null,
  displayName?: string | null,
  provider?: 'google' | 'apple' | 'email',
  extras?: {
    photoURL?: string | null;
    providerIds?: string[];
    isNewUser?: boolean;
  },
) {
  const providerIds =
    extras?.providerIds?.length
      ? extras.providerIds
      : provider
        ? [provider === 'google' ? 'google.com' : provider === 'apple' ? 'apple.com' : 'password']
        : [];

  try {
    // Merge-only auth metadata. Never reset verification / onboarding flags —
    // returning Google/Apple users must keep their completed profile.
    const payload: Record<string, unknown> = {
      email: email ?? null,
      authProvider: provider ?? null,
      provider: provider ?? null,
      providerIds,
      lastSignInAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (displayName) payload.displayName = displayName;
    if (extras?.photoURL) payload.photoURL = extras.photoURL;
    if (extras?.isNewUser) {
      payload.createdAt = serverTimestamp();
      payload.verificationStatus = 'unverified';
    }
    await setDoc(doc(getDb(), 'users', uid), payload, { merge: true });
  } catch (error) {
    // Don't block Google/Apple login if Firestore rules aren't deployed yet.
    const message = error instanceof Error ? error.message : String(error);
    if (/insufficient permissions|permission-denied/i.test(message)) {
      console.warn(
        '[DateToday] Firestore blocked users/{uid} write. Deploy firestore.rules allowing auth users to write their own doc.',
        message,
      );
      return;
    }
    throw error;
  }
}

function toResult(
  cred: UserCredential,
  extras: { provider: 'google' | 'apple'; displayName?: string | null },
): SocialAuthResult {
  const isNewUser = Boolean(getAdditionalUserInfo(cred)?.isNewUser);
  return {
    user: {
      id: cred.user.uid,
      email: cred.user.email,
      displayName: extras.displayName ?? cred.user.displayName,
      isNewUser,
      provider: extras.provider,
    },
  };
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

/** Sign in with Apple → Firebase Auth. iOS only. */
export async function signInWithApple(): Promise<SocialAuthResult> {
  assertFirebaseConfigured();
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only available on iPhone.');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  const rawNonce = randomNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const apple = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!apple.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken: apple.identityToken,
    rawNonce,
  });

  analytics.track('signup_started', { provider: 'apple' });
  const cred = await signInWithCredential(getFirebaseAuth(), credential);
  const name = [apple.fullName?.givenName, apple.fullName?.familyName]
    .filter(Boolean)
    .join(' ');

  const displayName = name || cred.user.displayName;
  const isNewUser = Boolean(getAdditionalUserInfo(cred)?.isNewUser);
  await ensureUserDoc(cred.user.uid, cred.user.email, displayName, 'apple', {
    photoURL: cred.user.photoURL,
    providerIds: cred.user.providerData.map((p) => p.providerId),
    isNewUser,
  });
  analytics.track('signup_completed', { provider: 'apple' });
  return toResult(cred, { provider: 'apple', displayName });
}

/**
 * Native Google Sign-In (dev/production builds). Falls back to AuthSession outside Expo Go.
 * Expo Go cannot complete Google OAuth (redirect URI is blocked by Google).
 */
export async function signInWithGoogleNative(): Promise<SocialAuthResult> {
  assertFirebaseConfigured();
  if (isExpoGo()) {
    throw new Error(
      'Google Sign-In does not work in Expo Go. Use a development build: npx expo run:ios',
    );
  }

  // Lazy require so Expo Go doesn't crash on import if native module is missing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require('@react-native-google-signin/google-signin') as {
    GoogleSignin: {
      configure: (opts: Record<string, unknown>) => void;
      hasPlayServices: (opts?: { showPlayServicesUpdateDialog?: boolean }) => Promise<boolean>;
      signIn: () => Promise<{ data?: { idToken?: string | null } | null; idToken?: string | null }>;
    };
  };

  if (!env.googleWebClientId) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Create a Web OAuth client in Google Cloud (not the iOS one) and paste its Client ID.',
    );
  }

  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    ...(env.googleIosClientId ? { iosClientId: env.googleIosClientId } : {}),
    offlineAccess: false,
  });

  if (Platform.OS === 'android') {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    } catch {
      throw new Error(
        'Google Play Services is required for Google Sign-In on Android. Update Play Services and try again.',
      );
    }
  }

  analytics.track('signup_started', { provider: 'google' });
  let response: { data?: { idToken?: string | null } | null; idToken?: string | null };
  try {
    response = await GoogleSignin.signIn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/10:|DEVELOPER_ERROR|ApiException: 10/i.test(message)) {
      throw new Error(
        'Android Google Sign-In needs SHA fingerprints in Firebase. ' +
          'Firebase Console → Project settings → Your apps → Android (com.parkerfamily.datetoday) → Add fingerprint. ' +
          'Add BOTH the EAS upload-keystore SHA-1 and the Play App Signing SHA-1, then download a new google-services.json and rebuild.',
      );
    }
    if (/cancel|12501|SIGN_IN_CANCELLED/i.test(message)) {
      throw new Error('Google sign-in was cancelled.');
    }
    throw error instanceof Error ? error : new Error(message);
  }
  const idToken = response.data?.idToken ?? response.idToken;
  if (!idToken) {
    throw new Error('Google did not return an ID token. Check that webClientId is your Web OAuth client.');
  }

  return finishGoogleSignIn(idToken);
}

/**
 * Browser AuthSession hook — only call when `env.googleIosClientId` is set.
 * On iOS, expo-auth-session throws if iosClientId is missing (render crash).
 */
export function useGoogleAuthRequest() {
  const iosClientId = env.googleIosClientId;
  if (!iosClientId) {
    throw new Error(
      'useGoogleAuthRequest requires EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. Use native Google Sign-In instead.',
    );
  }
  const nativeRedirect = googleIosRedirectUri();
  return Google.useIdTokenAuthRequest(
    {
      iosClientId,
      androidClientId: env.googleAndroidClientId || undefined,
      webClientId: env.googleWebClientId || undefined,
    },
    nativeRedirect ? { native: nativeRedirect } : undefined,
  );
}

export async function finishGoogleSignIn(idToken: string): Promise<SocialAuthResult> {
  assertFirebaseConfigured();
  if (!idToken) throw new Error('Google did not return an ID token.');

  analytics.track('signup_started', { provider: 'google' });
  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(getFirebaseAuth(), credential);
  const isNewUser = Boolean(getAdditionalUserInfo(cred)?.isNewUser);
  await ensureUserDoc(
    cred.user.uid,
    cred.user.email,
    cred.user.displayName,
    'google',
    {
      photoURL: cred.user.photoURL,
      providerIds: cred.user.providerData.map((p) => p.providerId),
      isNewUser,
    },
  );
  analytics.track('signup_completed', { provider: 'google' });
  return toResult(cred, { provider: 'google', displayName: cred.user.displayName });
}

export function googleConfigured(): boolean {
  return Boolean(env.googleWebClientId || env.googleIosClientId);
}

/** True when the signed-in Firebase user used Google or Apple (no password step). */
export function currentUserIsSocial(): boolean {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return false;
    return user.providerData.some(
      (p) => p.providerId === 'google.com' || p.providerId === 'apple.com',
    );
  } catch {
    return false;
  }
}

/** Prefill onboarding draft from Firebase — only fills empty fields (won't undo edits). */
export function syncOnboardingFromFirebaseAuth(): void {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const google = user.providerData.some((p) => p.providerId === 'google.com');
    const apple = user.providerData.some((p) => p.providerId === 'apple.com');
    const draft = useOnboardingDraft.getState();
    if (google || apple) {
      if (!draft.authProvider) {
        draft.setAuthProvider(google ? 'google' : 'apple');
      }
      if (!draft.email.trim() && user.email) draft.setEmail(user.email);
      if (!draft.displayName.trim() && user.displayName) {
        draft.setDisplayName(user.displayName);
      }
      return;
    }
    if (user.email && !draft.email.trim()) draft.setEmail(user.email);
    if (user.displayName && !draft.displayName.trim()) {
      draft.setDisplayName(user.displayName);
    }
  } catch {
    // ignore
  }
}
