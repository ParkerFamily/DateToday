import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import { canSeeAllReceivedPings } from '@/lib/entitlements';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { fetchPublicCard, type PublicCard } from '@/features/matches/api';
import { usePendingLikes } from '@/store/matches';
import { useSessionStore } from '@/store/session';

const FREE_PREVIEW = 1;

/**
 * People who tapped Interested on you. Heart them back from their profile to match.
 * Free: limited preview. DateToday+: full list.
 */
export default function LikesScreen() {
  const router = useRouter();
  const entitlements = useSessionStore((s) => s.entitlements);
  const unlocked = canSeeAllReceivedPings(entitlements);
  const received = usePendingLikes();
  const pending = useMemo(() => received ?? [], [received]);
  const [cards, setCards] = useState<Record<string, PublicCard | null>>({});

  useEffect(() => {
    const missing = pending.map((r) => r.fromUid).filter((id) => !(id in cards));
    if (!missing.length) return;
    let alive = true;
    void Promise.all(missing.map(async (id) => [id, await fetchPublicCard(id)] as const)).then((pairs) => {
      if (!alive) return;
      setCards((prev) => {
        const next = { ...prev };
        for (const [id, card] of pairs) next[id] = card;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [pending, cards]);

  const all = pending.filter((r) => cards[r.fromUid] !== null);
  // Free sees the oldest like until they match with them, so new likes can't rotate who's revealed.
  const freeShown = useMemo(() => new Set(all.slice(-FREE_PREVIEW).map((r) => r.fromUid)), [all]);
  const visible = unlocked ? all : all.filter((r) => freeShown.has(r.fromUid));
  const locked = unlocked ? [] : all.filter((r) => !freeShown.has(r.fromUid));
  const lockedCount = locked.length;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Liked you" />
        <AppText style={styles.sub}>
          {unlocked
            ? 'Everyone who tapped Interested on you. Like them back to match.'
            : `Free shows ${FREE_PREVIEW}. Unlock the full list with DateToday+.`}
        </AppText>

        {received === null ? (
          <ActivityIndicator color={colors.brandBright} style={{ marginTop: spacing.xl }} />
        ) : visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <AppText style={styles.emptyTitle}>No likes yet</AppText>
            <AppText variant="secondary" style={styles.empty}>
              Go Live so people nearby can find you. When someone taps Interested, they’ll show up here.
            </AppText>
            <Button label="Go to Live" onPress={() => router.navigate('/(tabs)/live')} />
          </View>
        ) : (
          visible.map((r) => {
            const card = cards[r.fromUid];
            return (
              <Pressable
                key={r.fromUid}
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/profile/[userId]',
                    params: { userId: r.fromUid, name: card?.displayName ?? '' },
                  })
                }
              >
                {card?.mainPhotoUrl ? (
                  <Image source={{ uri: card.mainPhotoUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh]} />
                )}
                <View style={styles.meta}>
                  <AppText style={styles.name}>{card?.displayName ?? '…'}</AppText>
                  <AppText variant="secondary">Tap to see their profile and like back</AppText>
                </View>
                <AppText style={styles.chev}>›</AppText>
              </Pressable>
            );
          })
        )}

        {lockedCount > 0 ? (
          <>
            {locked.slice(0, 6).map((r) => {
              const card = cards[r.fromUid];
              return (
                <Pressable
                  key={r.fromUid}
                  style={styles.row}
                  onPress={() => openUpgrade(router, 'likes')}
                  accessibilityLabel="Hidden like — unlock with DateToday+"
                >
                  {card?.mainPhotoUrl ? (
                    <Image source={{ uri: card.mainPhotoUrl }} style={styles.avatar} blurRadius={40} />
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

const styles = StyleSheet.create({
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
