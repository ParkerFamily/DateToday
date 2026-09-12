import React from 'react';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LegalP, SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';

export default function NotificationSettingsScreen() {
  const notificationsAsked = useSessionStore((s) => s.notificationsAsked);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Notification settings" />
        <AppText variant="secondary">
          Notifications help you catch pings, matches, messages, and tonight plan updates while you are Live.
        </AppText>

        <SettingsGroup title="Status">
          <SettingsRow
            label="Permission prompt"
            detail={notificationsAsked ? 'Already asked this session' : 'Not asked yet'}
            last
            onPress={() => void Linking.openSettings()}
          />
        </SettingsGroup>

        <LegalP>
          Push tokens are intended for private delivery only. End-to-end push wiring on Firebase is still rolling
          out — system permission is controlled in your device settings.
        </LegalP>

        <Button label="Open system settings" onPress={() => void Linking.openSettings()} />
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
  header: {
    marginTop: spacing.lg,
  },
});
