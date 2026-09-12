import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsGroup, SettingsRow, SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, spacing } from '@/constants/theme';
import { APP_STORE_LINKS, SUPPORT } from '@/constants/legal';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { signOut } from '@/features/auth/api';
import { isBackendConfigured } from '@/lib/env';

export default function SettingsScreen() {
  const router = useRouter();
  const resetSession = useSessionStore((s) => s.reset);
  const resetDraft = useOnboardingDraft((s) => s.reset);
  const profile = useSessionStore((s) => s.profile);
  const [busy, setBusy] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const verified = profile?.verificationStatus === 'verified';

  const leaveToWelcome = () => {
    resetSession();
    resetDraft();
    router.replace('/(auth)/welcome');
  };

  const logout = () => {
    Alert.alert('Log out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setBusy(true);
              if (isBackendConfigured()) await signOut();
            } finally {
              setBusy(false);
              leaveToWelcome();
            }
          })();
        },
      },
    ]);
  };

  const manageSubscription = () => {
    const url =
      Platform.OS === 'ios'
        ? APP_STORE_LINKS.appleSubscriptions
        : APP_STORE_LINKS.googleSubscriptions;
    void Linking.openURL(url);
  };

  const restorePurchases = () => {
    void (async () => {
      const { restorePlusPurchases } = await import('@/lib/purchases');
      const result = await restorePlusPurchases();
      if (result.status === 'success') {
        Alert.alert('Restored', 'DateToday+ is active on this account.');
        return;
      }
      if (result.status === 'cancelled') return;
      Alert.alert(
        'Restore purchases',
        result.status === 'error'
          ? result.message
          : 'No active DateToday+ subscription found.',
      );
    })();
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Settings" />

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.brandBright} />
            <AppText style={styles.busyLabel}>Logging out…</AppText>
          </View>
        ) : null}

        <SettingsGroup title="Account & profile">
          <SettingsRow
            label="Account information"
            onPress={() => router.push('/settings/account')}
          />
          <SettingsRow
            label="Photos & videos"
            onPress={() => router.push('/settings/media')}
          />
          <SettingsRow
            label="Dating preferences"
            onPress={() => router.push('/settings/preferences')}
          />
          <SettingsRow
            label="Discovery filters"
            onPress={() => router.push('/settings/discovery')}
          />
          <SettingsRow
            label={verified ? 'Verification · Verified' : 'Get verified'}
            last
            onPress={() => router.push('/settings/verification')}
          />
        </SettingsGroup>

        <SettingsGroup title="Subscription">
          <SettingsRow label="DateToday+" onPress={() => router.push('/paywall')} />
          <SettingsRow label="Tonight Boost" onPress={() => router.push('/paywall/boost')} />
          <SettingsRow label="Restore purchases" onPress={restorePurchases} />
          <SettingsRow label="Manage subscription" last onPress={manageSubscription} />
        </SettingsGroup>

        <SettingsGroup title="Privacy & safety">
          <SettingsRow
            label="Privacy controls"
            onPress={() => router.push('/settings/privacy-controls')}
          />
          <SettingsRow label="Safety Center" onPress={() => router.push('/safety')} />
          <SettingsRow label="Dating Safety Tips" onPress={() => router.push('/safety/tips')} />
          <SettingsRow label="Chat & messaging" onPress={() => router.push('/settings/chat')} />
          <SettingsRow label="Blocked users" onPress={() => router.push('/settings/blocked')} />
          <SettingsRow
            label="Location services"
            onPress={() => router.push('/settings/location')}
          />
          <SettingsRow
            label="Data & permissions"
            onPress={() => router.push('/settings/data-permissions')}
          />
          <SettingsRow
            label="Report a problem"
            last
            onPress={() => router.push('/safety/report')}
          />
        </SettingsGroup>

        <SettingsGroup title="Notifications">
          <SettingsRow
            label="Notification settings"
            last
            onPress={() => router.push('/settings/notifications')}
          />
        </SettingsGroup>

        <SettingsGroup title="Legal & support">
          <SettingsRow label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
          <SettingsRow label="Terms of Service" onPress={() => router.push('/legal/terms')} />
          <SettingsRow
            label="Community Guidelines"
            onPress={() => router.push('/legal/guidelines')}
          />
          <SettingsRow
            label="Identity Verification & Biometrics"
            onPress={() => router.push('/legal/identity')}
          />
          <SettingsRow
            label="Third-party services"
            onPress={() => router.push('/legal/third-parties')}
          />
          <SettingsRow label="About" onPress={() => router.push('/legal/about')} />
          <SettingsRow
            label="Help & support"
            last
            onPress={() => void Linking.openURL(`mailto:${SUPPORT.email}`)}
          />
        </SettingsGroup>

        <SettingsGroup title="Account actions">
          <SettingsRow label="Log out" onPress={logout} />
          <SettingsRow
            label="Delete account"
            danger
            last
            onPress={() => router.push('/settings/delete-account')}
          />
        </SettingsGroup>

        <AppText variant="secondary" style={styles.version}>
          Version {version}
        </AppText>

        <Button label="Done" variant="ghost" onPress={() => router.back()} disabled={busy} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  busyLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
});
