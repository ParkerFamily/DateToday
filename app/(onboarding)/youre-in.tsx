import React, { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { colors, spacing } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import {
  isMediaUploadError,
  saveOnboardingProfile,
  type MediaUploadError,
} from '@/features/profile/saveOnboarding';
import { isBackendConfigured } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

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
  const savingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = useRef<number>(0);

  const showUploadFailure = (error: MediaUploadError) => {
    const d = useOnboardingDraft.getState();
    if (error.uploaded.mainPhotoUrl) d.setMainPhotoUri(error.uploaded.mainPhotoUrl);
    if (error.uploaded.aboutVideoUrl) d.setAboutVideoUri(error.uploaded.aboutVideoUrl);
    if (error.uploaded.tonightVideoUrl) d.setTonightVideoUri(error.uploaded.tonightVideoUrl);

    const retry = () => {
      setLive(true);
      void commitProfile();
    };
    const photoFailed = error.failed.includes('photo');
    const keptNote = photoFailed
      ? 'Your photo is still selected, so you won’t need to pick it again.'
      : 'Your videos are still on this phone, so you won’t need to record them again.';

    Alert.alert(
      photoFailed ? 'Photo upload failed' : 'Video upload failed',
      `${error.detail}\n\n${keptNote}`,
      photoFailed
        ? [
            { text: 'Not now', style: 'cancel' },
            { text: 'Try again', onPress: retry },
          ]
        : [
            {
              text: 'Skip videos',
              style: 'destructive',
              onPress: () => {
                if (error.failed.includes('About You video')) d.setAboutVideoUri(null);
                if (error.failed.includes('Tonight video')) d.setTonightVideoUri(null);
                retry();
              },
            },
            { text: 'Try again', onPress: retry },
          ],
    );
  };

  const commitProfile = async () => {
    if (savingRef.current) return;
    const current = useOnboardingDraft.getState();
    if (!current.legalConsentAccepted) {
      Alert.alert('Agreements required', 'Accept Terms & Privacy before going live.', [
        { text: 'Review', onPress: () => router.replace('/(onboarding)/agreements') },
      ]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (isBackendConfigured() && userId) {
        const saved = await saveOnboardingProfile(current);
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
      if (isMediaUploadError(error)) {
        showUploadFailure(error);
      } else {
        Alert.alert(
          'Couldn’t save profile',
          friendlyError(error, 'Check your connection and try holding again.'),
        );
      }
    } finally {
      savingRef.current = false;
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

const styles = ScaledSheet.create({
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
