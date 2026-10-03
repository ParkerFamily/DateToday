import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ensureAndroidChannels } from '@/features/notifications/push';
import { getNotificationPrefs } from '@/features/notifications/preferences';

const LIVE_ENDING_ID = 'live-ending-reminder';
const LEAD_MS = 15 * 60 * 1000;

let scheduledFor: number | null = null;

/** Local reminder shortly before a live session expires (respects the Reminders preference). */
export async function scheduleLiveEndingReminder(uid: string, expiresAtMs: number) {
  if (Platform.OS === 'web') return;
  const fireAt = expiresAtMs - LEAD_MS;
  if (scheduledFor === fireAt) return;
  await cancelLiveEndingReminder();
  if (fireAt <= Date.now() + 60_000) return;
  try {
    const [perm, prefs] = await Promise.all([Notifications.getPermissionsAsync(), getNotificationPrefs(uid)]);
    if (!perm.granted || !prefs.reminders) return;
    await ensureAndroidChannels();
    await Notifications.scheduleNotificationAsync({
      identifier: LIVE_ENDING_ID,
      content: {
        title: 'Your live time ends in 15 minutes',
        body: 'Extend it or lock in a plan with a match before you go offline.',
        sound: 'default',
        data: { type: 'reminder', url: '/live' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
        channelId: 'dates',
      },
    });
    scheduledFor = fireAt;
  } catch {
    scheduledFor = null;
  }
}

const STILL_FREE_ID = 'live-still-free';
let stillFreeFor: number | null = null;

/** "Still free tonight?" nudge a few hours into a live session; unanswered sessions leave Out Tonight. */
export async function scheduleStillFreeReminder(fireAtMs: number) {
  if (Platform.OS === 'web') return;
  if (stillFreeFor === fireAtMs) return;
  await cancelStillFreeReminder();
  if (fireAtMs <= Date.now() + 60_000) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await ensureAndroidChannels();
    await Notifications.scheduleNotificationAsync({
      identifier: STILL_FREE_ID,
      content: {
        title: 'Still free tonight?',
        body: 'Tap to stay live. If you don’t, you’ll drop out of Out Tonight soon.',
        sound: 'default',
        data: { type: 'reminder', url: '/live' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAtMs),
        channelId: 'dates',
      },
    });
    stillFreeFor = fireAtMs;
  } catch {
    stillFreeFor = null;
  }
}

export async function cancelStillFreeReminder() {
  stillFreeFor = null;
  try {
    await Notifications.cancelScheduledNotificationAsync(STILL_FREE_ID);
  } catch {
    /* nothing scheduled */
  }
}

export async function cancelLiveEndingReminder() {
  scheduledFor = null;
  try {
    await Notifications.cancelScheduledNotificationAsync(LIVE_ENDING_ID);
  } catch {
    /* nothing scheduled */
  }
}
