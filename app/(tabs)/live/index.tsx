import { DiscoverFeed } from '@/components/discover/DiscoverFeed';
import { friendlyError } from '@/lib/errors';
import { syncLiveSessionPatch } from '@/features/live/restoreLiveSession';
import { LiveStatusBar } from '@/components/live/LiveStatusBar';
import { QuizPromoCard } from '@/components/profile/QuizPromoCard';
import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { OptionGrid } from '@/components/ui/OptionChip';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { flowCopy, formatLaterHour } from '@/constants/flow';
import { colors, gradients, spacing } from '@/constants/theme';
import { FOOD_CUISINES, foodLabel, type FoodCuisine } from '@/constants/tonightVibe';
import { AFTER_HOURS_TAGS, type AfterHoursTag } from '@/constants/afterHours';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import {
    clearTonightBoost,
} from '@/lib/commerce/sessionCommerce';
import { allowedRadiusPresets, canUseAdvancedFilters, isPlusActive } from '@/lib/entitlements';
import { env, isBackendConfigured } from '@/lib/env';
import { registerPushTokenAsync } from '@/features/notifications/push';
import { activeFilterLabels } from '@/features/discover/applyFilters';
import { useDiscoverFilters } from '@/store/discoverFilters';
import { endLiveSession, startLiveSession } from '@/services/api';
import { useSessionStore } from '@/store/session';
import type { RadiusMiles, TonightActivity } from '@/types';
import { isLiveSessionActive } from '@/utils/time';
import { freeUntilOptions, needsReconfirm, pickFreeUntil } from '@/features/live/freeUntil';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    AppState,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    FadeIn,
    FadeInDown,
    FadeOut,
    FadeOutUp,
    LayoutAnimationConfig,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledSheet, rs } from '@/lib/scale';

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

/** Recomputed at tap time so a screen left open doesn't publish a stale end time. */
function buildExpiration(value: string, laterHour: number | null): { expiresAt: Date; label: string } {
  const pick = pickFreeUntil(freeUntilOptions(new Date(), laterHour), value);
  return { expiresAt: pick.expiresAt, label: `Until ${pick.label}` };
}

