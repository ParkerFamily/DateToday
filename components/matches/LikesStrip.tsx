import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { ScaledSheet, rs } from '@/lib/scale';
import { usePendingLikes } from '@/store/matches';

const MAX_LOCKED_TILES = 8;

/** "Likes you" row for the Matches tab: free users see one like, the rest are blurred behind DateToday+. */
export function LikesStrip() {
  const router = useRouter();
  const likes = usePendingLikes();
  const upgrade = () => openUpgrade(router, 'likes');

  if (likes === null) return null;

  const visible = likes.revealed;
  const lockedCount = Math.max(0, likes.total - visible.length);
  const lockedTiles = likes.locked.slice(0, Math.min(MAX_LOCKED_TILES, lockedCount));
  const overflow = lockedCount - lockedTiles.length;
  const total = likes.total;

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => router.push('/likes')} style={styles.headerRow} hitSlop={8}>
        <AppText style={styles.label}>
          LIKES YOU{total ? ` · ${total}` : ''}
        </AppText>
        {total ? <AppText style={styles.seeAll}>See all</AppText> : null}
      </Pressable>

      {total === 0 ? (
        <Pressable
          onPress={() => router.navigate('/(tabs)/live')}
          style={({ pressed }) => [styles.emptyRow, pressed && styles.pressed]}
        >
          <View style={styles.emptyIcon}>
            <Ionicons name="heart-outline" size={rs(20)} color={colors.brandBright} />
          </View>
          <AppText style={styles.emptyText}>
            No likes yet. Go Live so people nearby can find you.
          </AppText>
        </Pressable>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {visible.map((card) => {
              return (
                <Pressable
                  key={card.uid}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  onPress={() =>
                    router.push({
                      pathname: '/profile/[userId]',
                      params: { userId: card.uid, name: card.displayName },
                    })
                  }
                >
                  <View style={[styles.ring, styles.ringOpen]}>
                    {card.mainPhotoUrl ? (
                      <Image 
                        source={{ uri: card.mainPhotoUrl }} 
                        style={styles.avatar}
                        cachePolicy="memory-disk"
                        transition={150}
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarEmpty]}>
                        <Ionicons name="person" size={rs(28)} color={colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.heartBadge}>
                      <Ionicons name="heart" size={rs(11)} color="#fff" />
                    </View>
                  </View>
                  <AppText style={styles.name} numberOfLines={1}>
                    {card.displayName}
                  </AppText>
                </Pressable>
              );
            })}

            {lockedTiles.map((tile, i) => {
              return (
                <Pressable
                  key={`locked-${i}`}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  onPress={upgrade}
                  accessibilityLabel="Hidden like. Unlock with Premium"
                >
                  <View style={[styles.ring, styles.ringLocked]}>
                    {tile.blur ? (
                      <Image source={{ uri: tile.blur }} style={styles.avatar} blurRadius={6} transition={150} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarEmpty]} />
                    )}
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={rs(18)} color="#fff" />
                    </View>
                  </View>
                  <AppText style={styles.hiddenName} numberOfLines={1}>
                    Hidden
                  </AppText>
                </Pressable>
              );
            })}

            {overflow > 0 ? (
              <Pressable style={({ pressed }) => [styles.tile, pressed && styles.pressed]} onPress={upgrade}>
                <View style={[styles.ring, styles.ringLocked]}>
                  <View style={[styles.avatar, styles.moreTile]}>
                    <AppText style={styles.moreText}>+{overflow}</AppText>
                  </View>
                </View>
                <AppText style={styles.hiddenName} numberOfLines={1}>
                  More
                </AppText>
              </Pressable>
            ) : null}
          </ScrollView>

          {lockedCount > 0 ? (
            <Pressable onPress={upgrade} style={({ pressed }) => [styles.unlock, pressed && styles.pressed]}>
              <Ionicons name="lock-open" size={rs(16)} color="#fff" />
              <AppText style={styles.unlockText}>
                See Who Likes You · Premium
              </AppText>
              <Ionicons name="chevron-forward" size={rs(16)} color="#fff" />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: { marginBottom: spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  seeAll: { color: colors.brandBright, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  row: { gap: 14, paddingVertical: 4, paddingRight: spacing.md },
  tile: { width: 76, alignItems: 'center', gap: 6 },
  ring: { padding: 2, borderRadius: 40, borderWidth: 2 },
  ringOpen: { borderColor: colors.brandBright },
  ringLocked: { borderColor: 'rgba(168,85,247,0.35)' },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.card },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  heartBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandBright,
    borderWidth: 2,
    borderColor: colors.background,
  },
  lockOverlay: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,9,11,0.35)',
  },
  moreTile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.18)',
  },
  moreText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  name: { color: colors.text, fontSize: 13, fontWeight: '700' },
  hiddenName: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  unlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.card,
    backgroundColor: colors.brandBright,
  },
  unlockText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radii.card,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.12)',
  },
  emptyText: { flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 19 },
});
