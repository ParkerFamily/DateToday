import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Screen } from '@/components/ui/Screen';
import { friendlyError, isWrongPassword } from '@/lib/errors';
import { BrandMark } from '@/components/ui/AppText';
import { TextField } from '@/components/ui/TextField';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { announceSocialResult, SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { loginSchema, sendPasswordReset, signInWithEmail, type LoginInput } from '@/features/auth/api';
import {
  getPendingLink,
  PROVIDER_LABEL,
  signInWithPendingCredential,
  type LinkProvider,
} from '@/features/auth/linking';
import { finishSocialSignIn, type SocialAuthResult } from '@/features/auth/social';
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
  const insets = useSafeAreaInsets();
  const setAuth = useSessionStore((s) => s.setAuth);
  const setProfile = useSessionStore((s) => s.setProfile);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const params = useLocalSearchParams<{ link?: string; email?: string; methods?: string }>();
  const linkProvider: LinkProvider | null =
    params.link === 'google' || params.link === 'apple' ? params.link : null;
  const linkMethods = (params.methods ?? '').split(',').filter(Boolean);
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit, formState, getValues, setValue } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: params.email ?? '', password: '' },
  });

  // Sent back here from a Google/Apple button on this same screen: show the matched email.
  useEffect(() => {
    if (params.email) setValue('email', params.email);
  }, [params.email, setValue]);

  const onSocialSuccess = useCallback(
    (result: SocialAuthResult) => {
      // Returning users skip agreements if already consented; new users hit Agreements screen.
      void continueAfterSocialAuth(result.user, router);
    },
    [router],
  );

  const forgotPassword = () => {
    const email = getValues('email').trim();
    if (!email.includes('@')) {
      Alert.alert('Enter your email', 'Type the email you signed up with, then tap Forgot password.');
      return;
    }
    sendPasswordReset(email)
      .then(() =>
        Alert.alert(
          'Check your email',
          `If ${email} has a DateToday password, we just sent a link to reset it. Check spam if you don’t see it.`,
        ),
      )
      .catch((error) => Alert.alert('Couldn’t send reset email', friendlyError(error, 'Try again.')));
  };

  /** Skip the password: sign in with Google/Apple anyway. Same account; Firebase drops the old password. */
  const continueWithProviderInstead = (provider: LinkProvider) => {
    const label = PROVIDER_LABEL[provider];
    Alert.alert(
      `Use ${label} instead?`,
      `You’ll keep the same DateToday account — profile, matches and chats. ${label} replaces your old password; you can set a new one later in Settings › Account information.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Continue with ${label}`,
          onPress: () => {
            setLoading(true);
            signInWithPendingCredential()
              .then(({ cred }) => finishSocialSignIn(cred, provider))
              .then((result) => {
                announceSocialResult(result);
                onSocialSuccess(result);
              })
              .catch((error) => Alert.alert(`${label} sign-in failed`, friendlyError(error, 'Try again.')))
              .finally(() => setLoading(false));
          },
        },
      ],
    );
  };

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
      if (data.linked) {
        const label = PROVIDER_LABEL[data.linked];
        Alert.alert(`${label} connected`, `You can sign in with ${label} or your password from now on. Same account either way.`);
      } else if (data.linkError) {
        Alert.alert(
          'Logged in',
          `We couldn’t connect ${linkProvider ? PROVIDER_LABEL[linkProvider] : 'your other sign-in'} this time (${friendlyError(data.linkError, 'try again')}). You can connect it in Settings › Account information.`,
        );
      }
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
      Alert.alert(
        'Login failed',
        friendlyError(error, 'Try again') +
          (isWrongPassword(error) && !linkProvider
            ? '\n\nSigned up with Google or Apple? Use that button below. You can add a password later in Settings.'
            : ''),
      );
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
        // Android: KeyboardAvoidingView measures from its parent, which starts below the status bar.
        keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
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
            {linkProvider ? (
              <LinkBanner
                provider={linkProvider}
                email={params.email ?? ''}
                methods={linkMethods}
                canSkip={Boolean(getPendingLink()) && (linkMethods.length === 0 || linkMethods.includes('password'))}
                onSkip={() => continueWithProviderInstead(linkProvider)}
              />
            ) : null}
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
              <Pressable accessibilityRole="button" onPress={forgotPassword} hitSlop={8} style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
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

const WAY_LABEL: Record<string, string> = { password: 'your password', 'google.com': 'Google', 'apple.com': 'Apple' };

/** Google/Apple matched an account that signs in another way: log in that way and it gets connected. */
function LinkBanner({
  provider,
  email,
  methods,
  canSkip,
  onSkip,
}: {
  provider: LinkProvider;
  email: string;
  methods: string[];
  canSkip: boolean;
  onSkip: () => void;
}) {
  const label = PROVIDER_LABEL[provider];
  const ways = methods.map((m) => WAY_LABEL[m]).filter(Boolean);
  const how = ways.length ? ways.join(' or ') : 'the way you signed up';
  const pending = Boolean(getPendingLink());
  return (
    <View style={styles.linkCard}>
      <Text style={styles.linkTitle}>You already have an account</Text>
      <Text style={styles.linkBody}>
        {email || 'This email'} is already on DateToday.{' '}
        {pending
          ? `Log in with ${how} and we’ll connect ${label} to it, so you can use either.`
          : `Log in with ${how}, then connect ${label} in Settings › Account information.`}
      </Text>
      {canSkip ? (
        <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={8}>
          <Text style={styles.linkSkip}>Forgot your password? Continue with {label} instead</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = ScaledSheet.create({
  flex: { flex: 1 },
  linkCard: {
    gap: 6,
    padding: 14,
    marginBottom: spacing.md,
    borderRadius: 16,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  linkTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  linkBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  linkSkip: { color: colors.brandBright, fontSize: 13, fontWeight: '700', marginTop: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -6 },
  forgotText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
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
