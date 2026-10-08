import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';
import { sendPasswordReset } from '@/features/auth/api';
import { linkCredentialToCurrentUser } from '@/features/auth/linking';
import { getAppleCredential, getGoogleIdTokenNative, isAppleSignInAvailable } from '@/features/auth/social';
import { useSessionStore } from '@/store/session';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

const currentProviders = () =>
  isBackendConfigured() ? (getFirebaseAuth().currentUser?.providerData.map((p) => p.providerId) ?? []) : [];

export default function AccountInformationScreen() {
  const router = useRouter();
  const email = useSessionStore((s) => s.email);
  const sessionUserId = useSessionStore((s) => s.userId);
  const [providerIds, setProviderIds] = useState<string[]>(currentProviders);
  const [appleOk, setAppleOk] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | 'password' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleOk).catch(() => setAppleOk(false));
  }, []);

  const { displayEmail, uid } = useMemo(() => {
    const user = isBackendConfigured() ? getFirebaseAuth().currentUser : null;
    return { displayEmail: user?.email ?? email, uid: user?.uid ?? sessionUserId };
  }, [email, sessionUserId]);

  const has = (id: string) => providerIds.includes(id);
  const refresh = useCallback(() => setProviderIds(currentProviders()), []);

  const connect = async (kind: 'google' | 'apple') => {
    const label = kind === 'google' ? 'Google' : 'Apple';
    try {
      setBusy(kind);
      const credential =
        kind === 'google'
          ? GoogleAuthProvider.credential(await getGoogleIdTokenNative())
          : (await getAppleCredential()).credential;
      await linkCredentialToCurrentUser(credential);
      refresh();
      Alert.alert(`${label} connected`, `You can now sign in with ${label} too. Same account either way.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/cancel/i.test(message)) return;
      Alert.alert(`Couldn’t connect ${label}`, friendlyError(error, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async () => {
    if (!displayEmail) return;
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords don’t match', 'Type the same password twice.');
      return;
    }
    try {
      setBusy('password');
      await linkCredentialToCurrentUser(EmailAuthProvider.credential(displayEmail, password));
      refresh();
      setShowPassword(false);
      setPassword('');
      setConfirm('');
      Alert.alert('Password added', `You can now log in with ${displayEmail} and this password, too.`);
    } catch (error) {
      Alert.alert('Couldn’t add password', friendlyError(error, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = () => {
    if (!displayEmail) return;
    Alert.alert('Change password?', `We’ll email a reset link to ${displayEmail}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send link',
        onPress: () =>
          void sendPasswordReset(displayEmail)
            .then(() => Alert.alert('Check your email', 'Open the link to choose a new password.'))
            .catch((error) => Alert.alert('Couldn’t send link', friendlyError(error, 'Try again.'))),
      },
    ]);
  };

  const showApple = Platform.OS === 'ios' && (appleOk || has('apple.com'));
  const backend = isBackendConfigured();

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsHeader title="Account information" />
        <AppText variant="secondary" style={styles.sub}>
          Sign-in details for your DateToday account.
        </AppText>

        <SettingsGroup title="Signed in as">
          <SettingsRow label="Email" detail={displayEmail ?? 'Not available'} onPress={() => undefined} />
          <SettingsRow label="User ID" detail={uid ?? '—'} last onPress={() => undefined} />
        </SettingsGroup>

        {backend ? (
          <SettingsGroup title="Sign-in methods">
            {displayEmail ? (
              <SettingsRow
                label="Email & password"
                detail={has('password') ? 'Connected · Change' : busy === 'password' ? 'Saving…' : 'Add password'}
                onPress={() => (has('password') ? resetPassword() : setShowPassword((v) => !v))}
              />
            ) : null}
            <SettingsRow
              label="Google"
              detail={has('google.com') ? 'Connected' : busy === 'google' ? 'Connecting…' : 'Connect'}
              last={!showApple}
              onPress={() => (has('google.com') || busy ? undefined : void connect('google'))}
            />
            {showApple ? (
              <SettingsRow
                label="Apple"
                detail={has('apple.com') ? 'Connected' : busy === 'apple' ? 'Connecting…' : 'Connect'}
                last
                onPress={() => (has('apple.com') || busy ? undefined : void connect('apple'))}
              />
            ) : null}
          </SettingsGroup>
        ) : null}

        {backend && showPassword && !has('password') && displayEmail ? (
          <View style={styles.passwordForm}>
            <AppText variant="secondary">
              Add a password so you can also log in with {displayEmail}. Your other sign-in keeps working.
            </AppText>
            <TextField label="New password" secureTextEntry value={password} onChangeText={setPassword} />
            <TextField label="Confirm password" secureTextEntry value={confirm} onChangeText={setConfirm} />
            <Button
              label={busy === 'password' ? 'Saving…' : 'Save password'}
              disabled={busy !== null || password.length < 8 || !confirm}
              onPress={() => void savePassword()}
            />
          </View>
        ) : null}

        {backend ? (
          <AppText variant="secondary" style={styles.note}>
            Every method signs in to this same account — same profile, matches and chats.
          </AppText>
        ) : null}

        <SettingsGroup title="Security">
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

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sub: {
    marginBottom: spacing.lg,
  },
  passwordForm: {
    gap: spacing.md,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  note: {
    fontSize: 13,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
});
