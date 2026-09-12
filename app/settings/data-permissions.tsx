import React from 'react';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LegalP, SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';

const PERMISSIONS = [
  {
    label: 'Location',
    why: 'Nearby discovery and distance when you Go Live. Exact coords are not written to Firestore today.',
  },
  {
    label: 'Camera',
    why: 'Record prompt videos and take profile photos / verification selfie flows.',
  },
  {
    label: 'Microphone',
    why: 'Audio on prompt videos you record in-app.',
  },
  {
    label: 'Photos',
    why: 'Choose existing photos or videos for your profile.',
  },
  {
    label: 'Notifications',
    why: 'Pings, matches, messages, and tonight plan alerts when push is configured.',
  },
] as const;

export default function DataPermissionsScreen() {
  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Data & permissions" />
        <AppText variant="secondary" style={styles.sub}>
          OS permissions DateToday may request. You can revoke them anytime in system settings.
        </AppText>

        <SettingsGroup title="Permissions inventory">
          {PERMISSIONS.map((item, index) => (
            <SettingsRow
              key={item.label}
              label={item.label}
              detail={item.why}
              last={index === PERMISSIONS.length - 1}
              onPress={() => void Linking.openSettings()}
            />
          ))}
        </SettingsGroup>

        <LegalP>
          Changing a permission in Settings may limit features (for example, discovery without location, or
          recording without camera/mic).
        </LegalP>

        <Button label="Open Settings" onPress={() => void Linking.openSettings()} />
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
  sub: {
    marginBottom: spacing.sm,
  },
});
