import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText, BrandMark } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { OptionGrid } from '@/components/ui/OptionChip';
import { useContentLayout } from '@/lib/layout';
import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { HeartbeatPulse } from '@/components/live/HeartbeatPulse';
import { copy, availabilityPresets } from '@/constants/copy';
import { FOOD_CUISINES, foodLabel, type FoodCuisine } from '@/constants/tonightVibe';
import { demoCity } from '@/constants/demoTonight';
import { flowCopy, formatLaterHour, formatPeopleInPing } from '@/constants/flow';
import { colors, gradients, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { allowedRadiusPresets, canUseAdvancedFilters, isPlusActive } from '@/lib/entitlements';
import {
  beginPingSegment,
  endPingSegment,
  formatPingClock,
  freePingWarningMs,
  remainingFreePingMs,
} from '@/lib/usage/dailyLimits';
import {
  clearTonightBoost,
} from '@/lib/commerce/sessionCommerce';
import { endLiveSession, startLiveSession } from '@/services/api';
import { formatRemaining, isLiveSessionActive, clampLiveExpiration } from '@/utils/time';
import type { RadiusMiles, TonightActivity } from '@/types';
import { env, isBackendConfigured } from '@/lib/env';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { commerceConfig } from '@/constants/config';

const HOLD_MS = 1200;
const LATER_HOURS = [18, 19, 20, 21] as const;

const PLAN_OPTIONS: {
  value: TonightActivity;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'drinks', label: 'Drinks', icon: 'wine-outline' },
  { value: 'dinner', label: 'Dinner', icon: 'restaurant-outline' },
  { value: 'coffee', label: 'Coffee', icon: 'cafe-outline' },
  { value: 'activity', label: 'Activity', icon: 'walk-outline' },
];

function buildExpiration(preset: string): { expiresAt: Date; label: string } {
  const now = new Date();
  if (preset === 'now') {
    const expires = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return { expiresAt: clampLiveExpiration(expires, now), label: 'Now · 3h' };
  }
  if (preset === '4_7') {
    const expires = new Date(now);
    expires.setHours(19, 0, 0, 0);
    if (expires <= now) expires.setTime(now.getTime() + 3 * 60 * 60 * 1000);
    return { expiresAt: clampLiveExpiration(expires, now), label: '4 PM – 7 PM' };
  }
  if (preset === '7_10') {
    const expires = new Date(now);
    expires.setHours(22, 0, 0, 0);
    if (expires <= now) expires.setTime(now.getTime() + 4 * 60 * 60 * 1000);
    return { expiresAt: clampLiveExpiration(expires, now), label: '7 PM – 10 PM' };
  }
  if (preset === 'after_10') {
    const expires = new Date(now);
    expires.setHours(25, 0, 0, 0);
    return { expiresAt: clampLiveExpiration(expires, now), label: 'After 10 PM' };
  }
  const expires = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  return { expiresAt: clampLiveExpiration(expires, now), label: 'Flexible' };
}

