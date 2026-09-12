import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { assertFirebaseConfigured, isBackendConfigured } from '@/lib/env';
import { useSessionStore } from '@/store/session';
import { isAtLeast18 } from '@/utils/time';

/**
 * Persist 18+ DOB immediately so profile completion updates without
 * re-running the whole onboarding flow.
 */
export async function persistAgeConfirmation(dateOfBirth: string): Promise<void> {
  if (!isAtLeast18(dateOfBirth)) {
    throw new Error('You must be at least 18');
  }

  const session = useSessionStore.getState();
  const existing = session.profile;
  if (existing) {
    session.setProfile({
      ...existing,
      dateOfBirth,
      profileCompletion: {
        ...existing.profileCompletion,
        age: true,
      },
      updatedAt: new Date().toISOString(),
    });
  }

  if (!isBackendConfigured()) return;

  assertFirebaseConfigured();
  const uid = getFirebaseAuth().currentUser?.uid ?? session.userId;
  if (!uid) return;

  const ref = doc(getDb(), 'users', uid);
  const snap = await getDoc(ref);
  const prevCompletion =
    (snap.data()?.profileCompletion as Record<string, boolean> | undefined) ??
    existing?.profileCompletion ??
    {};

  await setDoc(
    ref,
    {
      dateOfBirth,
      ageConfirmed: true,
      profileCompletion: {
        ...prevCompletion,
        age: true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
