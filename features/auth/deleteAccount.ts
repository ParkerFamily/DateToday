import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, listAll, ref } from 'firebase/storage';
import { getFirebaseAuth, getDb, getFirebaseStorage } from '@/lib/firebase/client';
import { assertFirebaseConfigured, env } from '@/lib/env';
import { analytics } from '@/lib/analytics';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { usePrivacyControls } from '@/store/privacyControls';

async function deleteStorageTree(uid: string) {
  const root = ref(getFirebaseStorage(), `users/${uid}`);
  async function wipe(folder: ReturnType<typeof ref>) {
    const listed = await listAll(folder);
    await Promise.all(listed.items.map((item) => deleteObject(item).catch(() => undefined)));
    await Promise.all(listed.prefixes.map((prefix) => wipe(prefix)));
  }
  try {
    await wipe(root);
  } catch {
    /* continue */
  }
}

async function deleteQueryDocs(path: string, field: string, uid: string) {
  const q = query(collection(getDb(), path), where(field, '==', uid));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => undefined)));
}

/**
 * Client-assisted deletion used when Cloud Functions are not yet deployed.
 * Prefer `requestServerAccountDeletion` (callable) in production.
 */
export async function performAccountDeletionClient(): Promise<void> {
  assertFirebaseConfigured();
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');

  const uid = user.uid;

  await deleteStorageTree(uid);
  await deleteQueryDocs('blocks', 'blockerId', uid);
  await deleteQueryDocs('blocks', 'blockedId', uid);
  await Promise.all([
    deleteDoc(doc(getDb(), 'users', uid)).catch(() => undefined),
    deleteDoc(doc(getDb(), 'profiles', uid)).catch(() => undefined),
  ]);

  await setDoc(
    doc(getDb(), 'deleted_users', uid),
    {
      uid,
      deletedAt: serverTimestamp(),
      deletionSource: 'client',
      emailRetained: false,
    },
    { merge: true },
  );

  try {
    const { deleteUser } = await import('firebase/auth');
    await deleteUser(user);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : '';
    if (code === 'auth/requires-recent-login') {
      throw new Error('REAUTH_REQUIRED');
    }
    throw error instanceof Error ? error : new Error('Auth delete failed');
  }

  useOnboardingDraft.getState().reset();
  usePrivacyControls.getState().reset();
  analytics.track('account_deleted');
}

export async function reauthenticateForDeletion(password?: string): Promise<void> {
  assertFirebaseConfigured();
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in.');

  const providers = user.providerData.map((p) => p.providerId);

  if (providers.includes('password')) {
    if (!password) throw new Error('Enter your password to confirm deletion.');
    if (!user.email) throw new Error('Missing email for re-authentication.');
    const cred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, cred);
    return;
  }

  if (providers.includes('google.com')) {
    throw new Error('REAUTH_GOOGLE');
  }
  if (providers.includes('apple.com')) {
    throw new Error('REAUTH_APPLE');
  }

  throw new Error('Sign in again, then retry delete.');
}

/**
 * Call Firebase Function `deleteAccount` when deployed.
 * Falls back to client deletion so in-app App Store deletion remains available.
 */
export async function requestServerAccountDeletion(
  idToken: string,
): Promise<{ ok: boolean; mode: string }> {
  const projectId = env.firebaseProjectId;
  if (!projectId) {
    await performAccountDeletionClient();
    return { ok: true, mode: 'client' };
  }

  const url = `https://us-central1-${projectId}.cloudfunctions.net/deleteAccount`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: {} }),
    });
    if (!res.ok) {
      await performAccountDeletionClient();
      return { ok: true, mode: 'client_fallback' };
    }
    useOnboardingDraft.getState().reset();
    usePrivacyControls.getState().reset();
    analytics.track('account_deleted', { mode: 'server' });
    // Sign out locally; Auth user should already be deleted server-side.
    await getFirebaseAuth().signOut().catch(() => undefined);
    return { ok: true, mode: 'server' };
  } catch {
    await performAccountDeletionClient();
    return { ok: true, mode: 'client_fallback' };
  }
}

export function getIdToken(): Promise<string> {
  assertFirebaseConfigured();
  const user = getFirebaseAuth().currentUser;
  if (!user) return Promise.reject(new Error('Not signed in'));
  return user.getIdToken(true);
}

export function currentProviders(): string[] {
  return getFirebaseAuth().currentUser?.providerData.map((p) => p.providerId) ?? [];
}
