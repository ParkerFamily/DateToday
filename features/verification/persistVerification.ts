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

async function writeVerificationDocs(
  uid: string,
  status: VerificationStatus,
  inquiryId: string | null,
) {
  const userPayload = {
    verificationStatus: status,
    personaInquiryId: inquiryId,
    verificationCheckedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(status === 'verified' ? { verifiedAt: serverTimestamp() } : {}),
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

/**
 * Persist inquiry + status. Prefer confirmPersonaOnServer / finalizePersonaVerification
 * after hosted Persona so VERIFIED is written only when Persona confirms.
 */
export async function persistVerificationProgress(input: {
  status: VerificationStatus;
  inquiryId?: string | null;
}): Promise<void> {
  assertFirebaseConfigured();
  const uid =
    useSessionStore.getState().userId || getFirebaseAuth().currentUser?.uid || null;
  if (!uid) throw new Error('Not signed in.');

  await writeVerificationDocs(uid, input.status, input.inquiryId ?? null);
  applyStatusToSession(input.status, input.inquiryId ?? null);
}

type PersonaInquiry = {
  id?: string;
  attributes?: {
    status?: string;
    'reference-id'?: string | null;
  };
};

async function personaHeaders(): Promise<Record<string, string> | null> {
  const key = env.personaSandboxApiKey;
  if (!key?.startsWith('persona_sandbox_') && !key?.startsWith('persona_production_')) {
    return null;
  }
  return {
    Authorization: `Bearer ${key}`,
    'Persona-Version': '2023-01-05',
    Accept: 'application/json',
  };
}

async function fetchInquiry(inquiryId: string): Promise<PersonaInquiry | null> {
  const headers = await personaHeaders();
  if (!headers) return null;
  const res = await fetch(`https://api.withpersona.com/api/v1/inquiries/${inquiryId}`, {
    headers,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: PersonaInquiry };
  return json.data ?? null;
}

async function findInquiryByReferenceId(referenceId: string): Promise<PersonaInquiry | null> {
  const headers = await personaHeaders();
  if (!headers) return null;
  const url = new URL('https://api.withpersona.com/api/v1/inquiries');
  url.searchParams.set('filter[reference-id]', referenceId);
  url.searchParams.set('page[size]', '10');
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: PersonaInquiry[] };
  const rows = Array.isArray(json.data) ? json.data : [];
  if (!rows.length) return null;
  const ranked = [...rows].sort((a, b) => {
    const as = mapPersonaStatus(a.attributes?.status);
    const bs = mapPersonaStatus(b.attributes?.status);
    if (as === 'verified' && bs !== 'verified') return -1;
    if (bs === 'verified' && as !== 'verified') return 1;
    return 0;
  });
  return ranked[0];
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
 * Re-check Persona for this account and save VERIFIED onto the user + profile docs.
 * Uses Cloud Function when deployed (Blaze); otherwise polls Persona with the sandbox key.
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
    // Function may have written Firestore already — still mirror into session.
    applyStatusToSession(viaFn.status, viaFn.inquiryId);
    return viaFn;
  }

  let id =
    (typeof inquiryId === 'string' && inquiryId.trim()) ||
    useOnboardingDraft.getState().personaInquiryId ||
    null;

  if (!id) {
    try {
      const snap = await getDoc(doc(getDb(), 'users', uid));
      const stored = snap.exists() ? snap.data()?.personaInquiryId : null;
      if (typeof stored === 'string' && stored.trim()) id = stored.trim();
    } catch {
      // Continue with Persona lookup by email / uid.
    }
  }

  let inquiry: PersonaInquiry | null = null;
  if (id) {
    inquiry = await fetchInquiry(id);
  }
  if (!inquiry) {
    inquiry = await findInquiryByReferenceId(uid);
    id = inquiry?.id ?? null;
  }
  if (!inquiry) {
    const email =
      authUser.email ||
      useSessionStore.getState().email ||
      useOnboardingDraft.getState().email ||
      null;
    if (email) {
      inquiry = await findInquiryByReferenceId(email);
      id = inquiry?.id ?? null;
    }
  }

  if (!inquiry) {
    await writeVerificationDocs(uid, 'unverified', null);
    applyStatusToSession('unverified', null);
    return { status: 'unverified', inquiryId: null };
  }

  const refId = inquiry.attributes?.['reference-id'];
  const email =
    authUser.email ||
    useSessionStore.getState().email ||
    useOnboardingDraft.getState().email ||
    null;
  const refOk =
    !refId ||
    refId === uid ||
    (email && refId.toLowerCase() === email.toLowerCase()) ||
    String(refId).startsWith('local-');
  if (!refOk) {
    throw new Error('Inquiry does not belong to this account');
  }

  const status = mapPersonaStatus(inquiry.attributes?.status);
  const resolvedId = inquiry.id || id;
  await writeVerificationDocs(uid, status, resolvedId);
  applyStatusToSession(status, resolvedId);
  return { status, inquiryId: resolvedId };
}

/**
 * After hosted Persona returns: save progress, then confirm + write to the account.
 */
export async function finalizePersonaVerification(input: {
  status: VerificationStatus;
  inquiryId: string;
  rawStatus?: string;
}): Promise<VerificationStatus> {
  const initial: VerificationStatus =
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
