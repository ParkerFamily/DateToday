import React, { useEffect } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedImage = Animated.createAnimatedComponent(Image);

const NEON_ICON = require('../../assets/images/dt-neon-transparent.png');

export type DtIconMode = 'breathe' | 'pulse' | 'progress' | 'hold' | 'live';

interface DtIconHeroProps {
  size?: number;
  mode?: DtIconMode;
  /** 0–100 circular progress */
  progress?: number;
  /** 0–1 hold fill */
  holdProgress?: number;
  live?: boolean;
  /** Soft = restrained bloom (Live tab). Full = onboarding neon atmosphere. */
  atmosphere?: 'soft' | 'full';
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/**
 * Neon bar "OPEN" sign treatment for the real d:t asset:
 * warm-up flicker, soft bloom, occasional tube stutter.
 */
export function DtIconHero({
  size = 148,
  mode = 'breathe',
  progress = 0,
  holdProgress = 0,
  live = false,
  atmosphere = 'full',
  onPress,
  onPressIn,
  onPressOut,
  style,
  disabled,
}: DtIconHeroProps) {
  const soft = atmosphere === 'soft';
  const neon = useSharedValue(0.55);
  const bloom = useSharedValue(0);
  const flicker = useSharedValue(1);
  const pulse = useSharedValue(0);
  const ring = useSharedValue(progress);
  const hold = useSharedValue(holdProgress);
  const liveMix = useSharedValue(live ? 1 : 0);

  useEffect(() => {
    // Warm-up like a bar neon flipping on
    neon.value = withSequence(
      withTiming(0.15, { duration: 80 }),
      withTiming(0.9, { duration: 70 }),
      withTiming(0.25, { duration: 90 }),
      withTiming(1, { duration: 120 }),
      withTiming(0.4, { duration: 60 }),
      withTiming(1, { duration: 180 }),
    );

    bloom.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );

    // Occasional tube flicker (OPEN sign stutter)
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400 }),
        withTiming(0.35, { duration: 40 }),
        withTiming(1, { duration: 50 }),
        withTiming(0.55, { duration: 35 }),
        withTiming(1, { duration: 70 }),
        withDelay(900, withTiming(1, { duration: 1 })),
        withTiming(0.4, { duration: 30 }),
        withTiming(1, { duration: 90 }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(bloom);
      cancelAnimation(flicker);
    };
  }, [bloom, flicker, neon]);

  useEffect(() => {
    if (mode === 'pulse') {
      pulse.value = 0;
      pulse.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
      neon.value = withSequence(
        withTiming(0.2, { duration: 40 }),
        withTiming(1, { duration: 160 }),
      );
    }
  }, [mode, pulse, neon]);

  useEffect(() => {
    ring.value = withTiming(progress, { duration: 450 });
  }, [progress, ring]);

  useEffect(() => {
    hold.value = holdProgress;
  }, [holdProgress, hold]);

  useEffect(() => {
    liveMix.value = withTiming(live ? 1 : 0, { duration: 420 });
    if (live) {
      // Live: steadier, hotter glow (green mix) — like OPEN locked on
      flicker.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2000 }),
          withTiming(0.82, { duration: 50 }),
          withTiming(1, { duration: 80 }),
        ),
        -1,
        false,
      );
    }
  }, [live, liveMix, flicker]);

  const iconStyle = useAnimatedStyle(() => {
    const scaleBreath = interpolate(bloom.value, [0, 1], [1, 1.03]);
    const pulseScale = interpolate(pulse.value, [0, 1], [1, 1.1], Extrapolation.CLAMP);
    const brightness = neon.value * flicker.value;
    return {
      transform: [{ scale: mode === 'pulse' ? pulseScale : scaleBreath }],
      opacity: interpolate(brightness, [0, 1], [0.35, 1]),
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    const intensity = interpolate(bloom.value, [0, 1], [0.28, 0.62]) * flicker.value;
    return {
      opacity: intensity * (0.55 + liveMix.value * 0.25),
      backgroundColor: interpolateColor(
        liveMix.value,
        [0, 1],
        ['#7C3AED', '#22E58B'],
      ),
      transform: [{ scale: interpolate(bloom.value, [0, 1], [1, 1.12]) }],
    };
  });

  const outerGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bloom.value, [0, 1], [0.12, 0.32]) * flicker.value,
    backgroundColor: interpolateColor(
      liveMix.value,
      [0, 1],
      ['#A855F7', '#22E58B'],
    ),
    transform: [{ scale: interpolate(bloom.value, [0, 1], [1.05, 1.22]) }],
  }));

  const pulseRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 0.15, 1], [0.7, 0.4, 0]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.7, 2.1]) }],
    borderColor: interpolateColor(liveMix.value, [0, 1], [colors.brandBright, colors.live]),
  }));

  const stroke = 4;
  const box = size + 36;
  const r = (box - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;

  const progressProps = useAnimatedProps(() => {
    const p = Math.max(ring.value, hold.value * 100) / 100;
    return {
      strokeDashoffset: c * (1 - Math.min(Math.max(p, 0), 1)),
      stroke: interpolateColor(liveMix.value, [0, 1], [colors.brandBright, colors.live]),
    };
  });

  const liveRingStyle = useAnimatedStyle(() => ({
    opacity: liveMix.value * interpolate(bloom.value, [0, 1], [0.35, 0.6]),
    transform: [{ scale: 1 + liveMix.value * 0.06 + bloom.value * 0.04 }],
  }));

  const content = (
    <View style={[styles.wrap, { width: box, height: box }, style]}>
      {!soft ? (
        <>
          <Animated.View
            style={[
              styles.glow,
              outerGlowStyle,
              { width: size * 1.7, height: size * 1.7, borderRadius: size },
            ]}
          />
          <Animated.View
            style={[
              styles.glow,
              glowStyle,
              { width: size * 1.25, height: size * 1.25, borderRadius: size },
            ]}
          />
        </>
      ) : (
        <Animated.View
          style={[
            styles.glow,
            glowStyle,
            {
              width: size * 1.08,
              height: size * 1.08,
              borderRadius: size,
              opacity: live ? 0.45 : 0.28,
            },
          ]}
        />
      )}

      {mode === 'pulse' ? (
        <Animated.View
          style={[
            styles.pulseRing,
            pulseRingStyle,
            { width: box, height: box, borderRadius: box / 2 },
          ]}
        />
      ) : null}

      {live && !soft ? (
        <>
          <Animated.View
            style={[
              styles.liveRing,
              liveRingStyle,
              { width: box + 20, height: box + 20, borderRadius: (box + 20) / 2 },
            ]}
          />
          <Animated.View
            style={[
              styles.liveRing,
              liveRingStyle,
              {
                width: box + 44,
                height: box + 44,
                borderRadius: (box + 44) / 2,
                opacity: 0.22,
              },
            ]}
          />
        </>
      ) : null}

      <Svg width={box} height={box} style={styles.svg}>
        <Circle
          cx={box / 2}
          cy={box / 2}
          r={r}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
          opacity={0.35}
        />
        <AnimatedCircle
          cx={box / 2}
          cy={box / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          animatedProps={progressProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${box / 2} ${box / 2})`}
        />
      </Svg>

      <AnimatedImage
        source={NEON_ICON}
        style={[{ width: size, height: size }, iconStyle]}
        accessibilityLabel="DateToday"
        resizeMode="contain"
      />
    </View>
  );

  if (onPress || onPressIn || onPressOut) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{ alignItems: 'center' }}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  svg: {
    position: 'absolute',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  liveRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: colors.live,
  },
});
