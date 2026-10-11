import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SettingsGroup, SettingsHeader, SettingsRow, SettingsToggleRow } from '@/components/settings/SettingsUI';
import { colors, spacing } from '@/constants/theme';
import { sendTwoStepCode, setTwoStep, subscribeTwoStep } from '@/features/security/devices';
import { useSessionStore } from '@/store/session';
import { isBackendConfigured } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

export default function TwoStepScreen() {
  const router = useRouter();
  const userId = useSessionStore((s) => s.userId);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  /** The change waiting for its email code: true = turning on, false = turning off. */
  const [pending, setPending] = useState<boolean | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'confirm' | null>(null);

  useEffect(() => {
    if (!userId || !isBackendConfigured()) {
      setEnabled(false);
      return;
    }
    return subscribeTwoStep(userId, setEnabled);
  }, [userId]);

  const requestChange = async (next: boolean) => {
    setBusy('send');
    try {
      setSentTo(await sendTwoStepCode(next));
      setPending(next);
      setCode('');
    } catch (error) {
      Alert.alert('Couldn’t send code', friendlyError(error, 'Try again in a moment.'));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (pending === null) return;
    setBusy('confirm');
    try {
      await setTwoStep(pending, code);
      setEnabled(pending);
      Alert.alert(
        pending ? 'Two-step verification is on' : 'Two-step verification is off',
        pending
          ? 'New devices will need a code from your email to sign in. This device is remembered.'
          : 'New devices can sign in with just your sign-in method again.',
      );
      setPending(null);
      setCode('');
    } catch (error) {
      Alert.alert('Couldn’t confirm', friendlyError(error, 'Check the code and try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsHeader title="Two-step verification" />
        <AppText variant="secondary" style={styles.sub}>
          Add a second step when someone signs in to your account on a new phone or browser: we email a 6-digit code
          to your account email, and they can’t get in without it.
        </AppText>

        {enabled === null ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.brandBright} />
          </View>
        ) : (
          <SettingsGroup title="Email codes">
            <SettingsToggleRow
              label="Two-step verification"
              detail={
                pending !== null
                  ? `Turning ${pending ? 'on' : 'off'} — enter the code below`
                  : enabled
                    ? 'On · new devices need an email code'
                    : 'Off'
              }
              value={pending ?? enabled}
              disabled={busy !== null || pending !== null}
              onValueChange={(next) => void requestChange(next)}
              last
            />
          </SettingsGroup>
        )}

        {pending !== null ? (
          <View style={styles.form}>
            <AppText variant="secondary">
              Enter the 6-digit code we sent to {sentTo || 'your email'} to turn two-step verification{' '}
              {pending ? 'on' : 'off'}.
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
            <Button
              label={busy === 'confirm' ? 'Confirming…' : pending ? 'Turn on' : 'Turn off'}
              disabled={busy !== null || code.replace(/\s/g, '').length < 6}
              onPress={() => void confirm()}
            />
            <Button
              label={busy === 'send' ? 'Sending…' : 'Resend code'}
              variant="ghost"
              disabled={busy !== null}
              onPress={() => void requestChange(pending)}
            />
            <Button
              label="Cancel"
              variant="ghost"
              disabled={busy !== null}
              onPress={() => {
                setPending(null);
                setCode('');
              }}
            />
          </View>
        ) : null}

        <SettingsGroup title="Good to know">
          <SettingsRow
            label="Devices"
            detail="See where you’re signed in and sign devices out"
            last
            onPress={() => router.push('/settings/devices' as Href)}
          />
        </SettingsGroup>
        <AppText variant="secondary" style={styles.note}>
          Devices you mark “Remember this device” won’t be asked again. Signing a device out from Devices forgets it.
          Keep your email account secure too — the codes go there.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sub: {
    marginBottom: spacing.lg,
  },
  busy: {
    paddingVertical: spacing.lg,
  },
  form: {
    gap: spacing.md,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  note: {
    fontSize: 13,
    marginTop: -spacing.sm,
  },
});
