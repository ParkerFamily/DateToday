import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SettingsToggleRow } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';
import {
  resendLoginCode,
  retryDeviceSession,
  useDeviceSecurity,
  verifyLoginCode,
} from '@/features/security/session';

/** Signs this device out and clears local account state; AuthGate then routes to welcome. */
export async function signOutThisDevice() {
  try {
    const { signOut } = await import('@/features/auth/api');
    await signOut();
  } catch {
    /* local state is cleared below either way */
  }
  const [{ useSessionStore }, { useOnboardingDraft }] = await Promise.all([
    import('@/store/session'),
    import('@/store/onboardingDraft'),
  ]);
  useSessionStore.getState().reset();
  useOnboardingDraft.getState().reset();
}

/** Covers the app while a new sign-in waits for its two-step email code. */
export function SignInCodeGate() {
  const status = useDeviceSecurity((s) => s.status);
  const email = useDeviceSecurity((s) => s.email);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<'verify' | 'resend' | 'retry' | 'signout' | null>(null);

  useEffect(() => {
    if (status !== 'needs_code') setCode('');
  }, [status]);

  if (status !== 'checking' && status !== 'needs_code' && status !== 'error') return null;

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>, failTitle: string) => {
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      Alert.alert(failTitle, friendlyError(error, 'Try again in a moment.'));
    } finally {
      setBusy(null);
    }
  };

  const signOutHere = () => void run('signout', signOutThisDevice, 'Couldn’t sign out');

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Screen padded={false}>
        {status === 'checking' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandBright} />
          </View>
        ) : (
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {status === 'error' ? (
                <>
                  <AppText variant="hero">Couldn’t confirm this sign-in</AppText>
                  <AppText variant="secondary" style={styles.body}>
                    Two-step verification is on for this account. Check your connection and try again.
                  </AppText>
                  <Button
                    label={busy === 'retry' ? 'Trying…' : 'Try again'}
                    disabled={busy !== null}
                    onPress={() => void run('retry', retryDeviceSession, 'Couldn’t connect')}
                  />
                </>
              ) : (
                <>
                  <AppText variant="hero">Confirm it’s you</AppText>
                  <AppText variant="secondary" style={styles.body}>
                    Two-step verification is on. Enter the 6-digit code we emailed to {email || 'your email'} to finish
                    signing in on this device.
                  </AppText>
                  <TextField
                    label="6-digit code"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChangeText={setCode}
                    editable={busy === null}
                    autoFocus
                  />
                  <View style={styles.card}>
                    <SettingsToggleRow
                      label="Remember this device"
                      detail="Don’t ask for a code here next time."
                      value={remember}
                      onValueChange={setRemember}
                      last
                    />
                  </View>
                  <Button
                    label={busy === 'verify' ? 'Checking…' : 'Verify'}
                    disabled={busy !== null || code.replace(/\s/g, '').length < 6}
                    onPress={() => void run('verify', () => verifyLoginCode(code, remember), 'Couldn’t verify')}
                  />
                  <Button
                    label={busy === 'resend' ? 'Sending…' : 'Resend code'}
                    variant="ghost"
                    disabled={busy !== null}
                    onPress={() =>
                      void run(
                        'resend',
                        async () => {
                          await resendLoginCode();
                          Alert.alert('Code sent', `Check ${email || 'your email'} for a new code.`);
                        },
                        'Couldn’t send code',
                      )
                    }
                  />
                </>
              )}
              <Button
                label={busy === 'signout' ? 'Signing out…' : 'Sign out'}
                variant="ghost"
                disabled={busy !== null}
                onPress={signOutHere}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </Screen>
    </View>
  );
}

const styles = ScaledSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  body: {
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
