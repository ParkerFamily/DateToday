import * as Notifications from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { functionsUrl } from '@/features/matches/api';
import { dismissNotificationsForMatch } from '@/features/notifications/push';
import { isPlusActive } from '@/lib/entitlements';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { canMessageMatch, recordMessagedMatch } from '@/lib/usage/dailyLimits';
import { useSessionStore } from '@/store/session';

/** Must match CATEGORY_FOR_TYPE in functions/index.js. No ":" or "-" allowed in category ids. */
export const MESSAGE_CATEGORY = 'message';
const REPLY_ACTION = 'reply';
const MARK_READ_ACTION = 'mark_read';
const ANDROID_ACTION_TASK = 'dt_notification_actions';

const handled = new Set<string>();

export function isNotificationAction(response: Notifications.NotificationResponse | null | undefined) {
  return response?.actionIdentifier === REPLY_ACTION || response?.actionIdentifier === MARK_READ_ACTION;
}

async function callNotificationAction(body: { matchId: string; text?: string }) {
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
      ...(Platform.OS === 'android' ? { channelId: 'messages' } : {}),
    },
    trigger: null,
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

/** Handles Reply / Mark as read without opening the app. Returns true if the response was an action. */
export async function handleNotificationAction(response: Notifications.NotificationResponse) {
  if (!isNotificationAction(response)) return false;
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
  if (handled.has(key)) return true;
  handled.add(key);
  try {
    await performNotificationAction(response);
  } finally {
    releaseBackgroundTime();
  }
  return true;
}

async function performNotificationAction(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as { matchId?: unknown } | undefined;
  const matchId = typeof data?.matchId === 'string' ? data.matchId : null;
  if (!matchId) {
    console.error('[DateToday] performNotificationAction: no matchId', { data });
    return;
  }
  const text = response.actionIdentifier === REPLY_ACTION ? (response.userText ?? '').trim() : '';
  if (response.actionIdentifier === REPLY_ACTION && !text) {
    console.log('[DateToday] performNotificationAction: empty reply text');
    return;
  }

  try {
    const entitlements = useSessionStore.getState().entitlements;
    if (text) {
      const gate = await canMessageMatch(entitlements, matchId);
      if (!gate.ok) {
        await dismissNotificationsForMatch(matchId);
        await notifyReplyProblem(
          matchId,
          'Reply not sent',
          'Free includes chatting with 1 person a day. Tap to message them with DateToday+.',
        );
        return;
      }
    }
    console.log('[DateToday] performNotificationAction: calling API', { matchId, hasText: Boolean(text) });
    await callNotificationAction({ matchId, text: text.slice(0, 2000) || undefined });
    console.log('[DateToday] performNotificationAction: API call successful');
    if (text && !isPlusActive(entitlements)) await recordMessagedMatch(matchId);
    await dismissNotificationsForMatch(matchId);
  } catch (error) {
    console.error('[DateToday] performNotificationAction failed:', error);
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

  Notifications.addNotificationResponseReceivedListener((response) => {
    void handleNotificationAction(response);
  });
  const last = Notifications.getLastNotificationResponse();
  if (isNotificationAction(last) && last) {
    Notifications.clearLastNotificationResponse();
    void handleNotificationAction(last);
  }
}
