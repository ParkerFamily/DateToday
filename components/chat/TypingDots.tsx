import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/constants/theme';

function Dot({ delay, size, color }: { delay: number; size: number; color: string }) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 280 }), withTiming(0, { duration: 280 }), withTiming(0, { duration: 280 })),
        -1,
      ),
    );
  }, [delay, lift]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + lift.value * 0.6,
    transform: [{ translateY: -lift.value * size * 0.6 }],
  }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

export function TypingDots({ size = 6, color = colors.brandBright }: { size?: number; color?: string }) {
  return (
    <View style={[styles.row, { gap: size * 0.6, paddingTop: size * 0.6 }]} accessibilityLabel="typing">
      <Dot delay={0} size={size} color={color} />
      <Dot delay={140} size={size} color={color} />
      <Dot delay={280} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
