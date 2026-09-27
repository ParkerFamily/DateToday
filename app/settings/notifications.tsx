import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import {
  LegalP,
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  SettingsToggleRow,
} from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';
import { registerPushTokenAsync } from '@/features/notifications/push';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREF_ROWS,
  setNotificationPref,
  subscribeNotificationPrefs,
  type NotificationPrefKey,
  type NotificationPrefs,
} from '@/features/notifications/preferences';
import { friendlyError } from '@/lib/errors';
import { useSessionStore } from '@/store/session';

export default function NotificationSettingsScreen() {
  const uid = useSessionStore((s) => s.userId);
  const [status, setStatus] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  const refresh = useCallback(async () => {
    const perm = await Notifications.getPermissionsAsync();
    setStatus(perm.granted ? 'granted' : perm.status === 'undetermined' ? 'undetermined' : 'denied');
    setCanAskAgain(perm.canAskAgain);
    void registerPushTokenAsync();
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (!uid) return;
    return subscribeNotificationPrefs(uid, setPrefs);
  }, [uid]);

  const turnOn = async () => {
    if (!canAskAgain) {
      void Linking.openSettings();
      return;
    }
    await registerPushTokenAsync({ prompt: true });
    await refresh();
  };

  const toggle = (key: NotificationPrefKey, value: boolean) => {
    if (!uid) return;
    setPrefs((p) => ({ ...p, [key]: value }));
    setNotificationPref(uid, key, value).catch((error) => {
      setPrefs((p) => ({ ...p, [key]: !value }));
      Alert.alert('Couldn’t save', friendlyError(error, 'Try again.'));
    });
  };

  const off = status !== null && status !== 'granted';

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Notification settings" />

        <SettingsGroup title="Status">
          <SettingsRow
            label="Push notifications"
            detail={status === 'granted' ? 'On for this phone' : status === null ? '…' : 'Off for this phone'}
            last
            onPress={() => void Linking.openSettings()}
          />
        </SettingsGroup>

        {off ? (
          <>
            <AppText variant="secondary">
              Notifications are off, so you’ll miss matches and messages while the app is closed.
            </AppText>
            <Button label="Turn on notifications" onPress={() => void turnOn()} />
          </>
        ) : null}

        <SettingsGroup title="Notify me about">
          {NOTIFICATION_PREF_ROWS.map((row, i) => (
            <SettingsToggleRow
              key={row.key}
              label={row.label}
              detail={row.locked ? `${row.detail} · always on` : row.detail}
              value={prefs[row.key]}
              disabled={row.locked || !uid}
              onValueChange={(v) => toggle(row.key, v)}
              last={i === NOTIFICATION_PREF_ROWS.length - 1}
            />
          ))}
        </SettingsGroup>

        <LegalP>
          These choices apply to every phone you’re signed in on. Your device’s push token is stored privately, used
          only to deliver DateToday notifications, and removed when you sign out or delete your account.
        </LegalP>

        <Button label="Open system settings" variant="ghost" onPress={() => void Linking.openSettings()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
});
