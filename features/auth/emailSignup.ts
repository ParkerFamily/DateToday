import { getFirebaseAuth } from '@/lib/firebase/client';
import { functionsUrl } from '@/features/matches/api';
import type { SignInMethod } from '@/features/auth/linking';

async function post<T>(name: string, body: object, idToken?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(functionsUrl(name), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Connection is slow. Check your internet and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** `email` is the account's own address — it can differ from what was typed (john.doe@ vs johndoe@gmail.com). */
export type SignupStart = { exists: true; methods: SignInMethod[]; email?: string } | { exists: false; sent: true };

/** Emails a 6-digit code to a new address, or reports that the address already has an account. */
export function startEmailSignup(email: string) {
  return post<SignupStart>('startEmailSignup', { email: email.trim() });
}

/** Returns a short-lived token proving this address passed the code. */
export async function confirmEmailSignup(email: string, code: string) {
  const { signupToken } = await post<{ signupToken: string }>('confirmEmailSignup', {
    email: email.trim(),
    code: code.replace(/\s/g, ''),
  });
  return signupToken;
}

/** After the account exists: mark its email verified. Safe to fail — Settings can verify later. */
export async function claimSignupEmail(signupToken: string): Promise<boolean> {
  const user = getFirebaseAuth().currentUser;
  if (!user || !signupToken) return false;
  try {
    await post('claimSignupEmail', { signupToken }, await user.getIdToken());
    await user.reload();
    await user.getIdToken(true);
    return true;
  } catch {
    return false;
  }
}

/** DateToday-branded reset email. Resolves the same whether or not the account exists. */
export async function requestPasswordResetEmail(email: string) {
  await post('sendPasswordResetEmail', { email: email.trim() });
}
