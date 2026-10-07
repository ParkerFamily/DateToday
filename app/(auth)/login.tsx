import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Screen } from '@/components/ui/Screen';
import { friendlyError } from '@/lib/errors';
import { BrandMark } from '@/components/ui/AppText';
import { TextField } from '@/components/ui/TextField';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { loginSchema, signInWithEmail, type LoginInput } from '@/features/auth/api';
import { colors, spacing } from '@/constants/theme';
import { isBackendConfigured } from '@/lib/env';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { continueAfterSocialAuth, ensureLocationPermissionAsked } from '@/features/auth/postAuth';
import { loadUserProfile } from '@/features/profile/saveOnboarding';
import { hasEnteredApp } from '@/utils/accountEntry';
import { ScaledSheet } from '@/lib/scale';

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
        if (saved.hasLegalConsent) useOnboardingDraft.getState().acceptLegalConsent();
        
        // Request location permission if iOS hasn't been asked yet.
        // This ensures the permission shows up in iOS Settings even for existing users.
        void ensureLocationPermissionAsked();
        
        router.replace('/(tabs)/live');
      } else {
        if (saved?.profile) {
          setProfile(saved.profile);
          setPreferences(saved.preferences);
        }
        router.replace('/(onboarding)/name');
      }
    } catch (error) {
      Alert.alert('Login failed', friendlyError(error, 'Try again'));
    } finally {
      setLoading(false);
    }
  });

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <LinearGradient
        colors={['rgba(124,58,237,0.16)', 'rgba(9,9,11,0)', 'rgba(9,9,11,0)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.top}>
            <BrandMark width={176} />
          </View>
          <View style={styles.body}>
            <View style={styles.header}>
              <Text style={styles.headline}>Welcome back.</Text>
              <Text style={styles.sub}>Log in to go live tonight.</Text>
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
              <PrimaryCta label="LOG IN" showArrow={false} loading={loading} onPress={onSubmit} />
              <SocialAuthButtons onSuccess={onSocialSuccess} disabled={loading} />
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(auth)/welcome')}
                style={styles.createBtn}
              >
                <Text style={styles.createText}>
                  New here? <Text style={styles.createLink}>Create account</Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  top: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  header: {
    gap: 8,
    marginBottom: spacing.lg,
  },
  headline: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 36,
    fontFamily: 'Inter_800ExtraBold',
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    gap: spacing.md,
  },
  createBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  createText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  createLink: {
    color: colors.brandBright,
    fontWeight: '800',
  },
});
