import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import type { LiveSessionPatch } from '@/features/live/firestoreLive';
import { isBackendConfigured } from '@/lib/env';
import { useSessionStore } from '@/store/session';

/**
 * Which uid's beacon has been checked against Firestore since launch. Until then a
 * missing local session means "unknown", not "offline" — ending the Live Activity in
 * that window (e.g. a background launch) would drop it, and iOS won't let it restart
 * until the app is opened again.
 */
const useLiveRestoreStore = create<{ restoredFor: string | null }>(() => ({ restoredFor: null }));

export function useLiveSessionRestored(uid: string | null | undefined) {
  return useLiveRestoreStore((s) => !isBackendConfigured() || (Boolean(uid) && s.restoredFor === uid));
}

/**
 * Live state is kept in memory, but the beacon in Firestore is the source of truth.
 * The OS routinely kills backgrounded apps — reload the beacon so reopening the app
 * still shows you live (and shows you offline if it ended or expired meanwhile).
 */
export async function restoreLiveSession(uid: string) {
  if (!isBackendConfigured()) return;
  try {
    const { fetchMyActiveLiveSession } = await import('@/features/live/firestoreLive');
    const remote = await fetchMyActiveLiveSession(uid);
    const { liveSession, setLiveSession } = useSessionStore.getState();
    if (remote) {
      const local = liveSession?.id === remote.id ? liveSession : null;
      setLiveSession({
        ...remote,
        isBoosted: remote.isBoosted || Boolean(local?.isBoosted),
        boostedAt: remote.boostedAt ?? local?.boostedAt ?? null,
      });
    } else if (liveSession?.id === uid) {
      setLiveSession(null);
    }
    useLiveRestoreStore.setState({ restoredFor: uid });
  } catch {
    // Offline — keep whatever we have locally.
  }
}

/** Mirror a local live-session change to the beacon other people see. */
export async function syncLiveSessionPatch(patch: LiveSessionPatch) {
  if (!isBackendConfigured()) return;
  try {
    const { updateMyLiveSession } = await import('@/features/live/firestoreLive');
    await updateMyLiveSession(patch);
  } catch (error) {
    console.warn('[DateToday] live session sync failed', error);
  }
}

/** Mount once (tabs layout): re-check the beacon whenever the app comes back to the foreground. */
export function useLiveSessionResync() {
  const uid = useSessionStore((s) => s.userId);
  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void restoreLiveSession(uid);
    });
    return () => sub.remove();
  }, [uid]);
}
