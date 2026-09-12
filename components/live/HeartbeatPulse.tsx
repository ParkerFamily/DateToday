import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/constants/theme';

interface HeartbeatPulseProps {
  active: boolean;
  size?: number;
}

function PulseRing({ delay, size, active }: { delay: number; size: number; active: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [active, delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: active ? 0.45 * (1 - progress.value) : 0,
    transform: [{ scale: 0.55 + progress.value * 1.15 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        style,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    />
  );
}

/** Expanding heartbeat / radius pulse around the live d:t control. */
export function HeartbeatPulse({ active, size = 220 }: HeartbeatPulseProps) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="none">
      <PulseRing delay={0} size={size} active={active} />
      <PulseRing delay={800} size={size} active={active} />
      <PulseRing delay={1600} size={size} active={active} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: colors.live,
  },
});
