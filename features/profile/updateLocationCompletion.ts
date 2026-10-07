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
    if (!uid) {
      if (__DEV__) console.log('[Location] Cannot update completion: no userId');
      return;
    }

    const profile = useSessionStore.getState().profile;
    if (!profile) {
      if (__DEV__) console.log('[Location] Cannot update completion: no profile');
      return;
    }

    // Only update if the completion status actually changed
    if (profile.profileCompletion?.location === granted) {
      if (__DEV__) console.log('[Location] Completion already up to date:', granted);
      return;
    }

    if (__DEV__) console.log('[Location] Updating completion in Firestore:', { granted, currentValue: profile.profileCompletion?.location });

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

    if (__DEV__) console.log('[Location] Completion updated successfully');
  } catch (error) {
    // Log the actual error
    console.error('[DateToday] Failed to update location completion:', error);
  }
}
