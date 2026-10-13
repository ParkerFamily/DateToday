import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors, radii } from '@/constants/theme';
import { rs, ScaledSheet } from '@/lib/scale';

export type ExploreCardProps = {
  image: string | null;
  /** Art behind the emoji when there's no photo. */
  tint: [string, string];
  emoji: string;
  badge?: string | null;
  title: string;
  meta: string | null;
  /** Rating / price for places, date and time for events. */
  detail?: string | null;
  status?: { text: string; open: boolean } | null;
  address?: string | null;
  credit?: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  onFind: () => void;
  onDirections?: (() => void) | null;
  onOpen?: (() => void) | null;
  /** e.g. "Tickets on Ticketmaster". */
  openLabel?: string | null;
  friend?: boolean;
};

/** One Explore result: a spot or an event, photo-first, with the plan actions under it. */
export function ExploreCard(p: ExploreCardProps) {
  const accent = p.friend ? colors.friend : colors.brandBright;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={p.onOpen ?? undefined}
        disabled={!p.onOpen}
        accessibilityRole={p.onOpen ? 'link' : undefined}
        accessibilityLabel={p.onOpen ? `${p.title}. ${p.openLabel ?? 'Open details'}` : undefined}
        style={({ pressed }) => [styles.photo, pressed && styles.pressed]}
      >
        {p.image ? (
          <Image
            source={{ uri: p.image }}
            style={styles.fill}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
            recyclingKey={p.image}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <LinearGradient colors={p.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fallback}>
            <AppText style={styles.fallbackEmoji}>{p.emoji}</AppText>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(9,9,11,0)', 'rgba(9,9,11,0.55)']}
          style={styles.photoFade}
          pointerEvents="none"
        />
        {p.badge ? (
          <View style={styles.badge}>
            <AppText style={styles.badgeText} numberOfLines={1}>
              {p.badge}
            </AppText>
          </View>
        ) : null}
        {p.credit ? (
          <AppText style={styles.credit} numberOfLines={1}>
            {p.credit}
          </AppText>
        ) : null}
      </Pressable>

      <View style={styles.body}>
        <AppText style={styles.title} numberOfLines={2}>
          {p.title}
        </AppText>
        {p.meta ? (
          <AppText style={styles.meta} numberOfLines={1}>
            {p.meta}
          </AppText>
        ) : null}
        {p.detail || p.status ? (
          <View style={styles.detailRow}>
            {p.detail ? (
              <AppText style={styles.detail} numberOfLines={1}>
                {p.detail}
              </AppText>
            ) : null}
            {p.status ? (
              <View style={styles.status}>
                <View style={[styles.dot, { backgroundColor: p.status.open ? colors.live : colors.textSecondary }]} />
                <AppText style={[styles.statusText, p.status.open && styles.statusOpen]} numberOfLines={1}>
                  {p.status.text}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
        {p.address ? (
          <AppText style={styles.address} numberOfLines={1}>
            {p.address}
          </AppText>
        ) : null}

        <Pressable
          onPress={p.onPrimary}
          accessibilityRole="button"
          accessibilityLabel={`${p.primaryLabel}: ${p.title}`}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={p.friend ? ['#0F766E', '#14B8A6'] : ['#7C3AED', '#A855F7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryFill}
          >
            <Ionicons name="calendar" size={rs(16)} color="#fff" />
            <AppText style={styles.primaryText} numberOfLines={1}>
              {p.primaryLabel}
            </AppText>
          </LinearGradient>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            onPress={p.onFind}
            accessibilityRole="button"
            accessibilityLabel={`Find someone for ${p.title}`}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Ionicons name={p.friend ? 'people' : 'flash'} size={rs(15)} color={accent} />
            <AppText style={[styles.secondaryText, { color: accent }]} numberOfLines={1}>
              Find someone for this
            </AppText>
          </Pressable>
          {p.onDirections ? (
            <Pressable
              onPress={p.onDirections}
              accessibilityRole="button"
              accessibilityLabel={`Directions to ${p.title}`}
              hitSlop={6}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="navigate" size={rs(17)} color={colors.text} />
            </Pressable>
          ) : null}
        </View>

        {p.onOpen && p.openLabel ? (
          <Pressable onPress={p.onOpen} accessibilityRole="link" hitSlop={6} style={styles.openRow}>
            <AppText style={styles.openText} numberOfLines={1}>
              {p.openLabel}
            </AppText>
            <Ionicons name="open-outline" size={rs(13)} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = ScaledSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.elevated,
  },
  fill: { width: '100%', height: '100%' },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackEmoji: {
    fontSize: 46,
    lineHeight: 56,
  },
  photoFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    maxWidth: '80%',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(9,9,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  badgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  credit: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    maxWidth: '70%',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
  },
  body: {
    padding: 14,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 2,
  },
  detail: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  statusOpen: { color: colors.live },
  address: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  primary: {
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryFill: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  secondary: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  iconButton: {
    width: 42,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  openText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: { opacity: 0.82 },
});
