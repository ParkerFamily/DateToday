import React, { useEffect, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton, dismissToLive } from '@/components/ui/CloseButton';
import { flowCopy } from '@/constants/flow';
import { ACTIVITY_EMOJI } from '@/constants/tonightVibe';
import { colors, spacing } from '@/constants/theme';
import { sharedFoodHeadline } from '@/utils/tonightCompatibility';
import type { FoodCuisine, TonightActivity } from '@/types';
import { useSessionStore } from '@/store/session';

function CollideRing({
  side,
  color,
  delay,
}: {
  side: 'left' | 'right';
  color: string;
  delay: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - progress.value),
    transform: [
      { translateX: side === 'left' ? -28 + progress.value * 28 : 28 - progress.value * 28 },
      { scale: 0.6 + progress.value * 1.1 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.collideRing, style, { borderColor: color }]}
    />
  );
}

/**
 * Mutual match takeover.
 * Equal choices: SAY HEY (text first) · MAKE A PLAN (instant date).
 */
export default function MutualMatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useSessionStore((s) => s.profile);
  const liveSession = useSessionStore((s) => s.liveSession);
  const params = useLocalSearchParams<{
    conversationId?: string;
    matchId?: string;
    name?: string;
    photo?: string;
    food?: string;
    activities?: string;
  }>();

  const opacity = useSharedValue(0);
  const titleScale = useSharedValue(0.7);
  const faceIn = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 380 });
    titleScale.value = withSequence(
      withTiming(1.08, { duration: 360, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 200 }),
    );
    faceIn.value = withDelay(
      180,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
  }, [faceIn, opacity, titleScale]);

  const stageAnim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const titleAnim = useAnimatedStyle(() => ({
    transform: [{ scale: titleScale.value }],
  }));
  const facesAnim = useAnimatedStyle(() => ({
    opacity: faceIn.value,
    transform: [{ translateY: (1 - faceIn.value) * 24 }],
  }));

  const theirName = params.name ?? 'them';
  const theirPhoto = typeof params.photo === 'string' ? params.photo : '';
  const myPhoto = profile?.mainPhotoUrl ?? null;
  const conversationId = params.conversationId ?? 'new';

  const activities = useMemo(() => {
    if (typeof params.activities === 'string' && params.activities.length) {
      return params.activities.split(',').filter(Boolean) as TonightActivity[];
    }
    return (liveSession?.activities ?? ['drinks', 'dinner']) as TonightActivity[];
  }, [params.activities, liveSession?.activities]);

  const vibeLine = activities
    .map((a) => `${ACTIVITY_EMOJI[a] ?? ''} ${a.charAt(0).toUpperCase() + a.slice(1)}`.trim())
    .join(' · ');

  const sharedFood =
    typeof params.food === 'string' && params.food.length
      ? (params.food as FoodCuisine)
      : null;
  const foodHeadline = sharedFood ? sharedFoodHeadline([sharedFood]) : null;

  const chatParams = {
    name: theirName,
    photo: theirPhoto,
    food: sharedFood ?? '',
    activities: activities.join(','),
    icebreakers: '1',
  };

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <LinearGradient
        colors={['#1A0B2E', '#0D1F18', '#09090B']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.fill, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.top}>
          <View style={styles.topSpacer} />
          <CloseButton onPress={() => dismissToLive(router)} />
        </View>

        <Animated.View style={[styles.center, stageAnim]}>
          <View style={styles.pulseField}>
            <CollideRing side="left" color={colors.brandBright} delay={0} />
            <CollideRing side="right" color={colors.live} delay={400} />
            <CollideRing side="left" color={colors.brand} delay={900} />
            <CollideRing side="right" color={colors.live} delay={1300} />
          </View>

          <Animated.View style={titleAnim}>
            <AppText style={styles.bolt}>⚡</AppText>
            <AppText style={styles.title}>{flowCopy.itsAMatch}</AppText>
          </Animated.View>

          <Animated.View style={[styles.faces, facesAnim]}>
            <View style={styles.faceWrap}>
              {myPhoto ? (
                <Image source={{ uri: myPhoto }} style={styles.face} />
              ) : (
                <View style={[styles.face, styles.faceFallback]}>
                  <AppText style={styles.faceInitial}>You</AppText>
                </View>
              )}
            </View>
            <AppText style={styles.plus}>+</AppText>
            <View style={styles.faceWrap}>
              {theirPhoto ? (
                <Image source={{ uri: theirPhoto }} style={styles.face} />
              ) : (
                <View style={[styles.face, styles.faceFallback]}>
                  <AppText style={styles.faceInitial}>
                    {theirName.charAt(0).toUpperCase()}
                  </AppText>
                </View>
              )}
            </View>
          </Animated.View>

          <AppText style={styles.pair}>
            You + {theirName} are both free tonight.
          </AppText>
          {vibeLine ? <AppText style={styles.vibe}>{vibeLine}</AppText> : null}
          {foodHeadline ? (
            <AppText style={styles.foodHeadline}>{foodHeadline}</AppText>
          ) : null}
          <AppText style={styles.tonightOnly}>{flowCopy.tonightOnly}</AppText>
        </Animated.View>

        <View style={styles.actions}>
          <Button
            label={flowCopy.sayHey}
            onPress={() =>
              router.replace({
                pathname: '/chat/[conversationId]',
                params: { conversationId, ...chatParams },
              })
            }
          />
          <Button
            label={flowCopy.makeAPlan}
            variant="secondary"
            onPress={() =>
              router.replace({
                pathname: '/dates/plan',
                params: {
                  name: theirName,
                  photo: theirPhoto,
                  food: sharedFood ?? '',
                  conversationId,
                  mode: sharedFood ? 'spot' : 'plan',
                },
              })
            }
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topSpacer: { width: 40 },
  center: {
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'center',
  },
  pulseField: {
    position: 'absolute',
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collideRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
  },
  bolt: {
    fontSize: 40,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: spacing.md,
  },
  faceWrap: {
    shadowColor: colors.brandBright,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  face: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.text,
  },
  faceFallback: {
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceInitial: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  plus: {
    color: colors.brandBright,
    fontSize: 28,
    fontWeight: '800',
  },
  pair: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  vibe: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  foodHeadline: {
    color: colors.live,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  tonightOnly: {
    color: colors.brandBright,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
  },
  actions: {
    gap: spacing.sm,
  },
});
