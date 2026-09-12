import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { colors, spacing } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { saveOnboardingProfile } from '@/features/profile/saveOnboarding';
import { isBackendConfigured } from '@/lib/env';

const HOLD_MS = 1000;

export default function YoureInScreen() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const userId = useSessionStore((s) => s.userId);
  const setProfile = useSessionStore((s) => s.setProfile);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const [holdProgress, setHoldProgress] = useState(0);
  const [live, setLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = useRef<number>(0);

  const commitProfile = async () => {
    if (saving) return;
    if (!draft.legalConsentAccepted) {
      Alert.alert('Agreements required', 'Accept Terms & Privacy before going live.', [
        { text: 'Review', onPress: () => router.replace('/(onboarding)/agreements') },
      ]);
      return;
    }
    setSaving(true);
    try {
      if (isBackendConfigured() && userId) {
        const saved = await saveOnboardingProfile(draft);
        setProfile(saved.profile);
        setPreferences(saved.preferences);
      } else {
        // Offline / local preview fallback
        setProfile({
          userId: userId ?? 'local',
          displayName: draft.displayName || 'You',
          bio: draft.bio || null,
          genderId: draft.gender,
          datingIntention: draft.vibes[0] ?? null,
          heightCm: null,
          occupation: null,
          school: null,
          hometown: null,
          neighborhoodLabel: null,
          zodiac: null,
          verificationStatus: draft.verificationStatus || 'unverified',
          mainPhotoUrl: draft.mainPhotoUri,
          profileCompletion: {
            onboardingComplete: true,
            name: true,
            age: true,
            gender: true,
            preference: true,
            vibes: draft.vibes.length >= 1,
            mainPhoto: true,
            videos: true,
            location: draft.locationEnabled,
            communityStandards: Boolean(draft.legalConsentAccepted),
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setPreferences({
          userId: userId ?? 'local',
          interestedIn: draft.interestedIn ?? 'everyone',
          minAge: draft.minAge,
          maxAge: draft.maxAge,
          maxDistanceMiles: draft.radiusMiles,
          intentions: draft.vibes,
        });
      }
      setTimeout(() => router.replace('/(onboarding)/activate'), 650);
    } catch (error) {
      setLive(false);
      setHoldProgress(0);
      Alert.alert(
        'Couldn’t save profile',
        error instanceof Error
          ? error.message
          : 'Check your connection and try holding again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const clearHold = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const onPressIn = () => {
    if (live || saving) return;
    start.current = Date.now();
    setHoldProgress(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearHold();
    timer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - start.current) / HOLD_MS);
      setHoldProgress(p);
      if (p >= 1) {
        clearHold();
        setLive(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void commitProfile();
      }
    }, 32);
  };

  const onPressOut = () => {
    if (live || saving) return;
    clearHold();
    setHoldProgress(0);
  };

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.root}>
        <View style={styles.center}>
          <DtIconHero
            size={176}
            mode={live ? 'live' : 'hold'}
            progress={100}
            holdProgress={holdProgress}
            live={live}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
          />
          <AppText style={styles.title}>
            {saving ? 'Saving…' : live ? 'PINGING' : "You're ready."}
          </AppText>
          <AppText style={styles.sub}>
            {saving
              ? 'Storing your profile'
              : live
                ? 'Opening Ping Mode…'
                : 'Hold d:t to go live'}
          </AppText>
          {!live && !saving ? (
            <AppText style={styles.hint}>
              {holdProgress > 0
                ? `${Math.ceil((1 - holdProgress) * 3) || 1}…`
                : 'Press and hold for 1 second'}
            </AppText>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  hint: {
    marginTop: 8,
    color: colors.brandBright,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
