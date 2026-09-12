import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { colors, spacing } from '@/constants/theme';
import { usePrivacyControls } from '@/store/privacyControls';

function ToggleRow({
  label,
  detail,
  value,
  onValueChange,
  last,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, last && styles.toggleLast]}>
      <View style={styles.toggleText}>
        <AppText>{label}</AppText>
        {detail ? (
          <AppText variant="secondary" style={styles.detail}>
            {detail}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor={colors.white}
      />
    </View>
  );
}

export default function PrivacyControlsScreen() {
  const router = useRouter();
  const showInDiscovery = usePrivacyControls((s) => s.showInDiscovery);
  const hideDistance = usePrivacyControls((s) => s.hideDistance);
  const pauseDiscovery = usePrivacyControls((s) => s.pauseDiscovery);
  const showIntentions = usePrivacyControls((s) => s.showIntentions);
  const setControls = usePrivacyControls((s) => s.setControls);

  const update = (patch: Parameters<typeof setControls>[0]) => {
    void setControls(patch).catch((error) => {
      Alert.alert('Couldn’t save', error instanceof Error ? error.message : 'Try again.');
    });
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Privacy controls" />
        <AppText variant="secondary" style={styles.sub}>
          Controls DateToday can honor today. They persist to your Firestore user doc when signed in.
        </AppText>

        <SettingsGroup title="Discovery">
          <ToggleRow
            label="Show in discovery"
            detail="When off, you should not appear in discovery / live pools."
            value={showInDiscovery}
            onValueChange={(showInDiscovery) => update({ showInDiscovery })}
          />
          <ToggleRow
            label="Pause discovery"
            detail="Soft pause while you take a break."
            value={pauseDiscovery}
            onValueChange={(pauseDiscovery) => update({ pauseDiscovery })}
          />
          <ToggleRow
            label="Hide distance"
            detail="Prefer neighborhood / hidden distance instead of miles."
            value={hideDistance}
            onValueChange={(hideDistance) => update({ hideDistance })}
          />
          <ToggleRow
            label="Show intentions"
            detail="Show dating intentions / vibes on your public profile."
            value={showIntentions}
            onValueChange={(showIntentions) => update({ showIntentions })}
            last
          />
        </SettingsGroup>

        <SettingsGroup title="More">
          <SettingsRow label="Blocked users" onPress={() => router.push('/settings/blocked')} />
          <SettingsRow
            label="Delete account"
            danger
            last
            onPress={() => router.push('/settings/delete-account')}
          />
        </SettingsGroup>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sub: {
    marginBottom: spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  toggleLast: {
    borderBottomWidth: 0,
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  detail: {
    fontSize: 13,
  },
});
