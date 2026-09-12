import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { DtIconHero, type DtIconMode } from '@/components/onboarding/DtIconHero';
import { colors, spacing } from '@/constants/theme';
import { exitToWelcome } from '@/features/auth/api';
import { skipSetupToApp } from '@/features/profile/skipSetup';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { isBackendConfigured } from '@/lib/env';

export function readyLabel(progress: number): string {
  if (progress >= 100) return 'READY ⚡';
  if (progress >= 80) return `${progress}% READY`;
  if (progress >= 60) return `${progress}% READY`;
  if (progress >= 40) return `${progress}% READY`;
  if (progress >= 20) return `${progress}% READY`;
  return `${Math.max(progress, 0)}% READY`;
}

/** Step → progress for the persistent d:t ring */
export const ONBOARD_PROGRESS: Record<string, number> = {
  name: 10,
  birthday: 20,
  agreements: 28,
  account: 36,
  gender: 44,
  'interested-in': 52,
  intention: 60,
  distance: 68,
  photo: 76,
  'video-pick': 82,
  'video-about': 88,
  'video-tonight': 92,
  verify: 96,
  ready: 100,
};

interface OnboardingChromeProps {
  progress: number;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  mode?: DtIconMode;
  live?: boolean;
  iconSize?: number;
  compact?: boolean;
  showBack?: boolean;
  /** Skip remaining setup and enter app with Go Live locked. */
  showSkipSetup?: boolean;
  onBack?: (() => void) | 'landing';
}

export function OnboardingChrome({
  progress,
  title,
  subtitle,
  children,
  footer,
  mode = 'progress',
  live = false,
  iconSize,
  compact = false,
  showBack = true,
  showSkipSetup = true,
  onBack,
}: OnboardingChromeProps) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);
  const ringSize = iconSize ?? (compact ? 64 : 88);

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    if (onBack === 'landing' || !router.canGoBack()) {
      void (async () => {
        await exitToWelcome();
        useSessionStore.getState().reset();
        useOnboardingDraft.getState().reset();
        router.replace('/(auth)/welcome');
      })();
      return;
    }
    router.back();
  };

  const onSkipSetup = () => {
    const draft = useOnboardingDraft.getState();
    if (draft.displayName.trim().length < 2) {
      Alert.alert('Name first', 'Confirm your name before skipping — it must match your ID.');
      return;
    }
    if (!draft.legalConsentAccepted) {
      Alert.alert(
        'Agreements first',
        'Accept Terms, Privacy, and Community Guidelines before entering the app.',
        [{ text: 'Review', onPress: () => router.push('/(onboarding)/agreements') }],
      );
      return;
    }

    Alert.alert(
      'Skip setup?',
      'You can browse, but Go Live / Ping stay locked until you finish name, age, gender, preferences, photo, videos, and location.',
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Skip for now',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setSkipping(true);
                if (isBackendConfigured()) {
                  const saved = await skipSetupToApp(draft);
                  useSessionStore.getState().setProfile(saved.profile);
                  useSessionStore.getState().setPreferences(saved.preferences);
                } else {
                  useSessionStore.getState().setProfile({
                    userId: useSessionStore.getState().userId ?? 'local',
                    displayName: draft.displayName,
                    bio: null,
                    genderId: draft.gender,
                    datingIntention: draft.vibes[0] ?? null,
                    heightCm: null,
                    occupation: null,
                    school: null,
                    hometown: null,
                    neighborhoodLabel: null,
                    zodiac: null,
                    verificationStatus: draft.verificationStatus,
                    mainPhotoUrl: draft.mainPhotoUri,
                    profileCompletion: {
                      onboardingComplete: false,
                      setupSkipped: true,
                      name: true,
                      age: Boolean(draft.dateOfBirth),
                      gender: Boolean(draft.gender),
                      preference: Boolean(draft.interestedIn),
                      mainPhoto: Boolean(draft.mainPhotoUri),
                      videos: false,
                      location: draft.locationEnabled,
                      communityStandards: Boolean(draft.legalConsentAccepted),
                    },
                    dateOfBirth: draft.dateOfBirth || null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  });
                }
                router.replace('/(tabs)/live');
              } catch (error) {
                Alert.alert(
                  'Couldn’t skip',
                  error instanceof Error ? error.message : 'Try again',
                );
              } finally {
                setSkipping(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={[styles.root, compact && styles.rootCompact]}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={handleBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <View style={[styles.iconBlock, compact && styles.iconBlockCompact]}>
          <DtIconHero size={ringSize} mode={mode} progress={progress} live={live} />
          <AppText style={[styles.ready, live && styles.readyLive]}>
            {live ? 'LIVE' : readyLabel(progress)}
          </AppText>
        </View>

        {(title || subtitle) && (
          <View style={[styles.copy, compact && styles.copyCompact]}>
            {title ? (
              <AppText style={[styles.title, compact && styles.titleCompact]}>{title}</AppText>
            ) : null}
            {subtitle ? (
              <AppText style={[styles.sub, compact && styles.subCompact]}>{subtitle}</AppText>
            ) : null}
          </View>
        )}

        <View style={[styles.body, compact && styles.bodyCompact]}>{children}</View>
        {footer ? <View style={[styles.footer, compact && styles.footerCompact]}>{footer}</View> : null}
        {showSkipSetup ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSkipSetup}
            disabled={skipping}
            style={({ pressed }) => [styles.skipBtn, pressed && styles.backPressed]}
          >
            <Text style={styles.skipLabel}>
              {skipping ? 'Entering…' : 'Skip setup for now'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  rootCompact: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.sm,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backPressed: { opacity: 0.7 },
  backSpacer: { height: 0 },
  iconBlock: {
    alignItems: 'center',
    gap: 10,
  },
  iconBlockCompact: {
    gap: 4,
  },
  ready: {
    color: colors.brandBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  readyLive: {
    color: colors.live,
  },
  copy: {
    marginTop: spacing.lg,
    gap: 8,
  },
  copyCompact: {
    marginTop: spacing.sm,
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 36,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
  subCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    flex: 1,
    marginTop: spacing.lg,
  },
  bodyCompact: {
    marginTop: spacing.md,
  },
  footer: {
    paddingTop: spacing.sm,
  },
  footerCompact: {
    paddingTop: 12,
    gap: 10,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
