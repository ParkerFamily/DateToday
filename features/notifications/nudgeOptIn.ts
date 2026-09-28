import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getNotificationPrefs, setNotificationPref } from '@/features/notifications/preferences';
import { useSessionStore } from '@/store/session';

const ASKED_KEY = 'dt.tonightNudgesAsked.v1';
let hasAskedThisSession = false; // Guard to prevent multiple simultaneous checks

/**
 * Asks once for marketing-push consent (App Store 4.5.4 requires an explicit opt-in).
 * Waits until push permission is already granted so it never stacks on the OS prompt.
 */
export function useTonightNudgeOptIn() {
  const uid = useSessionStore((s) => s.userId);
  const hasRun = useRef(false);

  useEffect(() => {
    if (!uid || Platform.OS === 'web' || hasRun.current || hasAskedThisSession) return;
    hasRun.current = true;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (hasAskedThisSession || await AsyncStorage.getItem(ASKED_KEY)) return;
          const permission = await Notifications.getPermissionsAsync();
          if (!permission.granted) return;
          const prefs = await getNotificationPrefs(uid);
          if (prefs.promotions) {
            await AsyncStorage.setItem(ASKED_KEY, '1');
            hasAskedThisSession = true;
            return;
          }
          if (cancelled || AppState.currentState !== 'active') return;
          await AsyncStorage.setItem(ASKED_KEY, '1');
          hasAskedThisSession = true;
          Alert.alert(
            'Want tonight nudges?',
            'We’ll give you a heads-up when tonight looks good to go live, plus the occasional DateToday+ deal. Max one a day. Turn it off anytime in Settings → Notifications.',
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Yes, nudge me',
                onPress: () => void setNotificationPref(uid, 'promotions', true).catch(() => undefined),
              },
            ],
          );
        } catch {
          /* ask again next launch */
        }
      })();
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uid]);
}