function formatUntil(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatFreeUntilLabel(preset: string): string {
  const { expiresAt } = buildExpiration(preset);
  return formatUntil(expiresAt.toISOString());
}

function formatActivities(activities: string[]): string {
  if (!activities.length) return 'Open';
  return activities
    .map((a) => a.charAt(0).toUpperCase() + a.slice(1).replace(/_/g, ' '))
    .join(' + ');
}

function formatFoodSummary(foods: FoodCuisine[]): string {
  if (!foods.length) return 'Any';
  return foods.slice(0, 2).map(foodLabel).join(', ');
}

export default function LiveHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contentWidth, layoutHeight } = useContentLayout();
  const liveSession = useSessionStore((s) => s.liveSession);
  const setLiveSession = useSessionStore((s) => s.setLiveSession);
  const profile = useSessionStore((s) => s.profile);
  const entitlements = useSessionStore((s) => s.entitlements);
  const datePlannedTonight = useSessionStore((s) => s.datePlannedTonight);
  const pingResultCount = useSessionStore((s) => s.pingResultCount);
  const newInPing = useSessionStore((s) => s.newInPing);
  const setPingResults = useSessionStore((s) => s.setPingResults);
  const [now, setNow] = useState(new Date());
  const [sheet, setSheet] = useState<'none' | 'time' | 'radius' | 'edit' | 'food'>('none');
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<string[]>(['dinner']);
  const [foodCuisines, setFoodCuisines] = useState<FoodCuisine[]>(['italian']);
  const [availability, setAvailability] = useState<string[]>(['7_10']);
  const [radius, setRadius] = useState<RadiusMiles>(10);
  /** null = live now; 18–21 = free later tonight */
  const [laterTonightHour, setLaterTonightHour] = useState<number | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdDone = useRef(false);
  const lastHaptic = useRef(0);
  const warnedLowPing = useRef(false);
  const handledExpire = useRef(false);

  const wantsDinner = activities.includes('dinner');
  const radiusOptions = allowedRadiusPresets(entitlements);
  const plus = isPlusActive(entitlements);
  const plusFilters = canUseAdvancedFilters(entitlements);
  const { readyForLive, missing } = useProfileCompletion();

  const live = useMemo(
    () => (liveSession ? isLiveSessionActive(liveSession, now) : false),
    [liveSession, now],
  );

  const city =
    profile?.neighborhoodLabel?.split(',')[0]?.trim() ||
    profile?.hometown ||
    demoCity.label;

  const compact = layoutHeight < 780;
  const iconSize = Math.min(
    compact ? 120 : layoutHeight < 900 ? 148 : 168,
    Math.round(contentWidth * 0.4),
  );
  const pulseSize = Math.round(iconSize * 1.55);
  const logoWidth = Math.round(Math.min(compact ? 132 : 160, Math.max(120, contentWidth * 0.38)));
  const kickerSize = compact ? 24 : 30;

  const activeFoods = live ? (liveSession?.foodCuisines ?? foodCuisines) : foodCuisines;
  const foodBit = wantsDinner ? formatFoodSummary(activeFoods) : '';
  const untilLabel = live
    ? formatUntil(liveSession?.availableUntil ?? liveSession!.expiresAt)
    : formatFreeUntilLabel(availability[0] ?? '7_10');
  const radiusLabel = live ? (liveSession?.radiusMiles ?? radius) : radius;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // If we restarted without an active session, close any orphaned Ping meter segment.
  useEffect(() => {
    if (!live) {
      void endPingSegment();
      void clearTonightBoost();
    }
  }, [live]);

  // Free Ping meter: soft warn at 5 min, hard stop + paywall at 0.
  useEffect(() => {
    if (!live || !liveSession || plus) return;
    const msLeft = Math.max(0, new Date(liveSession.expiresAt).getTime() - now.getTime());

    if (msLeft > 0 && msLeft <= freePingWarningMs() && !warnedLowPing.current) {
      warnedLowPing.current = true;
      Alert.alert(
        `${commerceConfig.freePingWarningMinutes} minutes left tonight`,
        'Keep Ping active with DateToday+',
        [
          { text: 'Keep going', style: 'cancel' },
          { text: 'Get DateToday+', onPress: () => router.push('/paywall') },
        ],
      );
    }

    if (msLeft <= 0 && !handledExpire.current) {
      handledExpire.current = true;
      void (async () => {
        try {
          if (isBackendConfigured() || env.supabaseUrl) await endLiveSession(liveSession.id);
        } catch {
          /* ignore */
        }
        await endPingSegment();
        await clearTonightBoost();
        setLiveSession(null);
        setPingResults(0, 0);
        Alert.alert(
          'Your free Ping ended',
          `Go unlimited tonight with DateToday+\n${commerceConfig.plusWeeklyFallbackPrice}/week · ${commerceConfig.plusMonthlyFallbackPrice}/month`,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Get DateToday+', onPress: () => router.push('/paywall') },
          ],
        );
      })();
    }
  }, [live, liveSession, now, plus, router, setLiveSession, setPingResults]);

  useEffect(() => {
    return () => {
      if (holdRef.current) clearInterval(holdRef.current);
    };
  }, []);

  const clearHold = () => {
    if (holdRef.current) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
    setHoldProgress(0);
    holdDone.current = false;
  };

  const activateLive = async () => {
    if (!readyForLive) {
      Alert.alert(
        'Finish setup to Go Live',
        missing.slice(0, 4).join('\n') || 'Complete your profile first.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Finish profile',
            onPress: () => router.push('/(tabs)/profile'),
          },
        ],
      );
      return;
    }
    try {
      setLoading(true);
      const preset = availability[0] ?? 'flexible';
      let { expiresAt, label } = buildExpiration(preset);

      // Free: one Ping meter — clamp session to remaining daily minutes.
      if (!plus) {
        const leftMs = await remainingFreePingMs(entitlements);
        if (leftMs <= 0) {
          Alert.alert(
            'Your free Ping ended',
            `Go unlimited tonight with DateToday+\n${commerceConfig.plusWeeklyFallbackPrice}/week · ${commerceConfig.plusMonthlyFallbackPrice}/month`,
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Get DateToday+', onPress: () => router.push('/paywall') },
            ],
          );
          return;
        }
        const capped = new Date(Date.now() + leftMs);
        if (capped.getTime() < expiresAt.getTime()) {
          expiresAt = capped;
          label = `${Math.max(1, Math.round(leftMs / 60_000))} min left today`;
        }
      }

      let latitude = 33.7838;
      let longitude = -84.383;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      }

      warnedLowPing.current = false;
      handledExpire.current = false;

      // Firebase is primary — always publish a real beacon (no silent local-only pool).
      if (isBackendConfigured()) {
        const session = await startLiveSession({
          latitude,
          longitude,
          radiusMiles: radius,
          expiresAt: expiresAt.toISOString(),
          activities: activities as TonightActivity[],
          foodCuisines: wantsDinner ? foodCuisines : [],
          availabilityLabel: label,
          availableUntil: expiresAt.toISOString(),
          laterTonightHour,
        });
        setLiveSession({ ...session, isBoosted: false, boostedAt: null });
        if (!plus) await beginPingSegment();
        setPingResults(0, 0);
        setSheet('none');
        router.push('/(tabs)/pings');
        return;
      }

      if (!env.supabaseUrl) {
        const localSession = {
          id: `local-${Date.now()}`,
          userId: 'local',
          startedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          endedAt: null,
          status: 'active' as const,
          radiusMiles: radius,
          availableFrom: null,
          availableUntil: expiresAt.toISOString(),
          availabilityLabel: label,
          activities: activities as TonightActivity[],
          foodCuisines: wantsDinner ? foodCuisines : [],
          laterTonightHour,
          availabilityMode: (laterTonightHour != null ? 'later' : 'live') as 'live' | 'later',
          isBoosted: false,
          boostedAt: null,
        };
        setLiveSession(localSession);
        if (!plus) await beginPingSegment();
        setPingResults(0, 0);
        setSheet('none');
        router.push('/(tabs)/pings');
        return;
      }

      const session = await startLiveSession({
        latitude,
        longitude,
        radiusMiles: radius,
        expiresAt: expiresAt.toISOString(),
        activities: activities as TonightActivity[],
        foodCuisines: wantsDinner ? foodCuisines : [],
        availabilityLabel: label,
        availableUntil: expiresAt.toISOString(),
        laterTonightHour,
      });
      setLiveSession({ ...session, isBoosted: false, boostedAt: null });
      if (!plus) await beginPingSegment();
      setPingResults(0, 0);
      setSheet('none');
      router.push('/(tabs)/pings');
    } catch (error) {
      Alert.alert('Could not go live', error instanceof Error ? error.message : 'Try again');
    } finally {
      setLoading(false);
    }
  };

  const onHoldStart = () => {
    if (live || loading) return;
    if (!readyForLive) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Finish setup to Go Live',
        `Still needed:\n${missing.slice(0, 5).join('\n')}`,
        [
          { text: 'OK', style: 'cancel' },
          { text: 'Finish profile', onPress: () => router.push('/(tabs)/profile') },
        ],
      );
      return;
    }
    clearHold();
    const started = Date.now();
    lastHaptic.current = 0;
    holdRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / HOLD_MS);
      setHoldProgress(p);
      const tick = Math.floor(p * 10);
      if (tick > lastHaptic.current && tick < 10) {
        lastHaptic.current = tick;
        void Haptics.selectionAsync();
      }
      if (p >= 1 && !holdDone.current) {
        holdDone.current = true;
        if (holdRef.current) clearInterval(holdRef.current);
        holdRef.current = null;
        setHoldProgress(0);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void activateLive();
      }
    }, 16);
  };

  const onStop = () => {
    Alert.alert(copy.stopConfirmTitle, copy.stopConfirmBody, [
      { text: copy.stayLive, style: 'cancel' },
      {
        text: copy.goOffline,
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            if (isBackendConfigured() || env.supabaseUrl) await endLiveSession(liveSession?.id);
            if (!plus) await endPingSegment();
            await clearTonightBoost();
            setLiveSession(null);
            setPingResults(0, 0);
          } catch (error) {
            Alert.alert('Could not go offline', error instanceof Error ? error.message : 'Try again');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const togglePlan = (value: string) => {
    setActivities((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter((v) => v !== value);
      }
      return [...prev, value];
    });
  };

  const toggleFood = (value: FoodCuisine) => {
    setFoodCuisines((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((v) => v !== value);
        return next.length ? next : prev;
      }
      // Free: one cuisine. Plus: multiple.
      if (!plusFilters) return [value];
      return [...prev, value];
    });
  };

  const onRadiusPick = (value: string) => {
    const miles = Number(value) as RadiusMiles;
    if (!plusFilters && miles > 25) {
      setSheet('none');
      router.push('/paywall');
      return;
    }
    setRadius(miles);
  };

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <LinearGradient
        colors={
          live
            ? ['rgba(34,229,139,0.14)', 'rgba(124,58,237,0.18)', '#09090B']
            : ['rgba(124,58,237,0.28)', 'rgba(12,8,20,0.95)', '#050508']
        }
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 8) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces
      >
        {!live ? (
          <>
            <View style={styles.heroMark}>
              <DtIconHero size={88} mode="breathe" atmosphere="soft" />
            </View>

            <View style={styles.heroCopy}>
              <AppText style={styles.heroTitle}>
                Who's out <AppText style={styles.heroTitleAccent}>tonight?</AppText>
              </AppText>
              <AppText style={styles.heroSub}>
                Find real people, real plans,{' '}
                <AppText style={styles.heroSubAccent}>right now.</AppText>
              </AppText>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <AppText style={styles.sectionLabel}>⚡ TONIGHT PLANS</AppText>
                <AppText style={styles.sectionHint}>What are you in the mood for?</AppText>
              </View>

              <View style={styles.planCards}>
                {PLAN_OPTIONS.map((opt) => {
                  const on = activities.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => togglePlan(opt.value)}
                      style={[styles.planCard, on && styles.planCardOn]}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={22}
                        color={on ? colors.brandBright : colors.text}
                      />
                      <AppText style={[styles.planCardLabel, on && styles.planCardLabelOn]}>
                        {opt.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.settingList}>
                <Pressable style={styles.settingRow} onPress={() => setSheet('time')}>
                  <Ionicons name="time-outline" size={18} color={colors.brandBright} />
                  <AppText style={styles.settingKey}>Available until</AppText>
                  <AppText style={styles.settingVal}>{untilLabel}</AppText>
                  <AppText style={styles.settingChevron}>›</AppText>
                </Pressable>
                <Pressable style={styles.settingRow} onPress={() => setSheet('radius')}>
                  <Ionicons name="location-outline" size={18} color={colors.brandBright} />
                  <AppText style={styles.settingKey}>Distance</AppText>
                  <AppText style={styles.settingVal}>Within {radiusLabel} miles</AppText>
                  <AppText style={styles.settingChevron}>›</AppText>
                </Pressable>
                {wantsDinner ? (
                  <Pressable style={styles.settingRow} onPress={() => setSheet('food')}>
                    <Ionicons name="options-outline" size={18} color={colors.brandBright} />
                    <AppText style={styles.settingKey}>Dinner preference</AppText>
                    <AppText style={styles.settingVal}>
                      {formatFoodSummary(foodCuisines)} · Change
                    </AppText>
                    <AppText style={styles.settingChevron}>›</AppText>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <AppText style={styles.sectionLabel}>⚡ FREE LATER?</AppText>
                <AppText style={styles.sectionHint}>Show up when you're free.</AppText>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.laterRow}
              >
                <Pressable
                  onPress={() => setLaterTonightHour(null)}
                  style={[
                    styles.laterPill,
                    laterTonightHour == null && styles.laterPillOn,
                  ]}
                >
                  <AppText
                    style={[
                      styles.laterPillText,
                      laterTonightHour == null && styles.laterPillTextOn,
                    ]}
                  >
                    Live now
                  </AppText>
                </Pressable>
                {LATER_HOURS.map((hour) => {
                  const on = laterTonightHour === hour;
                  return (
                    <Pressable
                      key={hour}
                      onPress={() => setLaterTonightHour(hour)}
                      style={[styles.laterPill, on && styles.laterPillOn]}
                    >
                      <AppText style={[styles.laterPillText, on && styles.laterPillTextOn]}>
                        {formatLaterHour(hour)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable style={styles.plusCard} onPress={() => router.push('/paywall')}>
              <Ionicons name="sparkles" size={22} color={colors.brandBright} />
              <View style={styles.plusCopy}>
                <View style={styles.plusTitleRow}>
                  <AppText style={styles.plusTitle}>More time. More conversation.</AppText>
                  {!plus ? (
                    <View style={styles.plusBadge}>
                      <AppText style={styles.plusBadgeText}>PLUS</AppText>
                    </View>
                  ) : null}
                </View>
                <AppText style={styles.plusBody}>{flowCopy.fineTuneBody}</AppText>
              </View>
              <AppText style={styles.settingChevron}>›</AppText>
            </Pressable>

            <View style={styles.ctaStack}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hold to go live"
                disabled={loading}
                onPressIn={onHoldStart}
                onPressOut={clearHold}
                style={[styles.goLiveBtn, loading && styles.goLiveDisabled]}
              >
                <LinearGradient
                  colors={[...gradients.brand]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.goLiveGrad}
                >
                  {holdProgress > 0.02 ? (
                    <View
                      pointerEvents="none"
                      style={[styles.goLiveFill, { width: `${Math.round(holdProgress * 100)}%` }]}
                    />
                  ) : null}
                  <AppText style={styles.goLiveLabel}>
                    {loading
                      ? 'Going live…'
                      : holdProgress > 0.02
                        ? `Keep holding… ${Math.round(holdProgress * 100)}%`
                        : 'Hold to go live'}
                  </AppText>
                </LinearGradient>
              </Pressable>
              <AppText style={styles.goLiveHint}>
                Puts you in tonight’s pool so people nearby can find you.
              </AppText>
              <Button
                label="Browse who’s live →"
                variant="secondary"
                onPress={() => router.push('/(tabs)/pings')}
              />
              <AppText style={styles.browseHint}>
                Peek at the feed without going live.
              </AppText>
            </View>
          </>
        ) : (
          <>
            <View style={styles.header}>
              <BrandMark width={logoWidth} />
              <View style={[styles.statusPill, styles.statusLive]}>
                <View style={[styles.statusDot, styles.statusDotLive]} />
                <AppText
                  style={[
                    styles.statusText,
                    styles.statusTextLive,
                    datePlannedTonight && styles.statusDate,
                  ]}
                >
                  {datePlannedTonight ? 'DATE PLANNED' : 'PINGING'}
                </AppText>
              </View>
            </View>

            <AppText style={styles.cityLine}>{city.toUpperCase()}</AppText>

            <View style={styles.stage}>
              <AppText
                style={[styles.kicker, { fontSize: kickerSize, lineHeight: kickerSize + 6 }]}
              >
                YOU'RE LIVE
              </AppText>

              <View style={[styles.controlWrap, { width: pulseSize, height: pulseSize }]}>
                <HeartbeatPulse active size={pulseSize} />
                <DtIconHero
                  size={iconSize}
                  mode="live"
                  progress={100}
                  live
                  atmosphere="soft"
                  onPress={onStop}
                />
              </View>

              <AppText style={styles.holdCue}>TAP TO GO OFFLINE</AppText>
              <AppText style={styles.metaLive}>
                {[
                  formatActivities(liveSession?.activities ?? activities),
                  foodBit || null,
                  `within ${radiusLabel} mi`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
              <AppText style={styles.timer}>
                {plus
                  ? `${formatRemaining(liveSession!.expiresAt, now)} remaining`
                  : `PINGING · ${formatPingClock(
                      Math.max(
                        0,
                        new Date(liveSession!.expiresAt).getTime() - now.getTime(),
                      ),
                    )} LEFT`}
              </AppText>
              {liveSession?.isBoosted ? (
                <AppText style={styles.boostedBadge}>BOOSTED · FRONT OF POOL</AppText>
              ) : null}
              <AppText style={styles.pingHint}>
                People who match your vibe appear in Ping — within {radiusLabel} miles.
              </AppText>
              {!liveSession?.isBoosted ? (
                <Pressable onPress={() => router.push('/paywall/boost')} hitSlop={8}>
                  <AppText style={styles.boostLink}>Tonight Boost · $4.99 →</AppText>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.liveActions}>
              {newInPing > 0 ? (
                <Pressable
                  onPress={() => router.push('/(tabs)/pings')}
                  style={styles.newPingBanner}
                >
                  <AppText style={styles.newPingText}>
                    {newInPing} NEW {newInPing === 1 ? 'PERSON' : 'PEOPLE'} IN YOUR PING
                  </AppText>
                </Pressable>
              ) : null}
              <Button
                label={
                  pingResultCount > 0
                    ? `See ${pingResultCount} nearby ${pingResultCount === 1 ? 'match' : 'matches'} →`
                    : 'See people in your radius →'
                }
                onPress={() => router.push('/(tabs)/pings')}
              />
              <AppText style={styles.goLiveHint}>
                Open Ping to browse people free tonight who match your plans.
              </AppText>
              <View style={styles.row}>
                <Button
                  label={copy.editTonight}
                  variant="secondary"
                  onPress={() => setSheet('edit')}
                  style={styles.flex}
                />
                <Button
                  label="GO OFFLINE"
                  variant="ghost"
                  loading={loading}
                  onPress={onStop}
                  style={styles.flex}
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={sheet !== 'none'} animationType="slide" transparent>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {sheet === 'food' ? (
              <>
                <AppText variant="title">Dinner preference</AppText>
                <AppText variant="secondary" style={styles.sheetHint}>
                  {plusFilters
                    ? 'Pick as many as you like.'
                    : 'Pick one for tonight. Multiple cuisines are DateToday+ ✦'}
                </AppText>
                <OptionGrid
                  options={FOOD_CUISINES.map((c) => ({
                    value: c.value,
                    label: c.label,
                  }))}
                  values={foodCuisines}
                  multi={plusFilters}
                  onToggle={(value) => toggleFood(value as FoodCuisine)}
                />
              </>
            ) : null}

            {sheet === 'time' || sheet === 'edit' ? (
              <>
                <AppText variant="title">Available until</AppText>
                <OptionGrid
                  options={availabilityPresets.filter((p) => p.value !== 'custom')}
                  values={availability}
                  multi={false}
                  onToggle={(value) => setAvailability([value])}
                />
              </>
            ) : null}

            {sheet === 'radius' || sheet === 'edit' ? (
              <>
                <AppText variant="title" style={sheet === 'edit' ? styles.sheetTitle : undefined}>
                  Distance
                </AppText>
                <AppText variant="secondary" style={styles.sheetHint}>
                  {plusFilters
                    ? 'Exact distance for your Ping.'
                    : 'Free includes 5, 10, and 25 mi. Exact radius up to 50 is DateToday+ ✦'}
                </AppText>
                <OptionGrid
                  options={radiusOptions.map((n) => ({
                    value: String(n),
                    label: `${n} mi`,
                  }))}
                  values={[String(radius)]}
                  multi={false}
                  onToggle={onRadiusPick}
                />
                {!plusFilters ? (
                  <OptionGrid
                    options={[
                      { value: '15', label: '15 mi ✦' },
                      { value: '50', label: '50 mi ✦' },
                    ]}
                    values={[]}
                    multi={false}
                    onToggle={onRadiusPick}
                  />
                ) : null}
              </>
            ) : null}

            {sheet === 'edit' && live ? (
              <>
                <AppText variant="title" style={styles.sheetTitle}>
                  Tonight
                </AppText>
                <OptionGrid
                  options={PLAN_OPTIONS.map(({ value, label }) => ({ value, label }))}
                  values={activities}
                  onToggle={(value) => togglePlan(value)}
                />
                {wantsDinner ? (
                  <>
                    <AppText variant="title" style={styles.sheetTitle}>
                      Dinner preference
                    </AppText>
                    <OptionGrid
                      options={FOOD_CUISINES.map((c) => ({
                        value: c.value,
                        label: c.label,
                      }))}
                      values={foodCuisines}
                      multi={plusFilters}
                      onToggle={(value) => toggleFood(value as FoodCuisine)}
                    />
                  </>
                ) : null}
                <Button
                  label="Save"
                  onPress={() => {
                    if (liveSession) {
                      const { expiresAt, label } = buildExpiration(availability[0] ?? 'flexible');
                      setLiveSession({
                        ...liveSession,
                        activities: activities as TonightActivity[],
                        foodCuisines: wantsDinner ? foodCuisines : [],
                        radiusMiles: radius,
                        availabilityLabel: label,
                        availableUntil: expiresAt.toISOString(),
                        expiresAt: expiresAt.toISOString(),
                      });
                    }
                    setSheet('none');
                  }}
                />
              </>
            ) : null}

            <Button label="Done" variant="ghost" onPress={() => setSheet('none')} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  heroMark: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  heroCopy: {
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  heroTitleAccent: {
    color: colors.brandBright,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heroSub: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  heroSubAccent: {
    color: colors.brandBright,
    fontSize: 15,
    fontWeight: '700',
  },
  section: { gap: 12 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionHint: {
    color: colors.textSecondary,
    fontSize: 12,
    flexShrink: 1,
    textAlign: 'right',
  },
  planCards: {
    flexDirection: 'row',
    gap: 10,
  },
  planCard: {
    flex: 1,
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  planCardOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(168,85,247,0.12)',
    shadowColor: colors.brandBright,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  planCardLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  planCardLabelOn: {
    color: colors.brandBright,
  },
  settingList: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  settingKey: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  settingVal: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '42%',
    textAlign: 'right',
  },
  settingChevron: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: '300',
  },
  laterRow: {
    gap: 8,
    paddingRight: 8,
  },
  laterPill: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  laterPillOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(168,85,247,0.28)',
    shadowColor: colors.brandBright,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  laterPillText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  laterPillTextOn: {
    color: colors.text,
  },
  plusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  plusCopy: { flex: 1, gap: 4 },
  plusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  plusTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  plusBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  ctaStack: {
    gap: 10,
    marginTop: spacing.xs,
  },
  goLiveBtn: {
    minHeight: 56,
    borderRadius: 999,
    overflow: 'hidden',
  },
  goLiveDisabled: {
    opacity: 0.55,
  },
  goLiveGrad: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  goLiveFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  goLiveLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
    zIndex: 1,
  },
  goLiveHint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: -2,
  },
  browseHint: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: -4,
    opacity: 0.9,
  },
  plusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(168,85,247,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.45)',
  },
  plusBadgeText: {
    color: colors.brandBright,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: 12,
  },
  cityLine: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: -4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  statusLive: { backgroundColor: 'rgba(34,229,139,0.14)' },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
  },
  statusDotLive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.live,
    borderWidth: 0,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statusTextLive: { color: colors.live },
  statusDate: { color: colors.brandBright },
  stage: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.sm,
  },
  kicker: {
    color: colors.text,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  metaLive: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  timer: {
    color: colors.live,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  boostedBadge: {
    color: colors.brandBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  boostLink: {
    color: colors.brandBright,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  controlWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  holdCue: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  pingHint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  newPingBanner: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(34,229,139,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.4)',
    alignItems: 'center',
  },
  newPingText: {
    color: colors.live,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  liveActions: {
    gap: 10,
    paddingTop: spacing.xs,
  },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '88%',
  },
  sheetHint: { marginBottom: 4, lineHeight: 18 },
  sheetTitle: { marginTop: spacing.sm },
});
