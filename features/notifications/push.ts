import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';

/**
 * Android channel ids. Must match `CHANNEL_FOR_TYPE` in functions/index.js.
 * Users can mute each one separately in Android system settings.
 */
export const ANDROID_CHANNELS = [
  { id: 'messages', name: 'Messages', importance: Notifications.AndroidImportance.MAX },
  { id: 'matches', name: 'Matches', importance: Notifications.AndroidImportance.MAX },
  { id: 'activity', name: 'Likes & activity', importance: Notifications.AndroidImportance.HIGH },
  { id: 'dates', name: 'Dates & reminders', importance: Notifications.AndroidImportance.MAX },
  { id: 'system', name: 'Account & security', importance: Notifications.AndroidImportance.HIGH },
  { id: 'promotions', name: 'News & offers', importance: Notifications.AndroidImportance.DEFAULT },
] as const;

const TOKEN_DOC_KEY = 'dt.pushTokenDocId';

let activeChatMatchId: string | null = null;
let channelsReady: Promise<void> | null = null;

/** Chat screen reports which match is on screen so its own messages don't banner. */
export function setActiveChat(matchId: string | null) {
  activeChatMatchId = matchId;
}

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as { matchId?: unknown; type?: unknown } | undefined;
      if (data?.type === 'live_status') {
        return { shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: true };
      }
      const inThatChat =
        Boolean(activeChatMatchId) && typeof data?.matchId === 'string' && data.matchId === activeChatMatchId;
      return {
        shouldPlaySound: !inThatChat,
        shouldSetBadge: false,
        shouldShowBanner: !inThatChat,
        shouldShowList: !inThatChat,
      };
    },
  });
  void ensureAndroidChannels();
}

export function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelsReady ??= Promise.all(
    ANDROID_CHANNELS.map((c) =>
      Notifications.setNotificationChannelAsync(c.id, {
        name: c.name,
        importance: c.importance,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7C3AED',
        showBadge: c.id !== 'promotions',
      }),
    ),
  )
    .then(() => undefined)
    .catch((error) => {
      channelsReady = null;
      console.warn('[DateToday] notification channels failed', error);
    });
  return channelsReady;
}

/** Remove already-delivered notifications for a chat once it's opened. */
export async function dismissNotificationsForMatch(matchId: string) {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => (n.request.content.data as { matchId?: unknown } | undefined)?.matchId === matchId)
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    /* best effort */
  }
}

function tokenDocId(token: string) {
  return token.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * expo-device is loaded lazily: builds made before it was added don't have its
 * native module, and a top-level import would crash them after an OTA update.
 */
function deviceInfo() {
  let device: typeof import('expo-device') | null = null;
  try {
    device = require('expo-device') as typeof import('expo-device');
  } catch {
    device = null;
  }
  const constants = Platform.constants as { Model?: string; Manufacturer?: string } | undefined;
  return {
    deviceName: device?.deviceName ?? null,
    deviceModel: device?.modelName ?? constants?.Model ?? null,
    manufacturer: device?.manufacturer ?? constants?.Manufacturer ?? null,
    osName: device?.osName ?? Platform.OS,
    osVersion: device?.osVersion ?? String(Platform.Version),
    isPhysicalDevice: device ? device.isDevice : null,
  };
}

function projectId(): string | null {
  return (
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

async function markStoredTokenDisabled() {
  const id = await AsyncStorage.getItem(TOKEN_DOC_KEY).catch(() => null);
  if (!id) return;
  try {
    await updateDoc(doc(getDb(), 'pushTokens', id), { enabled: false, updatedAt: serverTimestamp() });
  } catch {
    /* doc gone or owned by another account */
  }
}

/**
 * Save this device's Expo push token for the signed-in user (one doc per device,
 * so a user can have several phones). Only prompts when `prompt` is true.
 */
export async function registerPushTokenAsync(options: { prompt?: boolean } = {}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return false;

  try {
    await ensureAndroidChannels();
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && options.prompt && perm.canAskAgain) {
      perm = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
    }
    if (!perm.granted) {
      await markStoredTokenDisabled();
      return false;
    }

    const pid = projectId();
    if (!pid) return false;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: pid })).data;
    const id = tokenDocId(token);
    const ref = doc(getDb(), 'pushTokens', id);

    let isNewForThisUser = true;
    try {
      const existing = await getDoc(ref);
      isNewForThisUser = !existing.exists() || existing.data()?.uid !== uid;
    } catch {
      // Owned by the account previously signed in on this phone — take it over.
    }

    await setDoc(
      ref,
      {
        uid,
        token,
        platform: Platform.OS,
        enabled: true,
        appVersion: Constants.expoConfig?.version ?? null,
        ...deviceInfo(),
        updatedAt: serverTimestamp(),
        ...(isNewForThisUser ? { createdAt: serverTimestamp() } : {}),
      },
      { merge: true },
    );

    const previous = await AsyncStorage.getItem(TOKEN_DOC_KEY).catch(() => null);
    if (previous && previous !== id) {
      await deleteDoc(doc(getDb(), 'pushTokens', previous)).catch(() => undefined);
    }
    await AsyncStorage.setItem(TOKEN_DOC_KEY, id).catch(() => undefined);
    return true;
  } catch (error) {
    console.warn('[DateToday] push registration failed', error);
    return false;
  }
}

/** Re-save when APNs/FCM rotates this device's token. Returns an unsubscribe. */
export function listenForPushTokenChanges(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const sub = Notifications.addPushTokenListener(() => {
    void registerPushTokenAsync();
  });
  return () => sub.remove();
}

/** Call before signing out so this phone stops receiving the old account's notifications. */
export async function unregisterPushTokenAsync() {
  const id = await AsyncStorage.getItem(TOKEN_DOC_KEY).catch(() => null);
  if (!id) return;
  try {
    await deleteDoc(doc(getDb(), 'pushTokens', id));
  } catch {
    /* best effort */
  }
  await AsyncStorage.removeItem(TOKEN_DOC_KEY).catch(() => undefined);
}

const LIVE_STATUS_ID = 'live-status';
const LIVE_STATUS_CHANNEL_ID = 'live-status';

/** Android stand-in for the iOS Live Activity: a quiet pinned notification while you're live. */
export async function showLiveStatusNotification(title: string, body: string) {
  if (Platform.OS !== 'android') return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.setNotificationChannelAsync(LIVE_STATUS_CHANNEL_ID, {
      name: 'Live status',
      importance: Notifications.AndroidImportance.LOW,
      showBadge: false,
    });
    await Notifications.scheduleNotificationAsync({
      identifier: LIVE_STATUS_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        data: { type: 'live_status', url: '/live' },
      },
      trigger: { channelId: LIVE_STATUS_CHANNEL_ID },
    });
  } catch {
    /* best effort */
  }
}

export async function clearLiveStatusNotification() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(LIVE_STATUS_ID);
  } catch {
    /* best effort */
  }
}

export function notificationUrl(response: Notifications.NotificationResponse | null | undefined) {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
