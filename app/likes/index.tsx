import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { FREE_LIKES_PREVIEW as FREE_PREVIEW } from '@/features/matches/likes';
import { usePendingLikes } from '@/store/matches';
import { ScaledSheet } from '@/lib/scale';

/**
 * People who tapped Interested on you. Heart them back from their profile to match.
 * Free: limited preview. DateToday+: full list.
 */
export default function LikesScreen() {
  const router = useRouter();
  const likes = usePendingLikes();
  const visible = likes?.revealed ?? [];
  const lockedCount = likes ? Math.max(0, likes.total - visible.length) : 0;
  const locked = (likes?.locked ?? []).slice(0, Math.min(6, lockedCount));

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Liked you" />
        <AppText style={styles.sub}>
          {likes?.plus
            ? 'Everyone who tapped Interested on you. Like them back to match.'
            : `Free shows ${FREE_PREVIEW}. Unlock the full list with DateToday+.`}
        </AppText>

        {likes === null ? (
          <ActivityIndicator color={colors.brandBright} style={{ marginTop: spacing.xl }} />
        ) : likes.total === 0 ? (
          <View style={styles.emptyWrap}>
            <AppText style={styles.emptyTitle}>No likes yet</AppText>
            <AppText variant="secondary" style={styles.empty}>
              Go Live so people nearby can find you. When someone taps Interested, they’ll show up here.
            </AppText>
            <Button label="Go to Live" onPress={() => router.navigate('/(tabs)/live')} />
          </View>
        ) : (
          visible.map((card) => {
            return (
              <Pressable
                key={card.uid}
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/profile/[userId]',
                    params: { userId: card.uid, name: card.displayName },
                  })
                }
              >
                {card.mainPhotoUrl ? (
                  <Image 
                    source={{ uri: card.mainPhotoUrl }} 
                    style={styles.avatar}
                    cachePolicy="memory-disk"
                    transition={150}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh]} />
                )}
                <View style={styles.meta}>
                  <AppText style={styles.name}>{card.displayName}</AppText>
                  <AppText variant="secondary">Tap to see their profile and like back</AppText>
                </View>
                <AppText style={styles.chev}>›</AppText>
              </Pressable>
            );
          })
        )}

        {lockedCount > 0 ? (
          <>
            {locked.map((tile, i) => {
              return (
                <Pressable
                  key={`locked-${i}`}
                  style={styles.row}
                  onPress={() => openUpgrade(router, 'likes')}
                  accessibilityLabel="Hidden like — unlock with DateToday+"
                >
                  {tile.blur ? (
                    <Image source={{ uri: tile.blur }} style={styles.avatar} blurRadius={6} transition={150} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPh]} />
                  )}
                  <View style={styles.meta}>
                    <AppText style={styles.name}>Someone nearby</AppText>
                    <AppText variant="secondary">Liked you · unlock to see who</AppText>
                  </View>
                  <AppText style={styles.lockIcon}>🔒</AppText>
                </Pressable>
              );
            })}
            <View style={styles.lockCard}>
              <AppText style={styles.lockTitle}>
                +{lockedCount} more {lockedCount === 1 ? 'person likes' : 'people like'} you
              </AppText>
              <AppText style={styles.lockBody}>
                Free shows 1 like at a time. See everyone who liked you with DateToday+.
              </AppText>
              <Button label="Get DateToday+" onPress={() => openUpgrade(router, 'likes')} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: 10,
  },
  sub: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  empty: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  emptyWrap: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.elevated,
  },
  avatarPh: {
    backgroundColor: colors.elevated,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  chev: {
    color: colors.textSecondary,
    fontSize: 22,
  },
  lockIcon: {
    fontSize: 18,
  },
  lockCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.surface,
    backgroundColor: colors.elevated,
    gap: 10,
  },
  lockTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  lockBody: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
