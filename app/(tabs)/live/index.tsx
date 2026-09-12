import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText, BrandMark } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { OptionGrid } from '@/components/ui/OptionChip';
import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { HeartbeatPulse } from '@/components/live/HeartbeatPulse';
import { copy, availabilityPresets } from '@/constants/copy';
import { FOOD_CUISINES, foodLabel, type FoodCuisine } from '@/constants/tonightVibe';
import { demoCity, DEMO_VIDEO_PROMPTS } from '@/constants/demoTonight';
import { flowCopy, formatPeopleInPing } from '@/constants/flow';
import { colors, spacing } from '@/constants/theme';
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
import { env } from '@/lib/env';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { commerceConfig } from '@/constants/config';

const HOLD_MS = 1200;

const PLAN_OPTIONS: { value: TonightActivity; label: string }[] = [
  { value: 'drinks', label: 'Drinks' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'activity', label: 'Activity' },
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
  const { width: screenW, height: screenH } = useWindowDimensions();
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

  const compact = screenH < 780;
  const iconSize = compact ? 120 : screenH < 900 ? 148 : 168;
  const pulseSize = Math.round(iconSize * 1.55);
  const logoWidth = Math.round(Math.min(compact ? 132 : 160, Math.max(120, screenW * 0.38)));
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
          if (env.supabaseUrl) await endLiveSession(liveSession.id);
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
          isBoosted: false,
          boostedAt: null,
        };
        setLiveSession(localSession);
        if (!plus) await beginPingSegment();
        const pool = env.previewContentEnabled ? DEMO_VIDEO_PROMPTS.length : 0;
        setPingResults(pool, pool > 0 ? Math.min(3, pool) : 0);
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
      });
      setLiveSession({ ...session, isBoosted: false, boostedAt: null });
      if (!plus) await beginPingSegment();
      setPingResults(0, 0);
      setSheet('none');
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
            if (env.supabaseUrl) await endLiveSession(liveSession?.id);
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
            : ['rgba(124,58,237,0.24)', 'rgba(20,12,34,0.88)', '#09090B']
        }
        locations={[0, 0.4, 1]}
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
        <View style={styles.header}>
          <BrandMark width={logoWidth} />
          <View style={[styles.statusPill, live && styles.statusLive]}>
            <View style={[styles.statusDot, live && styles.statusDotLive]} />
            <AppText
              style={[
                styles.statusText,
                live && styles.statusTextLive,
                datePlannedTonight && styles.statusDate,
              ]}
            >
              {live ? (datePlannedTonight ? 'DATE PLANNED' : 'PINGING') : 'OFFLINE'}
            </AppText>
          </View>
        </View>

        <AppText style={styles.cityLine}>{city.toUpperCase()}</AppText>

        <View style={styles.stage}>
          <AppText style={[styles.kicker, { fontSize: kickerSize, lineHeight: kickerSize + 6 }]}>
            {live ? "YOU'RE LIVE" : 'GO LIVE TONIGHT'}
          </AppText>

          <View style={[styles.controlWrap, { width: pulseSize, height: pulseSize }]}>
            <HeartbeatPulse active={live} size={pulseSize} />
            {live ? (
              <DtIconHero
                size={iconSize}
                mode="live"
                progress={100}
                live
                atmosphere="soft"
                onPress={onStop}
              />
            ) : (
              <DtIconHero
                size={iconSize}
                mode="hold"
                atmosphere="soft"
                holdProgress={holdProgress}
                onPressIn={onHoldStart}
                onPressOut={clearHold}
              />
            )}
          </View>

          <AppText style={styles.holdCue}>
            {live
              ? 'TAP TO GO OFFLINE'
              : holdProgress > 0.02
                ? `HOLDING… ${Math.round(holdProgress * 100)}%`
                : 'HOLD TO ACTIVATE'}
          </AppText>
          {live ? (
            <>
              <AppText style={styles.metaLive}>
                {[formatActivities(liveSession?.activities ?? activities), foodBit || null]
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
              <AppText style={styles.pingHint}>{flowCopy.pingingHint}</AppText>
              {!liveSession?.isBoosted ? (
                <Pressable onPress={() => router.push('/paywall/boost')} hitSlop={8}>
                  <AppText style={styles.boostLink}>Tonight Boost · $4.99 →</AppText>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>

        {!live ? (
          <View style={styles.setup}>
            <View style={styles.block}>
              <AppText style={styles.blockLabel}>Tonight</AppText>
              <View style={styles.planRow}>
                {PLAN_OPTIONS.map((opt) => {
                  const on = activities.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => togglePlan(opt.value)}
                      style={styles.planOpt}
                    >
                      <AppText style={[styles.planText, on && styles.planTextOn]}>
                        {opt.label}
                      </AppText>
                      {on ? <View style={styles.planUnderline} /> : <View style={styles.planSpacer} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.decisionList}>
              <Pressable style={styles.decisionRow} onPress={() => setSheet('time')}>
                <AppText style={styles.decisionKey}>Available until</AppText>
                <AppText style={styles.decisionVal}>{untilLabel}</AppText>
              </Pressable>
              <View style={styles.decisionRule} />
              <Pressable style={styles.decisionRow} onPress={() => setSheet('radius')}>
                <AppText style={styles.decisionKey}>Distance</AppText>
                <AppText style={styles.decisionVal}>Within {radiusLabel} miles</AppText>
              </Pressable>
              {wantsDinner ? (
                <>
                  <View style={styles.decisionRule} />
                  <Pressable style={styles.decisionRow} onPress={() => setSheet('food')}>
                    <AppText style={styles.decisionKey}>Dinner preference</AppText>
                    <AppText style={styles.decisionVal}>
                      {formatFoodSummary(foodCuisines)} · Change
                    </AppText>
                  </Pressable>
                </>
              ) : null}
            </View>

            <Pressable style={styles.fineTune} onPress={() => router.push('/filters')}>
              <View style={styles.fineTuneCopy}>
                <View style={styles.fineTuneTitleRow}>
                  <AppText style={styles.fineTuneTitle}>{flowCopy.fineTuneTitle}</AppText>
                  {!plus ? (
                    <View style={styles.plusBadge}>
                      <AppText style={styles.plusBadgeText}>PLUS</AppText>
                    </View>
                  ) : null}
                </View>
                <AppText style={styles.fineTuneBody}>{flowCopy.fineTuneBody}</AppText>
              </View>
              <AppText style={styles.fineTuneChevron}>›</AppText>
            </Pressable>

            <Button
              label={flowCopy.seeWhosLive}
              variant="secondary"
              onPress={() => router.push('/(tabs)/pings')}
            />
          </View>
        ) : (
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
                  ? `${formatPeopleInPing(pingResultCount)} →`
                  : flowCopy.viewYourPing
              }
              onPress={() => router.push('/(tabs)/pings')}
            />
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
                  options={PLAN_OPTIONS}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
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
  statusLive: {
    backgroundColor: 'rgba(34,229,139,0.14)',
  },
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
  statusTextLive: {
    color: colors.live,
  },
  statusDate: {
    color: colors.brandBright,
  },
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  pingHint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  setup: {
    gap: 18,
    paddingTop: spacing.xs,
  },
  block: {
    gap: 12,
  },
  blockLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  planOpt: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  planText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  planTextOn: {
    color: colors.text,
    fontWeight: '700',
  },
  planUnderline: {
    marginTop: 8,
    height: 2,
    width: 28,
    borderRadius: 1,
    backgroundColor: colors.brandBright,
  },
  planSpacer: {
    marginTop: 8,
    height: 2,
    width: 28,
  },
  decisionList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  decisionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  decisionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  decisionKey: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  decisionVal: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  fineTune: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  fineTuneCopy: {
    flex: 1,
    gap: 4,
  },
  fineTuneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fineTuneTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
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
  fineTuneBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  fineTuneChevron: {
    color: colors.textSecondary,
    fontSize: 22,
    fontWeight: '300',
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
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
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
  sheetHint: {
    marginBottom: 4,
    lineHeight: 18,
  },
  sheetTitle: {
    marginTop: spacing.sm,
  },
});
