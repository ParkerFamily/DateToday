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
  type AuthCredential,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { assertFirebaseConfigured, env } from '@/lib/env';
import { analytics } from '@/lib/analytics';
import { firstName, useOnboardingDraft } from '@/store/onboardingDraft';
import {
  completePendingLink,
  LinkRequiredError,
  precheckSocialSignIn,
  setPendingLink,
  type LinkProvider,
} from '@/features/auth/linking';

WebBrowser.maybeCompleteAuthSession();

export type SocialAuthResult = {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    isNewUser: boolean;
    provider: 'google' | 'apple';
    /** Another sign-in method that was waiting got connected to this account. */
    linked?: LinkProvider | null;
    /** Firebase replaced this account's password with this sign-in (same account, old password gone). */
    passwordRemoved?: boolean;
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

/** Forget the cached Google account so the next "Continue with Google" shows the picker. */
export async function signOutGoogle(): Promise<void> {
  if (Platform.OS !== 'android' || isExpoGo()) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require('@react-native-google-signin/google-signin') as {
    GoogleSignin: { signOut: () => Promise<null> };
  };
  await GoogleSignin.signOut();
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

/**
 * Google/Apple sign-in that never forks or overwrites an existing account: if the email already
 * belongs to a DateToday account that this sign-in isn't part of, hold it and ask the person to
 * log in the existing way so it can be linked to the same UID.
 */
async function signInGuarded(
  provider: LinkProvider,
  idToken: string,
  credential: AuthCredential,
): Promise<UserCredential> {
  const check = await precheckSocialSignIn(provider, idToken);
  if (check.action === 'link') {
    setPendingLink(check.email, provider, credential);
    throw new LinkRequiredError(check.email, provider, check.methods);
  }
  try {
    return await signInWithCredential(getFirebaseAuth(), credential);
  } catch (error) {
    const code = (error as { code?: string }).code;
    const email = (error as { customData?: { email?: string } }).customData?.email;
    if (code === 'auth/account-exists-with-different-credential' && email) {
      setPendingLink(email, provider, credential);
      throw new LinkRequiredError(email.toLowerCase(), provider, []);
    }
    throw error;
  }
}

/** Shared tail of every Google/Apple sign-in (including "use Google anyway"). */
export async function finishSocialSignIn(
  cred: UserCredential,
  provider: LinkProvider,
  displayName?: string | null,
): Promise<SocialAuthResult> {
  const isNewUser = Boolean(getAdditionalUserInfo(cred)?.isNewUser);
  const before = isNewUser
    ? null
    : await getDoc(doc(getDb(), 'users', cred.user.uid))
        .then((s) => s.data())
        .catch(() => null);
  const providerIds = cred.user.providerData.map((p) => p.providerId);
  const hadPassword = Array.isArray(before?.providerIds) && before.providerIds.includes('password');
  const name = displayName || cred.user.displayName;
  await ensureUserDoc(cred.user.uid, cred.user.email, name, provider, {
    photoURL: cred.user.photoURL,
    providerIds,
    isNewUser,
  });
  const linked = await completePendingLink().catch(() => null);
  analytics.track('signup_completed', { provider });
  return {
    user: {
      id: cred.user.uid,
      email: cred.user.email,
      displayName: name,
      isNewUser,
      provider,
      linked,
      passwordRemoved: hadPassword && !providerIds.includes('password'),
    },
  };
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

/** Apple's sheet → a Firebase credential (iOS only). Used to sign in and to connect Apple in Settings. */
export async function getAppleCredential(): Promise<{
  credential: AuthCredential;
  idToken: string;
  displayName: string | null;
}> {
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
  const name = [apple.fullName?.givenName, apple.fullName?.familyName]
    .filter(Boolean)
    .join(' ');
  return { credential, idToken: apple.identityToken, displayName: name || null };
}

/** Sign in with Apple → Firebase Auth. iOS only. */
export async function signInWithApple(): Promise<SocialAuthResult> {
  const { credential, idToken, displayName } = await getAppleCredential();
  analytics.track('signup_started', { provider: 'apple' });
  const cred = await signInGuarded('apple', idToken, credential);
  return finishSocialSignIn(cred, 'apple', displayName);
}

/**
 * Native Google Sign-In (dev/production builds).
 * Expo Go cannot complete Google OAuth (redirect URI is blocked by Google).
 *
 * Android Play builds need the Play App Signing SHA-1 in Firebase/GCP.
 * webClientId must be the Web OAuth client (type 3) — required for idToken.
 */
export async function signInWithGoogleNative(): Promise<SocialAuthResult> {
  return finishGoogleSignIn(await getGoogleIdTokenNative());
}

/** Native Google account picker → Google ID token. Used to sign in and to connect Google in Settings. */
export async function getGoogleIdTokenNative(): Promise<string> {
  assertFirebaseConfigured();
  if (isExpoGo()) {
    throw new Error(
      'Google Sign-In does not work in Expo Go. Use a development build: npx expo run:ios',
    );
  }

  // Public Web client from google-services.json (client_type 3). Safe to embed —
  // required so Play builds still get an idToken even if env inlining fails.
  const FIREBASE_WEB_CLIENT_ID =
    '626033907762-6c3mb8spcs4ppomfsjm4um135t5t443o.apps.googleusercontent.com';

  // Lazy require so Expo Go doesn't crash on import if native module is missing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require('@react-native-google-signin/google-signin') as {
    GoogleSignin: {
      configure: (opts: Record<string, unknown>) => void;
      hasPlayServices: (opts?: { showPlayServicesUpdateDialog?: boolean }) => Promise<boolean>;
      signIn: () => Promise<
        | { type: 'success'; data: { idToken: string | null } }
        | { type: 'cancelled'; data: null }
      >;
      signOut: () => Promise<null>;
      getTokens: () => Promise<{ idToken: string; accessToken: string }>;
    };
  };

  const webClientId = (env.googleWebClientId || FIREBASE_WEB_CLIENT_ID).trim();
  if (!webClientId || !webClientId.includes('.apps.googleusercontent.com')) {
    throw new Error(
      'Missing Google Web client ID. Use the Web OAuth client from Firebase (not the Android one).',
    );
  }

  GoogleSignin.configure({
    webClientId,
    scopes: ['openid', 'profile', 'email'],
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

  // Clear stale session so a prior partial sign-in cannot return a user without idToken.
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore — no prior session
  }

  let response: { type: 'success'; data: { idToken: string | null } } | { type: 'cancelled'; data: null };
  try {
    response = await GoogleSignin.signIn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/10:|DEVELOPER_ERROR|ApiException: 10/i.test(message)) {
      throw new Error(
        'Google blocked this Android install (error 10). ' +
          'Play Console → App integrity → App signing key certificate SHA-1 must be in Firebase ' +
          'AND Google Cloud → Credentials → Android OAuth client. ' +
          'Expected: 1E:7D:81:1A:62:40:FA:D6:55:AA:D1:0B:04:1D:F1:FC:CF:4D:AA:1E',
      );
    }
    if (/cancel|12501|SIGN_IN_CANCELLED/i.test(message)) {
      throw new Error('Google sign-in was cancelled.');
    }
    throw error instanceof Error ? error : new Error(message);
  }

  if (response.type === 'cancelled') {
    throw new Error('Google sign-in was cancelled.');
  }

  let idToken = response.data?.idToken ?? null;
  if (!idToken) {
    try {
      const tokens = await GoogleSignin.getTokens();
      idToken = tokens.idToken || null;
    } catch (tokenError) {
      console.warn('[DateToday] Google getTokens failed', tokenError);
    }
  }

  if (!idToken) {
    throw new Error(
      'Google signed in but returned no ID token. ' +
        'On a Play Store install this usually means the Play App Signing SHA-1 is missing ' +
        'from Firebase / Google Cloud (emulator uses a different key, so it can still work). ' +
        'Play Console → App integrity → copy App signing SHA-1 → Firebase Android app fingerprints.',
    );
  }

  return idToken;
}

/**
 * Browser AuthSession hook — iOS only.
 * Android must use native Google Sign-In; Google rejects custom-scheme redirects
 * for WEB OAuth clients ("Custom scheme URIs are not allowed for 'WEB' client type").
 */
export function useGoogleAuthRequest() {
  if (Platform.OS === 'android') {
    throw new Error(
      'useGoogleAuthRequest is iOS-only. Use signInWithGoogleNative() on Android.',
    );
  }

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
  const cred = await signInGuarded('google', idToken, credential);
  return finishSocialSignIn(cred, 'google', cred.user.displayName);
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

function prefillNames(name: string | null): void {
  if (!name?.trim()) return;
  const draft = useOnboardingDraft.getState();
  if (!draft.legalName.trim()) draft.setLegalName(name.trim());
  if (!draft.displayName.trim()) draft.setDisplayName(firstName(name));
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
      prefillNames(user.displayName);
      return;
    }
    // Email accounts: auth displayName is just the email's local part, not a real name.
    if (user.email && !draft.email.trim()) draft.setEmail(user.email);
  } catch {
    // ignore
  }
}
