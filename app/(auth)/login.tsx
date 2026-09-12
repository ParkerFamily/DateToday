import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Screen } from '@/components/ui/Screen';
import { AppText, BrandMark } from '@/components/ui/AppText';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { loginSchema, signInWithEmail, type LoginInput } from '@/features/auth/api';
import { colors, spacing } from '@/constants/theme';
import { isBackendConfigured } from '@/lib/env';
import { useSessionStore } from '@/store/session';
import { continueAfterSocialAuth } from '@/features/auth/postAuth';
import { loadUserProfile } from '@/features/profile/saveOnboarding';
import { hasEnteredApp } from '@/utils/accountEntry';

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useSessionStore((s) => s.setAuth);
  const setProfile = useSessionStore((s) => s.setProfile);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSocialSuccess = useCallback(
    (result: {
      user: {
        id: string;
        email: string | null;
        displayName?: string | null;
        isNewUser: boolean;
        provider?: 'google' | 'apple';
      };
    }) => {
      // Returning users skip agreements if already consented; new users hit Agreements screen.
      void continueAfterSocialAuth(result.user, router);
    },
    [router],
  );

  const onSubmit = handleSubmit(async (values) => {
    try {
      setLoading(true);
      if (!isBackendConfigured()) {
        setAuth('local-demo', values.email);
        router.replace('/(tabs)/live');
        return;
      }
      const data = await signInWithEmail(values);
      setAuth(data.user.id, data.user.email ?? null);
      const saved = await loadUserProfile(data.user.id);
      if (saved && hasEnteredApp(saved.profile)) {
        setProfile(saved.profile);
        setPreferences(saved.preferences);
        router.replace('/(tabs)/live');
      } else {
        if (saved?.profile) {
          setProfile(saved.profile);
          setPreferences(saved.preferences);
        }
        router.replace('/(onboarding)/name');
      }
    } catch (error) {
      Alert.alert('Login failed', error instanceof Error ? error.message : 'Try again');
    } finally {
      setLoading(false);
    }
  });

  return (
    <Screen>
      <View style={styles.header}>
        <BrandMark size={28} />
        <AppText variant="hero">Welcome back</AppText>
        <AppText variant="secondary">Log in to go live tonight.</AppText>
      </View>
      <View style={styles.form}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <TextField
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={value}
              onChangeText={onChange}
              error={formState.errors.email?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <TextField
              label="Password"
              secureTextEntry
              value={value}
              onChangeText={onChange}
              error={formState.errors.password?.message}
            />
          )}
        />
        <Button label="Log In" loading={loading} onPress={onSubmit} />
        <SocialAuthButtons onSuccess={onSocialSuccess} disabled={loading} />
        <Button label="Create account" variant="ghost" onPress={() => router.push('/(auth)/welcome')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
});
