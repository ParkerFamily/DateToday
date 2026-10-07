import React, { useCallback, useState } from 'react';
import { AppState, Linking, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LegalNote, LegalP, SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { ScaledSheet } from '@/lib/scale';

type PermState = { status: Location.PermissionStatus; canAskAgain: boolean } | null;

export default function LocationSettingsScreen() {
  const router = useRouter();
  const setLocationGranted = useSessionStore((s) => s.setLocationGranted);
  const [perm, setPerm] = useState<PermState>(null);

  const refresh = useCallback(async () => {
    const p = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (!p) return;
    setPerm({ status: p.status, canAskAgain: p.canAskAgain });
    const granted = p.status === 'granted';
    setLocationGranted(granted);
    // Update Firestore profileCompletion.location if needed
    const { updateLocationCompletion } = await import('@/features/profile/updateLocationCompletion');
    await updateLocationCompletion(granted);
  }, [setLocationGranted]);

  // Re-read when coming back from the system Settings app.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active') void refresh();
      });
      return () => sub.remove();
    }, [refresh]),
  );

  const granted = perm?.status === 'granted';
  // iOS only lists Location in Settings after the app has asked once, so ask in-app whenever the OS allows it.
  const canAsk = !granted && (perm?.status === 'undetermined' || perm?.canAskAgain === true);

  const onAction = async () => {
    if (canAsk) {
      await Location.requestForegroundPermissionsAsync().catch(() => null);
      await refresh();
      return;
    }
    void Linking.openSettings();
  };

  const detail = !perm
    ? 'Checking…'
    : granted
      ? 'Allowed while using the app'
      : perm.status === 'undetermined'
        ? 'Not asked yet'
        : 'Not allowed';

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Location services" />
        <AppText variant="secondary">
          Location powers nearby discovery when you Go Live. Others should only see approximate distance — not
          your exact coordinates.
        </AppText>

        <SettingsGroup title="Status">
          <SettingsRow label="Permission" detail={detail} last onPress={() => void onAction()} />
        </SettingsGroup>

        <LegalP>
          Today, device lat/lng from the OS is used in-app for Go Live / activation and is not written to
          Firestore. When live backend storage is active, coordinates are intended for private live-session
          records only — not public profiles.
        </LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm retention for any future live-session location records.
        </LegalNote>

        <Button
          label={canAsk ? 'Allow location' : 'Open system settings'}
          onPress={() => void onAction()}
        />
        <Button label="Privacy Policy" variant="ghost" onPress={() => router.push('/legal/privacy')} />
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    marginTop: spacing.lg,
  },
});
