import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { colors, radii, spacing } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { requestNotificationPermission } from '@/features/notifications/permission';
import { startLiveSession } from '@/services/api';
import { clampLiveExpiration } from '@/utils/time';
import { env } from '@/lib/env';
import type { TonightActivity } from '@/types';

const WORDS: { value: TonightActivity; label: string }[] = [
  { value: 'dinner', label: 'DINNER' },
  { value: 'drinks', label: 'DRINKS' },
  { value: 'coffee', label: 'COFFEE' },
  { value: 'movie', label: 'MOVIE' },
  { value: 'activity', label: 'ACTIVITY' },
  { value: 'walk', label: 'WALK' },
  { value: 'surprise', label: 'ANYTHING' },
];

const UNTIL = ['9:00 PM', '11:00 PM', '1:00 AM'] as const;

export default function ActivateLiveScreen() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const setLiveSession = useSessionStore((s) => s.setLiveSession);
  const setLocationGranted = useSessionStore((s) => s.setLocationGranted);
  const [phase, setPhase] = useState<'mood' | 'until' | 'live'>('mood');
  const [loading, setLoading] = useState(false);

  const confirmLive = async () => {
    try {
      setLoading(true);
      if (!draft.notificationsEnabled) {
        const granted = await requestNotificationPermission();
        draft.setNotificationsEnabled(granted);
      }
      if (!draft.locationEnabled) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === 'granted';
        draft.setLocationEnabled(granted);
        setLocationGranted(granted);
      }

      let latitude = 33.7838;
      let longitude = -84.383;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {
        /* demo */
      }

      const expires = clampLiveExpiration(new Date(Date.now() + 4 * 60 * 60 * 1000));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (env.supabaseUrl && !env.supabaseUrl.includes('your-project')) {
        const session = await startLiveSession({
          latitude,
          longitude,
          radiusMiles: draft.radiusMiles,
          expiresAt: expires.toISOString(),
          activities: draft.activities.length ? draft.activities : ['drinks'],
          availabilityLabel: `Until ${draft.availableUntilLabel}`,
          availableUntil: expires.toISOString(),
        });
        setLiveSession(session);
      } else {
        setLiveSession({
          id: 'local-onboarding',
          userId: 'local',
          startedAt: new Date().toISOString(),
          expiresAt: expires.toISOString(),
          endedAt: null,
          status: 'active',
          radiusMiles: draft.radiusMiles,
          availableFrom: null,
          availableUntil: expires.toISOString(),
          availabilityLabel: `Until ${draft.availableUntilLabel}`,
          activities: draft.activities,
        });
      }

      setPhase('live');
      setTimeout(() => router.replace('/discovery'), 1600);
    } catch (error) {
      Alert.alert('Could not go live', error instanceof Error ? error.message : 'Try again');
    } finally {
      setLoading(false);
    }
  };

  if (phase === 'live') {
    return (
      <Screen>
        <View style={styles.liveCenter}>
          <DtIconHero size={140} mode="live" progress={100} live />
          <LiveBadge label="YOU'RE PINGING" />
          <AppText style={styles.liveTitle}>YOU'RE PINGING ⚡</AppText>
          <AppText style={styles.liveSub}>
            You're live until {draft.availableUntilLabel}.{'\n'}
            You can close DateToday. We'll ping you.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.root}>
        <DtIconHero size={72} mode="live" progress={100} live />
        <AppText style={styles.title}>
          {phase === 'mood' ? 'What are you on tonight?' : 'How late are you free?'}
        </AppText>

        {phase === 'mood' ? (
          <View style={styles.cloud}>
            {WORDS.map((w) => {
              const on = draft.activities.includes(w.value);
              return (
                <Pressable
                  key={w.value}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    draft.toggleActivity(w.value);
                  }}
                  style={[styles.word, on && styles.wordOn]}
                >
                  <AppText style={[styles.wordText, on && styles.wordTextOn]}>{w.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.untilChips}>
            {UNTIL.map((label) => {
              const on = draft.availableUntilLabel === label;
              return (
                <Pressable
                  key={label}
                  onPress={() => draft.setAvailableUntilLabel(label)}
                  style={[styles.untilChip, on && styles.untilChipOn]}
                >
                  <AppText style={[styles.untilText, on && styles.untilTextOn]}>{label}</AppText>
                </Pressable>
              );
            })}
            <AppText style={styles.radius}>{draft.radiusMiles} miles from me</AppText>
          </View>
        )}

        <View style={styles.spacer} />
        {phase === 'mood' ? (
          <PrimaryCta
            label="Continue"
            showArrow={false}
            disabled={draft.activities.length === 0}
            onPress={() => setPhase('until')}
          />
        ) : (
          <PrimaryCta
            label="⚡ START PINGING"
            showArrow={false}
            loading={loading}
            onPress={confirmLive}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
  },
  title: {
    alignSelf: 'stretch',
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  cloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  word: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  wordOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brandBright,
  },
  wordText: { color: colors.textSecondary, fontWeight: '800', letterSpacing: 1 },
  wordTextOn: { color: colors.text },
  untilChips: { gap: 10, alignItems: 'center', width: '100%' },
  untilChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  untilChipOn: {
    borderColor: colors.live,
    backgroundColor: 'rgba(34,229,139,0.12)',
  },
  untilText: { color: colors.textSecondary, fontWeight: '700' },
  untilTextOn: { color: colors.live },
  radius: { color: colors.textSecondary, marginTop: 8 },
  spacer: { flex: 1 },
  liveCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: spacing.lg,
  },
  liveTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  liveSub: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
