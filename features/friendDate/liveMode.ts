import { startFriendDate } from '@/features/friendDate/api';
import { analytics } from '@/lib/analytics';
import { isBackendConfigured } from '@/lib/env';
import { useFriendDateMode } from '@/store/friendDate';
import { useSessionStore } from '@/store/session';
import type { LiveMode } from '@/types';

/**
 * Switch an active Live session between Dating and Friend Date. Friend Date needs a pass first, so
 * free members out of this week's sessions get code 'friend_date_limit' and stay as they were.
 */
export async function switchLiveMode(mode: LiveMode): Promise<void> {
  const current = useSessionStore.getState().liveSession;
  if (!current) {
    useFriendDateMode.getState().setMode(mode);
    return;
  }
  if ((current.mode ?? 'dating') === mode) return;
  if (isBackendConfigured()) {
    if (mode === 'friend') await startFriendDate();
    const { updateMyLiveSession } = await import('@/features/live/firestoreLive');
    await updateMyLiveSession({ mode });
  }
  const latest = useSessionStore.getState().liveSession;
  if (latest) useSessionStore.getState().setLiveSession({ ...latest, mode });
  useFriendDateMode.getState().setMode(mode);
  if (mode === 'friend') analytics.track('friend_date_live_started', { switched: true });
}
