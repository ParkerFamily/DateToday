import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { LegalNote, SettingsHeader } from '@/components/settings/SettingsUI';
import { APP_STORE_LINKS } from '@/constants/legal';
import { colors, radii, spacing } from '@/constants/theme';
import {
  currentProviders,
  getIdToken,
  reauthenticateForDeletion,
  requestServerAccountDeletion,
} from '@/features/auth/deleteAccount';
import { isBackendConfigured } from '@/lib/env';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const resetSession = useSessionStore((s) => s.reset);
  const resetDraft = useOnboardingDraft((s) => s.reset);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const providers = useMemo(() => (isBackendConfigured() ? currentProviders() : []), []);
  const needsPassword = providers.includes('password');

  const leaveToWelcome = () => {
    resetSession();
    resetDraft();
    router.replace('/(auth)/welcome');
  };

  const openManageSubscription = () => {
    const url =
      Platform.OS === 'ios'
        ? APP_STORE_LINKS.appleSubscriptions
        : APP_STORE_LINKS.googleSubscriptions;
    void Linking.openURL(url);
  };

  const onDelete = () => {
    if (!confirmed) {
      Alert.alert('Confirm first', 'Check the box to confirm you understand this is permanent.');
      return;
    }
    if (needsPassword && !password.trim()) {
      Alert.alert('Password required', 'Enter your password to confirm deletion.');
      return;
    }

    Alert.alert('Delete forever?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete my account',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setBusy(true);
              if (!isBackendConfigured()) {
                leaveToWelcome();
                return;
              }
              if (needsPassword) {
                await reauthenticateForDeletion(password);
              }
              const token = await getIdToken();
              await requestServerAccountDeletion(token);
              leaveToWelcome();
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Try again.';
              if (message === 'REAUTH_REQUIRED' || message === 'REAUTH_GOOGLE' || message === 'REAUTH_APPLE') {
                Alert.alert(
                  'Sign in again',
                  message === 'REAUTH_GOOGLE'
                    ? 'Sign in with Google again, then retry delete.'
                    : message === 'REAUTH_APPLE'
                      ? 'Sign in with Apple again, then retry delete.'
                      : 'For security, sign in again recently, then retry delete.',
                );
                return;
              }
              Alert.alert('Couldn’t delete account', message);
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsHeader title="Delete account" />
        <AppText variant="secondary">
          This permanently removes your DateToday account. You will not be able to recover photos, videos,
          matches, or verification status.
        </AppText>

        <View style={styles.block}>
          <AppText style={styles.blockTitle}>What we delete</AppText>
          <AppText variant="secondary">
            Firebase Auth user; Firestore users/profiles docs; Storage media under your uid; your block
            relationships. Reports you filed may be retained for safety moderation.
          </AppText>
        </View>

        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm retention for safety reports, deleted_users audit rows, and any
          payment records before relying on this copy externally.
        </LegalNote>

        <View style={styles.block}>
          <AppText style={styles.blockTitle}>Subscriptions</AppText>
          <AppText variant="secondary">
            Deleting DateToday does not cancel Apple or Google subscriptions. Manage or cancel them in your
            store account first if needed. Plus / boost IAP is not fully wired yet.
          </AppText>
          <Button
            label="Manage subscription (Apple)"
            variant="secondary"
            onPress={() => void Linking.openURL(APP_STORE_LINKS.appleSubscriptions)}
            style={styles.storeBtn}
          />
          <Button
            label="Manage subscription (Google)"
            variant="secondary"
            onPress={() => void Linking.openURL(APP_STORE_LINKS.googleSubscriptions)}
          />
          <Button label="Open this device’s store" variant="ghost" onPress={openManageSubscription} />
        </View>

        <Pressable
          style={styles.checkRow}
          onPress={() => setConfirmed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
        >
          <View style={[styles.box, confirmed && styles.boxOn]}>
            {confirmed ? <AppText style={styles.checkMark}>✓</AppText> : null}
          </View>
          <AppText style={styles.checkLabel}>
            I understand deletion is permanent and does not cancel store subscriptions.
          </AppText>
        </Pressable>

        {needsPassword ? (
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Confirm with your password"
          />
        ) : null}

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.brandBright} />
            <AppText style={styles.busyLabel}>Deleting account…</AppText>
          </View>
        ) : null}

        <Button label="Delete my account" variant="danger" loading={busy} onPress={onDelete} />
        <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => router.back()} />
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
  block: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  storeBtn: {
    marginTop: spacing.xs,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxOn: {
    borderColor: colors.brandBright,
    backgroundColor: colors.brand,
  },
  checkMark: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
  },
  checkLabel: {
    flex: 1,
    color: colors.text,
    lineHeight: 22,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  busyLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
