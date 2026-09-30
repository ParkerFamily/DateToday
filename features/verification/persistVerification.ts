import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { assertFirebaseConfigured, env } from '@/lib/env';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import type { Profile, VerificationStatus } from '@/types';
import { mapPersonaStatus } from '@/features/verification/persona';

function functionsBaseUrl(): string {
  const projectId = env.firebaseProjectId || 'datetoday-e1331';
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

async function idToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in.');
  return user.getIdToken(true);
}

function applyStatusToSession(status: VerificationStatus, inquiryId?: string | null) {
  useOnboardingDraft.getState().setVerification({
    status,
    inquiryId: inquiryId === undefined ? undefined : inquiryId,
  });

  const profile = useSessionStore.getState().profile;
  if (profile) {
    const next: Profile = {
      ...profile,
      verificationStatus: status,
      updatedAt: new Date().toISOString(),
      profileCompletion: {
        ...profile.profileCompletion,
        verification: status === 'verified',
      },
    };
    useSessionStore.getState().setProfile(next);
  }
}

/** In-progress states only — rules reject a client writing 'verified'; the server confirms that. */
async function writeVerificationDocs(
  uid: string,
  status: Exclude<VerificationStatus, 'verified'>,
  inquiryId: string | null,
) {
  const userPayload = {
    verificationStatus: status,
    personaInquiryId: inquiryId,
    verificationCheckedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  // Private account doc — full verification metadata.
  await setDoc(doc(getDb(), 'users', uid), userPayload, { merge: true });
  // Public profile — status only (no inquiry id / timestamps that rules treat as private).
  await setDoc(
    doc(getDb(), 'profiles', uid),
    {
      verificationStatus: status,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Persist inquiry + an in-progress status before asking the server to confirm with Persona. */
export async function persistVerificationProgress(input: {
  status: Exclude<VerificationStatus, 'verified'>;
  inquiryId?: string | null;
}): Promise<void> {
  assertFirebaseConfigured();
  const uid =
    useSessionStore.getState().userId || getFirebaseAuth().currentUser?.uid || null;
  if (!uid) throw new Error('Not signed in.');

  await writeVerificationDocs(uid, input.status, input.inquiryId ?? null);
  applyStatusToSession(input.status, input.inquiryId ?? null);
}

async function confirmViaCloudFunction(inquiryId: string | null): Promise<{
  status: VerificationStatus;
  inquiryId: string | null;
} | null> {
  try {
    const token = await idToken();
    const res = await fetch(`${functionsBaseUrl()}/confirmPersonaVerification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inquiryId }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: VerificationStatus;
      inquiryId?: string | null;
    };
    return {
      status: (json.status ?? 'pending') as VerificationStatus,
      inquiryId: json.inquiryId ?? inquiryId,
    };
  } catch {
    return null;
  }
}

/**
 * Ask the server to re-check Persona for this account. Only the server can save VERIFIED; if it
 * can't be reached, fall back to whatever status it last saved.
 */
export async function confirmPersonaOnServer(inquiryId?: string | null): Promise<{
  status: VerificationStatus;
  inquiryId: string | null;
}> {
  assertFirebaseConfigured();
  const authUser = getFirebaseAuth().currentUser;
  if (!authUser) throw new Error('Not signed in.');
  const uid = authUser.uid;
  // Keep session uid aligned with Firebase Auth (avoids writing the wrong doc).
  if (useSessionStore.getState().userId !== uid) {
    useSessionStore.getState().setAuth(uid, authUser.email ?? null);
  }

  const viaFn = await confirmViaCloudFunction(inquiryId ?? null);
  if (viaFn) {
    applyStatusToSession(viaFn.status, viaFn.inquiryId);
    return viaFn;
  }

  const snap = await getDoc(doc(getDb(), 'users', uid)).catch(() => null);
  const status = (snap?.data()?.verificationStatus as VerificationStatus | undefined) ?? 'unverified';
  applyStatusToSession(status, inquiryId ?? null);
  return { status, inquiryId: inquiryId ?? null };
}

let lastSyncAt = 0;

/**
 * Pull the saved status (the server may have approved since) and, while it's pending,
 * ask the server to re-check Persona. Cheap enough to run on screen focus.
 */
export async function syncVerificationStatus(opts: { force?: boolean } = {}): Promise<VerificationStatus | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  if (!opts.force && Date.now() - lastSyncAt < 30_000) return null;
  lastSyncAt = Date.now();

  const snap = await getDoc(doc(getDb(), 'users', user.uid));
  let status = (snap.data()?.verificationStatus as VerificationStatus | undefined) ?? 'unverified';
  if (status === 'pending' || status === 'manual_review' || opts.force) {
    const viaFn = await confirmViaCloudFunction(null);
    if (viaFn) status = viaFn.status;
  }
  if (useSessionStore.getState().profile?.verificationStatus !== status) {
    applyStatusToSession(status);
  }
  return status;
}

/**
 * Browser closed without the redirect (common on Android): ask the server what Persona has,
 * without first marking the account pending.
 */
export async function checkPersonaAfterClose(inquiryId: string): Promise<VerificationStatus | null> {
  const viaFn = await confirmViaCloudFunction(inquiryId);
  if (!viaFn) return null;
  applyStatusToSession(viaFn.status, viaFn.inquiryId);
  return viaFn.status;
}

/**
 * After hosted Persona returns: save progress, then confirm + write to the account.
 */
export async function finalizePersonaVerification(input: {
  status: VerificationStatus;
  inquiryId: string;
  rawStatus?: string;
}): Promise<VerificationStatus> {
  const initial: Exclude<VerificationStatus, 'verified'> =
    input.status === 'failed'
      ? 'failed'
      : input.status === 'manual_review'
        ? 'manual_review'
        : 'pending';

  await persistVerificationProgress({
    status: initial,
    inquiryId: input.inquiryId || null,
  });

  const confirmed = await confirmPersonaOnServer(input.inquiryId || null);
  return confirmed.status;
}

export { mapPersonaStatus };
