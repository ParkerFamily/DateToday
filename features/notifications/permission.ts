import { Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { copy } from '@/constants/copy';
import { useSessionStore } from '@/store/session';
import { analytics } from '@/lib/analytics';

export type NotificationPermissionResult = 'granted' | 'denied' | 'undetermined' | 'skipped';

export async function requestNotificationPermission(): Promise<boolean> {
  const result = await requestNotificationPermissionWithPrePrompt({ force: true });
  return result === 'granted';
}

/**
 * Contextual notification permission with product pre-prompt copy.
 * Call at Go Live / first Ping — never on cold launch spam.
 */
export async function requestNotificationPermissionWithPrePrompt(
  options: { force?: boolean } = {},
): Promise<NotificationPermissionResult> {
  const { force = false } = options;
  const asked = useSessionStore.getState().notificationsAsked;
  if (asked && !force) return 'skipped';

  return new Promise((resolve) => {
    Alert.alert(copy.dontMissPing, copy.notificationPitch, [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: () => {
          useSessionStore.getState().setNotificationsAsked(true);
          resolve('skipped');
        },
      },
      {
        text: 'TURN ON NOTIFICATIONS',
        onPress: () => {
          void (async () => {
            useSessionStore.getState().setNotificationsAsked(true);
            const current = await Notifications.getPermissionsAsync();
            if (current.granted) {
              analytics.track('notification_permission', { status: 'granted' });
              resolve('granted');
              return;
            }

            const next = await Notifications.requestPermissionsAsync();
            if (next.granted) {
              analytics.track('notification_permission', { status: 'granted' });
              resolve('granted');
              return;
            }

            if (Platform.OS !== 'web' && !next.canAskAgain) {
              Alert.alert(
                'Notifications off',
                'Enable notifications in Settings so we can alert you when someone Pings.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => void Linking.openSettings() },
                ],
              );
            }

            analytics.track('notification_permission', { status: 'denied' });
            resolve(next.status === 'undetermined' ? 'undetermined' : 'denied');
          })();
        },
      },
    ]);
  });
}
