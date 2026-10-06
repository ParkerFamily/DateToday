import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { splitLikes, usePublicCards } from '@/features/matches/likes';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { canSeeAllReceivedPings } from '@/lib/entitlements';
import { ScaledSheet, rs } from '@/lib/scale';
import { usePendingLikes } from '@/store/matches';
import { useSessionStore } from '@/store/session';

const MAX_LOCKED_TILES = 8;

/** "Likes you" row for the Matches tab: free users see one like, the rest are blurred behind DateToday+. */
export function LikesStrip() {
  const router = useRouter();
  const entitlements = useSessionStore((s) => s.entitlements);
  const unlocked = canSeeAllReceivedPings(entitlements);
  const received = usePendingLikes();
  const pending = useMemo(() => received ?? [], [received]);
  const uids = useMemo(() => pending.map((r) => r.fromUid), [pending]);
  const cards = usePublicCards(uids);

  const all = pending.filter((r) => cards[r.fromUid] !== null);
  const { visible, locked } = splitLikes(all, unlocked);
  const lockedTiles = locked.slice(0, MAX_LOCKED_TILES);
  const overflow = locked.length - lockedTiles.length;
  const upgrade = () => openUpgrade(router, 'likes');

  if (received === null) return null;

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => router.push('/likes')} style={styles.headerRow} hitSlop={8}>
        <AppText style={styles.label}>
          LIKES YOU{all.length ? ` · ${all.length}` : ''}
        </AppText>
        {all.length ? <AppText style={styles.seeAll}>See all</AppText> : null}
      </Pressable>

      {all.length === 0 ? (
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
            {visible.map((r) => {
              const card = cards[r.fromUid];
              return (
                <Pressable
                  key={r.fromUid}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  onPress={() =>
                    router.push({
                      pathname: '/profile/[userId]',
                      params: { userId: r.fromUid, name: card?.displayName ?? '' },
                    })
                  }
                >
                  <View style={[styles.ring, styles.ringOpen]}>
                    {card?.mainPhotoUrl ? (
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
                    {card?.displayName ?? '…'}
                  </AppText>
                </Pressable>
              );
            })}

            {lockedTiles.map((r) => {
              const card = cards[r.fromUid];
              return (
                <Pressable
                  key={r.fromUid}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  onPress={upgrade}
                  accessibilityLabel="Hidden like. Unlock with DateToday+"
                >
                  <View style={[styles.ring, styles.ringLocked]}>
                    {card?.mainPhotoUrl ? (
                      <Image 
                        source={{ uri: card.mainPhotoUrl }} 
                        style={styles.avatar} 
                        blurRadius={40}
                        cachePolicy="memory-disk"
                        transition={150}
                      />
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

          {locked.length > 0 ? (
            <Pressable onPress={upgrade} style={({ pressed }) => [styles.unlock, pressed && styles.pressed]}>
              <Ionicons name="lock-open" size={rs(16)} color="#fff" />
              <AppText style={styles.unlockText}>
                See all {all.length} who liked you with DateToday+
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