function formatUntil(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
  const liveSession = useSessionStore((s) => s.liveSession);
  const setLiveSession = useSessionStore((s) => s.setLiveSession);
  const entitlements = useSessionStore((s) => s.entitlements);
  const datePlannedTonight = useSessionStore((s) => s.datePlannedTonight);
  const setPingResults = useSessionStore((s) => s.setPingResults);
  const [now, setNow] = useState(new Date());
  const [sheet, setSheet] = useState<'none' | 'time' | 'radius' | 'edit' | 'food'>('none');
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<string[]>(['dinner']);
  const [foodCuisines, setFoodCuisines] = useState<FoodCuisine[]>(['italian']);
  const [freeUntil, setFreeUntil] = useState<string>('23');
  const [radius, setRadius] = useState<RadiusMiles>(10);
  /** null = live now; 18–21 = free later tonight */
  const [laterTonightHour, setLaterTonightHour] = useState<number | null>(null);
  const [afterHoursTags, setAfterHoursTags] = useState<AfterHoursTag[]>([]);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdFill = useSharedValue(0);
  const holdFillStyle = useAnimatedStyle(() => ({ width: `${holdFill.value * 100}%` }));
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdDone = useRef(false);
  const lastHaptic = useRef(0);
  const [leaving, setLeaving] = useState(false);
  const [offlineToast, setOfflineToast] = useState(false);

  const wantsDinner = activities.includes('dinner');
  const radiusOptions = allowedRadiusPresets(entitlements);
  const plus = isPlusActive(entitlements);
  const plusFilters = canUseAdvancedFilters(entitlements);
  const discoverFilters = useDiscoverFilters();
  const filterCount = activeFilterLabels(discoverFilters, { plus: plusFilters }).length;
  const { readyForLive, missing } = useProfileCompletion();

  const live = useMemo(
    () => (liveSession ? isLiveSessionActive(liveSession, now) : false),
    [liveSession, now],
  );

  const activeFoods = live ? (liveSession?.foodCuisines ?? foodCuisines) : foodCuisines;
  const foodBit = wantsDinner ? formatFoodSummary(activeFoods) : '';
  const untilOptions = useMemo(() => freeUntilOptions(now, laterTonightHour), [now, laterTonightHour]);
  const untilPick = pickFreeUntil(untilOptions, freeUntil);
  const radiusLabel = live ? (liveSession?.radiusMiles ?? radius) : radius;
  const showLateNight = now.getHours() >= 20 || now.getHours() < 5 || untilPick.value === 'late';

  // The countdown lives in LiveStatusBar; this screen only needs a coarse clock plus a wake-up at expiry.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  const expiresAt = liveSession?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => setNow(new Date()), Math.min(ms + 250, 2_147_000_000));
    return () => clearTimeout(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!live) void clearTonightBoost();
  }, [live]);

  useEffect(() => {
    if (!offlineToast) return;
    const id = setTimeout(() => setOfflineToast(false), 2400);
    return () => clearTimeout(id);
  }, [offlineToast]);

  const leaveProgress = useSharedValue(0);
  // Reset only once live again: resetting on exit would un-dim the feed while it fades out.
  useEffect(() => {
    if (!live) return;
    leaveProgress.value = 0;
    setLeaving(false);
  }, [live, leaveProgress]);
  useEffect(() => {
    leaveProgress.value = withTiming(leaving ? 1 : 0, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
    });
  }, [leaving, leaveProgress]);
  const leavingStyle = useAnimatedStyle(() => ({
    opacity: 1 - leaveProgress.value * 0.75,
    transform: [{ scale: 1 - leaveProgress.value * 0.06 }],
  }));

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
    cancelAnimation(holdFill);
    holdFill.value = 0;
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
      const { expiresAt, label } = buildExpiration(untilPick.value, laterTonightHour);

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
          afterHours: showLateNight ? afterHoursTags : [],
        });
        setLiveSession({ ...session, isBoosted: false, boostedAt: null });
        setPingResults(0, 0);
        setSheet('none');
        void registerPushTokenAsync({ prompt: true });
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
        setPingResults(0, 0);
        setSheet('none');
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
      setPingResults(0, 0);
      setSheet('none');
    } catch (error) {
      Alert.alert('Could not go live', friendlyError(error, 'Try again'));
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
    holdFill.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
    holdRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / HOLD_MS);
      const tick = Math.floor(p * 10);
      if (tick > lastHaptic.current && tick < 10) {
        lastHaptic.current = tick;
        setHoldProgress(tick / 10);
        void Haptics.selectionAsync();
      }
      if (p >= 1 && !holdDone.current) {
        holdDone.current = true;
        if (holdRef.current) clearInterval(holdRef.current);
        holdRef.current = null;
        setHoldProgress(0);
        holdFill.value = 0;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void activateLive();
      }
    }, 40);
  };

  const goOffline = async () => {
    setLeaving(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const started = Date.now();
    try {
      if (isBackendConfigured() || env.supabaseUrl) await endLiveSession(liveSession?.id);
      await clearTonightBoost();
      // Let the fade-down finish even when the network is instant.
      const wait = 380 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setLiveSession(null);
      setPingResults(0, 0);
      setOfflineToast(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setLeaving(false);
      Alert.alert('Could not go offline', friendlyError(error, 'Try again'));
    }
  };

  const onStop = () => {
    Alert.alert(copy.stopConfirmTitle, copy.stopConfirmBody, [
      { text: copy.stayLive, style: 'cancel' },
      { text: copy.goOffline, style: 'destructive', onPress: () => void goOffline() },
    ]);
  };

  const goOfflineRef = useRef(goOffline);
  goOfflineRef.current = goOffline;
  const askingStillFree = useRef(false);
  const dueForReconfirm = live && liveSession ? needsReconfirm(liveSession, now) : false;
  useEffect(() => {
    if (!dueForReconfirm || askingStillFree.current) return;
    askingStillFree.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Still free tonight?', 'Out Tonight only shows people who are actually free right now.', [
      {
        text: 'Not anymore',
        style: 'destructive',
        onPress: () => {
          askingStillFree.current = false;
          void goOfflineRef.current();
        },
      },
      {
        text: 'Yep, keep me live',
        onPress: () => {
          askingStillFree.current = false;
          const current = useSessionStore.getState().liveSession;
          if (!current) return;
          const confirmedAt = new Date().toISOString();
          setLiveSession({ ...current, confirmedAt });
          void syncLiveSessionPatch({ confirmedAt });
        },
      },
    ]);
  }, [dueForReconfirm, setLiveSession]);

  // Parent re-renders every second for the timer; keep the header element stable so the feed doesn't.
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;
  const liveMeta = [
    formatActivities(liveSession?.activities ?? activities),
    foodBit || null,
    `within ${radiusLabel} mi`,
  ]
    .filter(Boolean)
    .join(' · ');
  const statusBar = useMemo(
    () =>
      liveSession ? (
        <LiveStatusBar
          expiresAt={liveSession.expiresAt}
          meta={liveMeta}
          datePlanned={datePlannedTonight}
          isBoosted={Boolean(liveSession.isBoosted)}
          loading={loading || leaving}
          onEdit={() => {
            setAfterHoursTags(liveSession.afterHours ?? []);
            setSheet('edit');
          }}
          onOffline={() => onStopRef.current()}
          onBoost={() => router.push('/paywall/boost')}
        />
      ) : null,
    [liveSession, liveMeta, datePlannedTonight, loading, leaving, router],
  );

  const togglePlan = (value: string) => {
    setActivities((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter((v) => v !== value);
      }
      return [...prev, value];
    });
  };

  const toggleAfterHours = (value: AfterHoursTag) => {
    void Haptics.selectionAsync();
    setAfterHoursTags((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
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
    <Screen padded={false} edges={live ? ['left', 'right'] : ['top', 'left', 'right']}>
      <LinearGradient
        colors={['rgba(124,58,237,0.28)', 'rgba(12,8,20,0.95)', '#050508']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <LayoutAnimationConfig skipEntering>
      {live && liveSession ? (
        <Animated.View
          key="live"
          style={styles.flex}
          entering={FadeIn.duration(420)}
          exiting={FadeOut.duration(260)}
        >
          <Animated.View style={[styles.flex, leavingStyle]}>
            <DiscoverFeed liveHeader={statusBar} />
          </Animated.View>
          {leaving ? (
            <Animated.View
              entering={FadeIn.duration(220)}
              style={styles.leavingOverlay}
              pointerEvents="none"
            >
              <AppText style={styles.leavingText}>Going offline…</AppText>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : (
      <Animated.View
        key="idle"
        style={styles.flex}
        entering={FadeInDown.duration(520).easing(Easing.out(Easing.cubic))}
        exiting={FadeOut.duration(220)}
      >
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
                        size={rs(22)}
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
                <Pressable style={styles.settingRow} onPress={() => setSheet('radius')}>
                  <Ionicons name="location-outline" size={rs(18)} color={colors.brandBright} />
                  <AppText style={styles.settingKey}>Distance</AppText>
                  <AppText style={styles.settingVal}>Within {radiusLabel} miles</AppText>
                  <AppText style={styles.settingChevron}>›</AppText>
                </Pressable>
                <Pressable style={styles.settingRow} onPress={() => router.push('/filters')}>
                  <Ionicons name="options" size={rs(18)} color={colors.brandBright} />
                  <AppText style={styles.settingKey}>Filters</AppText>
                  <AppText style={[styles.settingVal, filterCount > 0 && styles.settingValOn]}>
                    {filterCount > 0 ? `${filterCount} on` : 'Who you’ll see'}
                  </AppText>
                  <AppText style={styles.settingChevron}>›</AppText>
                </Pressable>
                {wantsDinner ? (
                  <Pressable style={styles.settingRow} onPress={() => setSheet('food')}>
                    <Ionicons name="options-outline" size={rs(18)} color={colors.brandBright} />
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

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <AppText style={styles.sectionLabel}>⏱ I'M FREE UNTIL</AppText>
                <AppText style={styles.sectionHint}>You go offline on your own after this.</AppText>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.laterRow}
              >
                {untilOptions.map((opt) => {
                  const on = untilPick.value === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setFreeUntil(opt.value)}
                      style={[styles.laterPill, on && styles.laterPillOn]}
                    >
                      <AppText style={[styles.laterPillText, on && styles.laterPillTextOn]}>
                        {opt.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {showLateNight ? (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <AppText style={styles.sectionLabel}>🌙 LATE NIGHT?</AppText>
                  <AppText style={styles.sectionHint}>Optional · shows in After Hours.</AppText>
                </View>
                <View style={styles.lateWrap}>
                  {AFTER_HOURS_TAGS.map((t) => {
                    const on = afterHoursTags.includes(t.value);
                    return (
                      <Pressable
                        key={t.value}
                        onPress={() => toggleAfterHours(t.value)}
                        style={[styles.laterPill, on && styles.latePillOn]}
                      >
                        <AppText style={[styles.laterPillText, on && styles.laterPillTextOn]}>
                          {t.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <QuizPromoCard hideWhenTaken />

            <Pressable style={styles.plusCard} onPress={() => router.push('/paywall')}>
              <Ionicons name="sparkles" size={rs(22)} color={colors.brandBright} />
              <View style={styles.plusCopy}>
                <View style={styles.plusTitleRow}>
                  <AppText style={styles.plusTitle}>More matches. More conversation.</AppText>
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
                  <Animated.View pointerEvents="none" style={[styles.goLiveFill, holdFillStyle]} />
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
                Go live to appear higher and let people know you're actually free tonight.
              </AppText>
            </View>
          </>
        ) : null}
      </ScrollView>
      </Animated.View>
      )}
      </LayoutAnimationConfig>

      {offlineToast && !live ? (
        <Animated.View
          entering={FadeInDown.duration(360).delay(260)}
          exiting={FadeOutUp.duration(260)}
          style={[styles.offlineToast, { top: insets.top + 8 }]}
          pointerEvents="none"
        >
          <View style={styles.offlineToastDot} />
          <AppText style={styles.offlineToastText}>You’re offline · Go live anytime</AppText>
        </Animated.View>
      ) : null}

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
                <AppText variant="title">I'm free until</AppText>
                <OptionGrid
                  options={untilOptions.map((o) => ({ value: o.value, label: o.label }))}
                  values={[untilPick.value]}
                  multi={false}
                  onToggle={(value) => setFreeUntil(value)}
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
                <AppText variant="title" style={styles.sheetTitle}>
                  Late night
                </AppText>
                <AppText variant="secondary" style={styles.sheetHint}>
                  Optional · helps people browsing After Hours find you.
                </AppText>
                <OptionGrid
                  options={AFTER_HOURS_TAGS}
                  values={afterHoursTags}
                  onToggle={(value) => toggleAfterHours(value as AfterHoursTag)}
                />
                <Button
                  label="Save"
                  onPress={() => {
                    if (liveSession) {
                      const { expiresAt, label } = buildExpiration(
                        untilPick.value,
                        liveSession.laterTonightHour ?? null,
                      );
                      const patch = {
                        activities: activities as TonightActivity[],
                        foodCuisines: wantsDinner ? foodCuisines : [],
                        radiusMiles: radius,
                        availabilityLabel: label,
                        availableUntil: expiresAt.toISOString(),
                        expiresAt: expiresAt.toISOString(),
                        afterHours: afterHoursTags,
                      };
                      setLiveSession({ ...liveSession, ...patch });
                      void syncLiveSessionPatch(patch);
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

const styles = ScaledSheet.create({
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
  settingValOn: {
    color: colors.brandBright,
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
  lateWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  latePillOn: {
    borderColor: '#A78BFA',
    backgroundColor: 'rgba(76,29,149,0.45)',
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
  leavingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leavingText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  offlineToast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(24,20,34,0.96)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  offlineToastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textSecondary,
  },
  offlineToastText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
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
