import { getFirebaseAuth } from '@/lib/firebase/client';
import { env, isBackendConfigured } from '@/lib/env';
import { analytics } from '@/lib/analytics';
import { useOnboardingDraft } from '@/store/onboardingDraft';

function functionsBaseUrl(): string {
  const projectId = env.firebaseProjectId || 'datetoday-e1331';
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

async function authHeader(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken(true);
  return `Bearer ${token}`;
}

const EMAIL_OTP_ENABLED = true;

/** Google/Apple emails are already verified by the provider. */
export function needsEmailOtp(): boolean {
  if (!EMAIL_OTP_ENABLED || !isBackendConfigured()) return false;
  const user = getFirebaseAuth().currentUser;
  if (!user?.email) return false;
  if (user.emailVerified) return false;
  const providers = user.providerData.map((p) => p.providerId);
  if (providers.includes('google.com') || providers.includes('apple.com')) {
    return false;
  }
  return true;
}

export async function sendEmailOtp(): Promise<{ email: string }> {
  const user = getFirebaseAuth().currentUser;
  if (!user?.email) throw new Error('No email on this account.');

  analytics.track('email_otp_started');

  const res = await fetch(`${functionsBaseUrl()}/sendEmailOtp`, {
    method: 'POST',
    headers: {
      Authorization: await authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    result?: { ok?: boolean; email?: string };
  };
  if (!res.ok) {
    throw new Error(data.error || `Couldn’t send code (${res.status})`);
  }
  return { email: data.result?.email || user.email };
}

export async function confirmEmailOtp(code: string): Promise<void> {
  const trimmed = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(trimmed)) {
    throw new Error('Enter the 6-digit code from your email.');
  }

  const res = await fetch(`${functionsBaseUrl()}/confirmEmailOtp`, {
    method: 'POST',
    headers: {
      Authorization: await authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: trimmed }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Couldn’t verify (${res.status})`);
  }

  await getFirebaseAuth().currentUser?.reload().catch(() => undefined);
  useOnboardingDraft.getState().setEmailVerified(true);
  analytics.track('email_otp_completed');
}
