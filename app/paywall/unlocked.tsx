import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { colors, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { ScaledSheet } from '@/lib/scale';

const HOLD_MS = 1000;

export default function PlusUnlockedScreen() {
  const router = useRouter();
  const liveSession = useSessionStore((s) => s.liveSession);
  const alreadyLive = Boolean(liveSession && Date.parse(liveSession.expiresAt) > Date.now());
  const [holdProgress, setHoldProgress] = useState(0);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = useRef<number>(0);

  const clearHold = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => clearHold, []);

  const onPressIn = () => {
    if (live) return;
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
        setTimeout(
          () => router.replace(alreadyLive ? '/discovery' : '/(onboarding)/activate'),
          650,
        );
      }
    }, 32);
  };

  const onPressOut = () => {
    if (live) return;
    clearHold();
    setHoldProgress(0);
  };

  const notNow = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/live');
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
          <AppText style={styles.title}>{live ? 'PINGING' : 'DateToday+ ✦'}</AppText>
          <AppText style={styles.sub}>
            {live
              ? alreadyLive
                ? 'Opening who’s out tonight…'
                : 'Opening Ping Mode…'
              : alreadyLive
                ? 'You’re live. Hold d:t to see who’s out'
                : 'Hold d:t to go live'}
          </AppText>
          {!live ? (
            <AppText style={styles.hint}>
              {holdProgress > 0
                ? `${Math.ceil((1 - holdProgress) * 3) || 1}…`
                : 'Press and hold for 1 second'}
            </AppText>
          ) : null}
        </View>
        {!live ? (
          <Pressable onPress={notNow} hitSlop={12} style={styles.notNow} accessibilityRole="button">
            <AppText style={styles.notNowText}>Not now</AppText>
          </Pressable>
        ) : null}
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
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    color: colors.brandBright,
    fontWeight: '700',
    letterSpacing: 1,
  },
  notNow: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
  },
  notNowText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
});
