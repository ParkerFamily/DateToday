import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { FREE_LIKES_PREVIEW as FREE_PREVIEW } from '@/features/matches/likes';
import { usePendingLikes } from '@/store/matches';
import { ScaledSheet, rs } from '@/lib/scale';

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
  const total = likes?.total ?? 0;
  const unlock = () => openUpgrade(router, 'likes');
  const previewUri = locked[0]?.blur || visible[0]?.mainPhotoUrl;
  const previewBlurred = Boolean(locked[0]?.blur);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Liked you" />
        {likes?.plus ? (
          <AppText style={styles.sub}>Everyone who tapped Interested on you. Like them back to match.</AppText>
        ) : null}

        {likes && !likes.plus && lockedCount > 0 ? (
          <Pressable
            onPress={unlock}
            accessibilityRole="button"
            accessibilityLabel="See who likes you with Premium"
            style={styles.hero}
          >
            <View style={styles.heroTitleRow}>
              <Ionicons name="heart" size={rs(20)} color={colors.danger} />
              <AppText style={styles.heroTitle}>
                {total} {total === 1 ? 'person likes' : 'people like'} you
              </AppText>
            </View>
            <View style={styles.heroPreview}>
              {previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  style={styles.heroAvatar}
                  blurRadius={previewBlurred ? 10 : 0}
                  transition={150}
                />
              ) : (
                <View style={[styles.heroAvatar, styles.avatarPh]} />
              )}
            </View>
            <AppText style={styles.heroCaption}>
              Profiles stay blurred until Premium — tap to see who likes you
            </AppText>
            <View style={styles.premiumCta}>
              <AppText style={styles.premiumCtaText}>See Who Likes You · Premium</AppText>
            </View>
          </Pressable>
        ) : null}

        {likes === null ? (
          <ActivityIndicator color={colors.brandBright} style={{ marginTop: spacing.xl }} />
        ) : total === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="heart" size={rs(30)} color={colors.brandBright} />
            </View>
            <AppText style={styles.emptyTitle}>No likes yet</AppText>
            <AppText variant="secondary" style={styles.empty}>
              Go Live so people nearby can find you. When someone taps Interested, they’ll show up here.
            </AppText>
            {!likes.plus ? (
              <AppText variant="secondary" style={styles.emptyPlus}>
                Free shows {FREE_PREVIEW} like at a time. Premium shows everyone who likes you.
              </AppText>
            ) : null}
            <Button label="Go to Live" onPress={() => router.navigate('/(tabs)/live')} />
          </View>
        ) : (
          <>
            {!likes.plus && visible.length ? <AppText style={styles.section}>YOUR FREE PREVIEW</AppText> : null}
            {visible.map((card) => (
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
                <Ionicons name="chevron-forward" size={rs(20)} color={colors.textSecondary} />
              </Pressable>
            ))}
          </>
        )}

        {likes && !likes.plus && lockedCount > 0 ? (
          <>
            <View style={styles.sectionRow}>
              <AppText style={styles.section}>HIDDEN LIKES</AppText>
              <View style={styles.sectionTag}>
                <Ionicons name="lock-closed" size={rs(10)} color={colors.brandBright} />
                <AppText style={styles.sectionTagText}>PREMIUM</AppText>
              </View>
            </View>
            <View style={styles.grid}>
              {locked.map((tile, i) => (
                <Pressable
                  key={`locked-${i}`}
                  style={styles.tile}
                  onPress={unlock}
                  accessibilityLabel="Hidden like. Unlock with Premium"
                >
                  {tile.blur ? (
                    <Image source={{ uri: tile.blur }} style={StyleSheet.absoluteFill} blurRadius={14} transition={150} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.avatarPh]} />
                  )}
                  <LinearGradient
                    colors={['rgba(9,9,11,0)', 'rgba(9,9,11,0.75)']}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.tileLock}>
                    <Ionicons name="lock-closed" size={rs(16)} color={colors.text} />
                  </View>
                </Pressable>
              ))}
            </View>
            {lockedCount > locked.length ? (
              <AppText variant="secondary" style={styles.moreHidden}>
                +{lockedCount - locked.length} more hidden
              </AppText>
            ) : null}
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
  hero: {
    padding: spacing.lg,
    borderRadius: radii.surface,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    gap: 14,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  heroTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  heroPreview: {
    marginTop: 2,
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroCaption: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  premiumCta: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  premiumCtaText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  section: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  sectionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.5)',
  },
  sectionTagText: {
    color: colors.brandBright,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '31%',
    aspectRatio: 0.8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileLock: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,58,237,0.85)',
  },
  moreHidden: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  empty: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  emptyPlus: {
    textAlign: 'center',
    marginBottom: spacing.md,
    fontSize: 13,
  },
  emptyWrap: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.14)',
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
});
