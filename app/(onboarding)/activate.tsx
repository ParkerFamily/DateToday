import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { friendlyError } from '@/lib/errors';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { AppText } from '@/components/ui/AppText';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { Screen } from '@/components/ui/Screen';
import { colors, radii, spacing } from '@/constants/theme';
import { requestNotificationPermission } from '@/features/notifications/permission';
import { registerPushTokenAsync } from '@/features/notifications/push';
import { LIVE_SESSION_MS, liveSessionExpiry, nextNightlyReset } from '@/constants/liveConfig';
import { freeUntilOptions, pickFreeUntil } from '@/features/live/freeUntil';
import { isBackendConfigured } from '@/lib/env';
import { startLiveSession } from '@/services/api';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import type { TonightActivity } from '@/types';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { ScaledSheet } from '@/lib/scale';

const WORDS: { value: TonightActivity; label: string }[] = [
  { value: 'dinner', label: 'DINNER' },
  { value: 'drinks', label: 'DRINKS' },
  { value: 'coffee', label: 'COFFEE' },
  { value: 'movie', label: 'MOVIE' },
  { value: 'activity', label: 'ACTIVITY' },
  { value: 'walk', label: 'WALK' },
  { value: 'surprise', label: 'ANYTHING' },
];

export default function ActivateLiveScreen() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const setLiveSession = useSessionStore((s) => s.setLiveSession);
  const setLocationGranted = useSessionStore((s) => s.setLocationGranted);
  const [phase, setPhase] = useState<'mood' | 'until' | 'live'>('mood');
  const [loading, setLoading] = useState(false);
  const untilOptions = useMemo(() => freeUntilOptions(new Date()), [phase]);
  const [untilValue, setUntilValue] = useState<string | null>(null);
  const untilPick = pickFreeUntil(untilOptions, untilValue);

  /** Real location only: going Live at a made-up spot would show people the wrong distance. */
  const currentPosition = async (): Promise<{ latitude: number; longitude: number } | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === 'granted';
    draft.setLocationEnabled(granted);
    setLocationGranted(granted);
    if (!granted) {
      Alert.alert(
        'Turn on location to go Live',
        'DateToday uses your approximate location so people near you can find you tonight.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return null;
    }
    if (Platform.OS === 'android' && !(await Location.hasServicesEnabledAsync().catch(() => true))) {
      const turnedOn = await Location.enableNetworkProviderAsync().then(() => true, () => false);
      if (!turnedOn) {
        Alert.alert('Turn on Location to go Live', 'Your phone’s Location is off. Turn it on in Quick Settings, then try again.');
        return null;
      }
    }
    const position =
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ])) ??
      (await Location.getLastKnownPositionAsync(
        Platform.OS === 'android' ? { maxAge: 30 * 60 * 1000 } : undefined,
      ).catch(() => null));
    if (!position?.coords) {
      Alert.alert('Couldn’t find your location', 'Check your signal and try again.');
      return null;
    }
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  };

  const confirmLive = async () => {
    try {
      setLoading(true);
      if (!draft.notificationsEnabled) {
        const granted = await requestNotificationPermission();
        draft.setNotificationsEnabled(granted);
      }
      void registerPushTokenAsync();

      if (!isBackendConfigured()) {
        router.replace('/(tabs)/live');
        return;
      }
      const coords = await currentPosition();
      if (!coords) return;

      const now = new Date();
      const until = pickFreeUntil(freeUntilOptions(now), untilPick.value);
      const expiresAt = liveSessionExpiry(now);
      const session = await startLiveSession({
        ...coords,
        radiusMiles: draft.radiusMiles,
        expiresAt: expiresAt.toISOString(),
        activities: draft.activities.length ? draft.activities : ['drinks'],
        foodCuisines: [],
        availabilityLabel: `Until ${until.label}`,
        availableUntil: until.expiresAt.toISOString(),
        laterTonightHour: null,
        liveDurationMs: LIVE_SESSION_MS,
        nightResetAt: nextNightlyReset(now).toISOString(),
      });
      setLiveSession({ ...session, isBoosted: false, boostedAt: null });
      draft.setAvailableUntilLabel(until.label);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setPhase('live');
      setTimeout(() => router.replace('/discovery'), 1600);
    } catch (error) {
      Alert.alert('Could not go live', friendlyError(error, 'Try again'));
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
            {untilOptions.map((option) => {
              const on = untilPick.value === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setUntilValue(option.value);
                  }}
                  style={[styles.untilChip, on && styles.untilChipOn]}
                >
                  <AppText style={[styles.untilText, on && styles.untilTextOn]}>{option.label}</AppText>
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

const styles = ScaledSheet.create({
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
