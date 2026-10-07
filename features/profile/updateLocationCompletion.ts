import { doc, setDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
import { useSessionStore } from '@/store/session';

/**
 * Updates the profileCompletion.location field in Firestore when location permission is granted.
 * Called when location permission state changes.
 */
export async function updateLocationCompletion(granted: boolean): Promise<void> {
  try {
    const uid = useSessionStore.getState().userId;
    if (!uid) return;

    const profile = useSessionStore.getState().profile;
    if (!profile) return;

    // Only update if the completion status actually changed
    if (profile.profileCompletion?.location === granted) return;

    // Update Firestore
    await setDoc(
      doc(getDb(), 'users', uid),
      {
        profileCompletion: {
          ...profile.profileCompletion,
          location: granted,
        },
      },
      { merge: true }
    );

    // Update local state
    useSessionStore.getState().setProfile({
      ...profile,
      profileCompletion: {
        ...profile.profileCompletion,
        location: granted,
      },
    });
  } catch (error) {
    // Silently fail - not critical
    console.error('[DateToday] Failed to update location completion:', error);
  }
}
