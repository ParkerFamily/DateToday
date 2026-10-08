import {
  linkWithCredential,
  signInWithCredential,
  type AuthCredential,
  type UserCredential,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { functionsUrl } from '@/features/matches/api';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';

export type LinkProvider = 'google' | 'apple';
export type SignInMethod = 'password' | 'google.com' | 'apple.com';

export const PROVIDER_LABEL: Record<LinkProvider, string> = { google: 'Google', apple: 'Apple' };

/**
 * Google/Apple matched an existing DateToday account. The person logs in the way they signed up,
 * then this sign-in is linked to that same account (same UID, same profile).
 */
export class LinkRequiredError extends Error {
  constructor(
    readonly email: string,
    readonly provider: LinkProvider,
    readonly methods: SignInMethod[],
  ) {
    super(`You already have a DateToday account with ${email}.`);
    this.name = 'LinkRequiredError';
  }
}

type Pending = { email: string; provider: LinkProvider; credential: AuthCredential; expiresAt: number };

let pending: Pending | null = null;

/** Google ID tokens last an hour, Apple's ten minutes. */
const TTL_MS: Record<LinkProvider, number> = { google: 50 * 60 * 1000, apple: 9 * 60 * 1000 };

export function setPendingLink(email: string, provider: LinkProvider, credential: AuthCredential) {
  pending = { email: email.trim().toLowerCase(), provider, credential, expiresAt: Date.now() + TTL_MS[provider] };
}

export function getPendingLink(): Pick<Pending, 'email' | 'provider'> | null {
  if (pending && pending.expiresAt <= Date.now()) pending = null;
  return pending ? { email: pending.email, provider: pending.provider } : null;
}

export function clearPendingLink() {
  pending = null;
}

/** Asks the server whether this Google/Apple sign-in would land on an existing account. */
export async function precheckSocialSignIn(
  provider: LinkProvider,
  idToken: string,
): Promise<{ action: 'signin' } | { action: 'link'; methods: SignInMethod[]; email: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(functionsUrl('authPrecheck'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, idToken }),
      signal: controller.signal,
    });
    if (!res.ok) return { action: 'signin' };
    const json = (await res.json()) as { action?: string; methods?: SignInMethod[]; email?: string };
    if (json.action === 'link' && json.email) {
      return { action: 'link', methods: json.methods ?? [], email: json.email };
    }
    return { action: 'signin' };
  } catch {
    // Never block sign-in on the check; finishSocialSignIn still notices a replaced password.
    return { action: 'signin' };
  } finally {
    clearTimeout(timer);
  }
}

async function recordProviders() {
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  await setDoc(
    doc(getDb(), 'users', user.uid),
    { providerIds: user.providerData.map((p) => p.providerId), updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => undefined);
}

/**
 * After logging in the existing way: attach the waiting Google/Apple sign-in to this account.
 * Returns the provider that got connected, or null if there was nothing (valid) to link.
 */
export async function completePendingLink(): Promise<LinkProvider | null> {
  const waiting = getPendingLink() && pending;
  const user = getFirebaseAuth().currentUser;
  if (!waiting || !user) return null;
  if ((user.email ?? '').toLowerCase() !== waiting.email) return null;
  clearPendingLink();
  try {
    await linkWithCredential(user, waiting.credential);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/provider-already-linked') return null;
    throw error;
  }
  await recordProviders();
  return waiting.provider;
}

/** "Forgot your password?": go ahead with Google/Apple. Same account; Firebase drops the old password. */
export async function signInWithPendingCredential(): Promise<{ cred: UserCredential; provider: LinkProvider }> {
  const waiting = getPendingLink() && pending;
  if (!waiting) throw new Error('That sign-in expired. Tap Continue with Google or Apple again.');
  clearPendingLink();
  const cred = await signInWithCredential(getFirebaseAuth(), waiting.credential);
  return { cred, provider: waiting.provider };
}

/** Settings: connect another sign-in method to the signed-in account. */
export async function linkCredentialToCurrentUser(credential: AuthCredential): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  await linkWithCredential(user, credential);
  await user.reload().catch(() => undefined);
  await recordProviders();
}
