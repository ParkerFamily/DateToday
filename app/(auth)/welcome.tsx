import React, { useMemo, useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { BrandMark } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { BrandHeartLight } from '@/components/onboarding/BrandHeartLight';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { colors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { continueAfterSocialAuth } from '@/features/auth/postAuth';
import { CONSENT_COPY } from '@/constants/legal';
import type { Profile } from '@/types';
import { useContentLayout } from '@/lib/layout';

const DEV_USER_ID = 'local-dev-user';

function seedDevSession() {
  const now = new Date().toISOString();
  const profile: Profile = {
    userId: DEV_USER_ID,
    displayName: 'Dev',
    bio: 'Local preview session',
    genderId: null,
    datingIntention: 'open_vibe',
    heightCm: null,
    occupation: null,
    school: null,
    hometown: null,
    neighborhoodLabel: 'Atlanta',
    zodiac: null,
    verificationStatus: 'unverified',
    mainPhotoUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=1000&fit=crop&q=80',
    profileCompletion: {
      onboardingComplete: true,
      hasPhoto: true,
      hasVideo: true,
      hasIntention: true,
      name: true,
      preference: true,
      location: true,
      communityStandards: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  const store = useSessionStore.getState();
  store.setAuth(DEV_USER_ID, 'dev@datetoday.local');
  store.setProfile(profile);
  store.setPreferences({
    userId: DEV_USER_ID,
    interestedIn: 'everyone',
    minAge: 21,
    maxAge: 40,
    maxDistanceMiles: 25,
    intentions: ['open_vibe'],
  });
  store.setLocationGranted(true);
  store.setNotificationsAsked(true);
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { contentWidth, layoutHeight } = useContentLayout();
  const showDevLogin = __DEV__;

  const iconSize = useMemo(() => {
    const base = Math.min(contentWidth, layoutHeight) * 0.42;
    return Math.round(Math.max(170, Math.min(200, base)));
  }, [contentWidth, layoutHeight]);

  const loginForMe = () => {
    seedDevSession();
    router.replace('/(tabs)/live');
  };

  const startCreateAccount = () => {
    // Consent is collected on the Agreements onboarding step (unchecked boxes).
    router.push('/(onboarding)/name');
  };

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
      // Do not mark legal consent here — Agreements screen is required for new setup.
      void continueAfterSocialAuth(result.user, router);
    },
    [router],
  );

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.root}>
        <LinearGradient
          colors={['rgba(124,58,237,0.16)', 'rgba(9,9,11,0)', 'rgba(9,9,11,0)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.top}>
          <BrandMark width={176} />
          <Text style={styles.tagline}>Dating for right now.</Text>
        </View>

        <View style={styles.stage}>
          <BrandHeartLight iconSize={iconSize} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.headline}>Meet today. Not someday.</Text>
          <Text style={styles.sub}>
            Real connections don't need weeks of texting.
          </Text>
        </View>

        <View style={styles.actions}>
          <PrimaryCta
            label="CREATE ACCOUNT"
            showArrow={false}
            onPress={startCreateAccount}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log in"
            onPress={() => router.push('/(auth)/login')}
            style={({ pressed }) => [styles.loginBtn, pressed && styles.loginPressed]}
          >
            <Text style={styles.loginLabel}>LOG IN</Text>
          </Pressable>

          <SocialAuthButtons onSuccess={onSocialSuccess} />

          <Text style={styles.legal}>
            {CONSENT_COPY}{' '}
            <Text style={styles.legalLink} onPress={() => router.push('/legal/terms')}>
              Terms
            </Text>
            {', '}
            <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy')}>
              Privacy
            </Text>
            {', and '}
            <Text style={styles.legalLink} onPress={() => router.push('/legal/guidelines')}>
              Community Guidelines
            </Text>
            .
          </Text>

          {showDevLogin ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Temporary login for development"
              onPress={loginForMe}
              style={({ pressed }) => [styles.devBtn, pressed && styles.devPressed]}
            >
              <Text style={styles.devLabel}>Login for me (dev)</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  top: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 10,
    justifyContent: 'center',
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    fontFamily: 'Inter_600SemiBold',
  },
  stage: {
    flex: 1.15,
    minHeight: 220,
    justifyContent: 'center',
  },
  copy: {
    gap: 8,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
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
    maxWidth: 340,
  },
  actions: {
    gap: 12,
    paddingBottom: spacing.md,
  },
  loginBtn: {
    height: 54,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.45)',
    backgroundColor: 'rgba(21,21,24,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginPressed: {
    opacity: 0.85,
    borderColor: colors.brandBright,
  },
  loginLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: 'Inter_800ExtraBold',
  },
  legal: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    opacity: 0.85,
    paddingTop: 2,
  },
  legalLink: {
    color: colors.brandBright,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  devBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  devPressed: {
    opacity: 0.7,
  },
  devLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
