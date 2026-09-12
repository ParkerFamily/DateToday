import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import { AppText } from '@/components/ui/AppText';

interface LiveBadgeProps {
  label?: string;
  compact?: boolean;
}

export function LiveBadge({ label = 'LIVE', compact = false }: LiveBadgeProps) {
  const pulse = useSharedValue(0.45);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.85 + pulse.value * 0.25 }],
  }));

  return (
    <View style={[styles.wrap, compact && styles.compact]} accessibilityLabel={`${label} status`}>
      <View style={styles.dotWrap}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <View style={styles.dot} />
      </View>
      <AppText style={styles.label}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 229, 139, 0.12)',
    borderColor: 'rgba(34, 229, 139, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  compact: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dotWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.live,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.live,
  },
  label: {
    color: colors.live,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
