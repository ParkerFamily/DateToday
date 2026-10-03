import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { formatRemaining } from '@/utils/time';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledSheet, rs } from '@/lib/scale';

interface LiveStatusBarProps {
  expiresAt: string;
  meta: string;
  datePlanned: boolean;
  isBoosted: boolean;
  loading: boolean;
  onEdit: () => void;
  onOffline: () => void;
  onBoost: () => void;
}

/** Compact "you're live" strip that sits above the Live feed. Owns its own 1s clock. */
export function LiveStatusBar({
  expiresAt,
  meta,
  datePlanned,
  isBoosted,
  loading,
  onEdit,
  onOffline,
  onBoost,
}: LiveStatusBarProps) {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const pulse = useSharedValue(1);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const dotAnim = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const timeLeft = `${formatRemaining(expiresAt, now)} left`;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <Animated.View style={[styles.dot, dotAnim]} />
        <View style={styles.copy}>
          <AppText style={styles.title} numberOfLines={1}>
            {datePlanned ? 'DATE PLANNED' : 'YOU’RE LIVE'}
            <AppText style={styles.timer}>  ·  {timeLeft}</AppText>
          </AppText>
          <AppText style={styles.meta} numberOfLines={1}>
            {meta}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit tonight"
          onPress={onEdit}
          hitSlop={6}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Ionicons name="options-outline" size={rs(18)} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go offline"
          onPress={onOffline}
          disabled={loading}
          hitSlop={6}
          style={({ pressed }) => [styles.offBtn, pressed && styles.pressed]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <AppText style={styles.offText}>Go offline</AppText>
          )}
        </Pressable>
      </View>
      {!isBoosted ? (
        <Pressable onPress={onBoost} hitSlop={6}>
          <AppText style={styles.boost}>Get seen first tonight · Boost →</AppText>
        </Pressable>
      ) : (
        <AppText style={styles.boosted}>BOOSTED · FRONT OF THE LINE</AppText>
      )}
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    gap: 6,
    backgroundColor: '#07120D',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(34,229,139,0.35)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.live, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  timer: { color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  offText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  boost: { color: colors.brandBright, fontSize: 12, fontWeight: '700' },
  boosted: { color: colors.live, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
});
