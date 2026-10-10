import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { DtIconHero, type DtIconMode } from '@/components/onboarding/DtIconHero';
import { colors, spacing } from '@/constants/theme';
import { exitToWelcome } from '@/features/auth/api';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { ScaledSheet, rs } from '@/lib/scale';

export function readyLabel(progress: number): string {
  if (progress >= 100) return 'READY ⚡';
  if (progress >= 80) return `${progress}% READY`;
  if (progress >= 60) return `${progress}% READY`;
  if (progress >= 40) return `${progress}% READY`;
  if (progress >= 20) return `${progress}% READY`;
  return `${Math.max(progress, 0)}% READY`;
}

export const ONBOARD_PROGRESS: Record<string, number> = {
  name: 10,
  birthday: 18,
  agreements: 26,
  account: 32,
  'email-code': 36,
  password: 40,
  phone: 42, // legacy key unused
  'email-verify': 42,
  gender: 50,
  'interested-in': 58,
  'age-range': 62,
  intention: 66,
  interests: 69,
  distance: 72,
  photo: 78,
  'video-pick': 84,
  'video-about': 90,
  'video-tonight': 94,
  verify: 97,
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
  /** @deprecated Skip removed from onboarding. */
  showSkipSetup?: boolean;
  onBack?: (() => void) | 'landing';
  /** Freeze the logo's glow loop (camera screens). */
  still?: boolean;
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
  onBack,
  still = false,
}: OnboardingChromeProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        // Android: KeyboardAvoidingView measures from its parent, which starts below the status bar.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : insets.top}
      >
        <View style={[styles.root, compact && styles.rootCompact]}>
          {showBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={handleBack}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
            >
              <Ionicons name="chevron-back" size={rs(24)} color={colors.text} />
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}

          <View style={[styles.iconBlock, compact && styles.iconBlockCompact]}>
            <DtIconHero size={ringSize} mode={mode} progress={progress} live={live} still={still} />
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

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? (
            <View style={[styles.footer, compact && styles.footerCompact]}>{footer}</View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  flex: { flex: 1 },
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
  iconBlock: { alignItems: 'center', gap: 10 },
  iconBlockCompact: { gap: 4 },
  ready: {
    color: colors.brandBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  readyLive: { color: colors.live },
  copy: { marginTop: spacing.lg, gap: 8 },
  copyCompact: { marginTop: spacing.sm, gap: 6 },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 36,
    textAlign: 'center',
  },
  titleCompact: { fontSize: 24, lineHeight: 30 },
  sub: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
  subCompact: { fontSize: 13, lineHeight: 18 },
  bodyScroll: { flex: 1, marginTop: spacing.lg },
  bodyContent: { flexGrow: 1, paddingBottom: spacing.sm },
  footer: { paddingTop: spacing.sm },
  footerCompact: { paddingTop: 12, gap: 10 },
});
