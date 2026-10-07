import * as Notifications from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { functionsUrl } from '@/features/matches/api';
import { dismissNotificationsForMatch } from '@/features/notifications/push';
import { getFirebaseAuth } from '@/lib/firebase/client';

/** Must match CATEGORY_FOR_TYPE in functions/index.js. No ":" or "-" allowed in category ids. */
export const MESSAGE_CATEGORY = 'message';
const REPLY_ACTION = 'reply';
const MARK_READ_ACTION = 'mark_read';
/** Must match CATEGORY_FOR_TYPE live_* in functions/index.js. */
export const LIVE_CATEGORY = 'live_session';
const STAY_LIVE_ACTION = 'stay_live';
const GO_OFFLINE_ACTION = 'go_offline';
const ACTION_IDS = new Set([REPLY_ACTION, MARK_READ_ACTION, STAY_LIVE_ACTION, GO_OFFLINE_ACTION]);
const ANDROID_ACTION_TASK = 'dt_notification_actions';

const handled = new Set<string>();

export function isNotificationAction(response: Notifications.NotificationResponse | null | undefined) {
  return ACTION_IDS.has(response?.actionIdentifier ?? '');
}

/** Stable id per (notification, reply text) so a retried reply can't post twice. */
function replyMessageId(notificationId: string, text: string): string {
  let h = 5381;
  for (const ch of `${notificationId}|${text}`) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `nr_${notificationId.replace(/[^A-Za-z0-9]/g, '').slice(-24)}_${h.toString(36)}`;
}

async function callNotificationAction(body: { matchId: string; text?: string; clientMessageId?: string }) {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Signed out');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl('notificationAction'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`notificationAction ${res.status}`);
}

async function notifyReplyProblem(matchId: string, title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: 'message', matchId, url: `/chat/${matchId}` },
    },
    trigger: Platform.OS === 'android' ? { channelId: 'messages' } : null,
  }).catch(() => undefined);
}

/** iOS background time held by modules/notification-action-time (absent in older builds). */
function releaseBackgroundTime() {
  try {
    requireOptionalNativeModule<{ finish(): void }>('NotificationActionTime')?.finish();
  } catch {
    /* ignore */
  }
}

/** Handles Reply / Mark as read / Stay Live / Go Offline without opening the app. Returns true if the response was an action. */
export async function handleNotificationAction(response: Notifications.NotificationResponse) {
  if (!isNotificationAction(response)) return false;
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}:${response.userText ?? ''}`;
  if (handled.has(key)) return true;
  handled.add(key);
  try {
    await performNotificationAction(response);
  } finally {
    releaseBackgroundTime();
  }
  return true;
}

/** Stay Live / Go Offline go through the server (idempotent per notification), then resync locally. */
async function performLiveAction(response: Notifications.NotificationResponse) {
  const action = response.actionIdentifier === STAY_LIVE_ACTION ? 'stay' : 'offline';
  const id = response.notification.request.identifier;
  const nonce = `${action}:${id.replace(/[^A-Za-z0-9:_.-]/g, '').slice(-120)}`;
  try {
    const { callLiveAction } = await import('@/features/live/liveActions');
    try {
      await callLiveAction(action, nonce);
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
      await callLiveAction(action, nonce);
    }
    const uid = getFirebaseAuth().currentUser?.uid;
    if (uid) {
      const { restoreLiveSession } = await import('@/features/live/restoreLiveSession');
      await restoreLiveSession(uid);
    }
  } catch {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: action === 'stay' ? 'Couldn’t keep you Live' : 'Couldn’t take you offline',
        body: 'Tap to open DateToday and try again.',
        data: { type: 'live_status_error', url: '/live' },
      },
      trigger: Platform.OS === 'android' ? { channelId: 'live' } : null,
    }).catch(() => undefined);
  } finally {
    await Notifications.dismissNotificationAsync(id).catch(() => undefined);
  }
}

async function performNotificationAction(response: Notifications.NotificationResponse) {
  if (response.actionIdentifier === STAY_LIVE_ACTION || response.actionIdentifier === GO_OFFLINE_ACTION) {
    await performLiveAction(response);
    return;
  }
  const data = response.notification.request.content.data as { matchId?: unknown } | undefined;
  const matchId = typeof data?.matchId === 'string' ? data.matchId : null;
  if (!matchId) return;
  const text = response.actionIdentifier === REPLY_ACTION ? (response.userText ?? '').trim() : '';
  if (response.actionIdentifier === REPLY_ACTION && !text) return;

  // A reply answers their message, so it's never limited by the free daily allowance.
  try {
    const body = text.slice(0, 2000);
    const clientMessageId = body ? replyMessageId(response.notification.request.identifier, body) : undefined;
    try {
      await callNotificationAction({ matchId, text: body || undefined, clientMessageId });
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
      await callNotificationAction({ matchId, text: body || undefined, clientMessageId });
    }
    await dismissNotificationsForMatch(matchId);
  } catch {
    await dismissNotificationsForMatch(matchId);
    if (text) await notifyReplyProblem(matchId, 'Reply not sent', `Tap to open the chat and send “${text.slice(0, 60)}” again.`);
  }
}

/**
 * Android only delivers background action taps to a TaskManager task. Builds made
 * before expo-task-manager was added don't have its native module, so check first
 * and fall back to opening the app to send the reply.
 */
function setUpAndroidActionTask(): boolean {
  if (Platform.OS !== 'android' || !requireOptionalNativeModule('ExpoTaskManager')) return false;
  try {
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    if (!TaskManager.isTaskDefined(ANDROID_ACTION_TASK)) {
      TaskManager.defineTask<Notifications.NotificationTaskPayload>(ANDROID_ACTION_TASK, async ({ data }) => {
        if (data && typeof data === 'object' && 'actionIdentifier' in data) {
          await handleNotificationAction(data as Notifications.NotificationResponse);
        }
      });
    }
    void Notifications.registerTaskAsync(ANDROID_ACTION_TASK).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** Call once at module scope (root layout) so actions work on background / cold launches. */
export function installNotificationActions() {
  if (Platform.OS === 'web') return;
  const silent = Platform.OS === 'ios' || setUpAndroidActionTask();

  const actions: Notifications.NotificationAction[] = [
    {
      identifier: REPLY_ACTION,
      buttonTitle: 'Reply',
      textInput: { submitButtonTitle: 'Send', placeholder: 'Message…' },
      options: { opensAppToForeground: !silent },
    },
  ];
  if (silent) {
    actions.push({
      identifier: MARK_READ_ACTION,
      buttonTitle: 'Mark as read',
      options: { opensAppToForeground: false },
    });
  }
  void Notifications.setNotificationCategoryAsync(MESSAGE_CATEGORY, actions, {
    previewPlaceholder: 'New message',
  }).catch(() => undefined);

  void Notifications.setNotificationCategoryAsync(LIVE_CATEGORY, [
    { identifier: STAY_LIVE_ACTION, buttonTitle: 'Stay Live', options: { opensAppToForeground: !silent } },
    {
      identifier: GO_OFFLINE_ACTION,
      buttonTitle: 'Go Offline',
      options: { opensAppToForeground: !silent, isDestructive: true },
    },
  ]).catch(() => undefined);

  Notifications.addNotificationResponseReceivedListener((response) => {
    void handleNotificationAction(response);
  });
  const last = Notifications.getLastNotificationResponse();
  if (isNotificationAction(last) && last) {
    Notifications.clearLastNotificationResponse();
    void handleNotificationAction(last);
  }
}
