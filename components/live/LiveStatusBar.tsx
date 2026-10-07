import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const EDIT_HINT_KEY = 'dt.hint.liveEditSeen';

interface LiveStatusBarProps {
  /** e.g. "Free until 1 AM"; Live itself has no visible countdown. */
  freeUntil: string | null;
  meta: string;
  datePlanned: boolean;
  isBoosted: boolean;
  loading: boolean;
  onEdit: () => void;
  onOffline: () => void;
  onBoost: () => void;
}

/** Compact "you're live" strip that sits above the Live feed. */
export function LiveStatusBar({
  freeUntil,
  meta,
  datePlanned,
  isBoosted,
  loading,
  onEdit,
  onOffline,
  onBoost,
}: LiveStatusBarProps) {
  const insets = useSafeAreaInsets();
  const pulse = useSharedValue(1);
  // The edit control reads as a plain icon once someone has used it.
  const [showEditLabel, setShowEditLabel] = useState(false);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(EDIT_HINT_KEY)
      .then((seen) => {
        if (alive && !seen) setShowEditLabel(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const dotAnim = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const edit = () => {
    if (showEditLabel) {
      setShowEditLabel(false);
      void AsyncStorage.setItem(EDIT_HINT_KEY, '1').catch(() => undefined);
    }
    onEdit();
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <Animated.View style={[styles.dot, dotAnim]} />
        <AppText style={styles.title} numberOfLines={1}>
          {datePlanned ? 'DATE PLANNED' : 'YOU’RE LIVE'}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit tonight"
          onPress={edit}
          hitSlop={6}
          style={({ pressed }) => [styles.iconBtn, showEditLabel && styles.iconBtnLabeled, pressed && styles.pressed]}
        >
          <Ionicons name="options-outline" size={rs(18)} color={colors.text} />
          {showEditLabel ? <AppText style={styles.editText}>Edit</AppText> : null}
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
      <View style={styles.detailRow}>
        <AppText style={styles.meta} numberOfLines={1}>
          {meta}
        </AppText>
        {freeUntil ? (
          <AppText style={styles.freeUntil} numberOfLines={1}>
            {meta ? ` · ${freeUntil}` : freeUntil}
          </AppText>
        ) : null}
      </View>
      {!isBoosted ? (
        <Pressable onPress={onBoost} hitSlop={6} style={styles.indent}>
          <AppText style={styles.boost}>Boost your visibility tonight →</AppText>
        </Pressable>
      ) : (
        <AppText style={[styles.boosted, styles.indent]}>BOOSTED · FRONT OF THE LINE</AppText>
      )}
    </View>
  );
}

const DOT = 10;
const DOT_GAP = 10;

const styles = ScaledSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    gap: 4,
    backgroundColor: '#0B0B0E',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: DOT_GAP },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.live },
  title: { flex: 1, minWidth: 0, color: colors.text, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  indent: { marginLeft: DOT + DOT_GAP },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginLeft: DOT + DOT_GAP },
  meta: { flexShrink: 1, color: colors.textSecondary, fontSize: 12 },
  freeUntil: { flexShrink: 0, color: colors.text, fontSize: 12, fontWeight: '600' },
  iconBtn: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnLabeled: { paddingHorizontal: 10 },
  editText: { color: colors.text, fontSize: 12, fontWeight: '700' },
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
  boost: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  boosted: { color: colors.brandBright, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
});
