import React from 'react';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LegalNote, LegalP, SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';

export default function LocationSettingsScreen() {
  const router = useRouter();
  const locationGranted = useSessionStore((s) => s.locationGranted);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Location services" />
        <AppText variant="secondary">
          Location powers nearby discovery when you Go Live. Others should only see approximate distance — not
          your exact coordinates.
        </AppText>

        <SettingsGroup title="Status">
          <SettingsRow
            label="Permission"
            detail={locationGranted ? 'Granted (session)' : 'Not granted / unknown'}
            last
            onPress={() => void Linking.openSettings()}
          />
        </SettingsGroup>

        <LegalP>
          Today, device lat/lng from the OS is used in-app for Go Live / activation and is not written to
          Firestore. When live backend storage is active, coordinates are intended for private live-session
          records only — not public profiles.
        </LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm retention for any future live-session location records.
        </LegalNote>

        <Button label="Open system settings" onPress={() => void Linking.openSettings()} />
        <Button label="Privacy Policy" variant="ghost" onPress={() => router.push('/legal/privacy')} />
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
