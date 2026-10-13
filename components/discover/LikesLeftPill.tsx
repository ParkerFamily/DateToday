import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/theme';
import { likesMeter, type LikesMeterTone } from '@/features/matches/likesMeter';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { rs, ScaledSheet } from '@/lib/scale';

const ICON: Record<LikesMeterTone, keyof typeof Ionicons.glyphMap> = {
  plus: 'infinite',
  calm: 'heart-outline',
  notice: 'heart',
  low: 'heart-half',
  out: 'flash',
};

const TINT: Record<LikesMeterTone, string> = {
  plus: colors.brandBright,
  calm: colors.textSecondary,
  notice: colors.brandBright,
  low: colors.warning,
  out: colors.white,
};

/** Free Likes left (or "Unlimited Likes" with DateToday+). Free members tap through to upgrade. */
export function LikesLeftPill({ left, plus }: { left: number | null; plus: boolean }) {
  const router = useRouter();
  const meter = likesMeter(left, plus);
  if (!meter) return null;
  const tint = TINT[meter.tone];
  const body = (
    <>
      <Ionicons name={ICON[meter.tone]} size={rs(12)} color={tint} />
      <AppText style={[styles.text, { color: tint }]} numberOfLines={1}>
        {meter.label}
      </AppText>
    </>
  );
  if (meter.tone === 'plus') {
    return (
      <View style={[styles.pill, styles.plus]} accessibilityRole="text" accessibilityLabel={meter.a11y}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={meter.a11y}
      accessibilityHint="Opens DateToday+ for unlimited Likes"
      hitSlop={8}
      onPress={() => openUpgrade(router, meter.tone === 'out' ? 'likes_out' : 'likes_low')}
      style={({ pressed }) => [styles.pill, styles[meter.tone], pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
  plus: {
    borderColor: 'rgba(168,85,247,0.35)',
    backgroundColor: 'rgba(168,85,247,0.1)',
  },
  calm: {
    borderColor: colors.border,
  },
  notice: {
    borderColor: 'rgba(168,85,247,0.55)',
    backgroundColor: 'rgba(168,85,247,0.14)',
  },
  low: {
    borderColor: 'rgba(255,176,32,0.6)',
    backgroundColor: 'rgba(255,176,32,0.12)',
  },
  out: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  pressed: { opacity: 0.8 },
});
