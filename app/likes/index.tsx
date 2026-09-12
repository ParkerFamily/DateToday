import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { DEMO_PINGS } from '@/constants/demoTonight';
import { colors, radii, spacing } from '@/constants/theme';
import { canSeeAllReceivedPings } from '@/lib/entitlements';
import { useSessionStore } from '@/store/session';
import { env } from '@/lib/env';

const FREE_PREVIEW = 1;

/**
 * Free: limited preview of who liked you.
 * DateToday+: full list.
 */
export default function LikesScreen() {
  const router = useRouter();
  const entitlements = useSessionStore((s) => s.entitlements);
  const unlocked = canSeeAllReceivedPings(entitlements);
  const all = useMemo(
    () => (env.previewContentEnabled ? DEMO_PINGS.received : []),
    [],
  );
  const visible = unlocked ? all : all.slice(0, FREE_PREVIEW);
  const lockedCount = Math.max(0, all.length - visible.length);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Liked you" />
        <AppText style={styles.sub}>
          {unlocked
            ? 'Everyone who sent interest while you’re Pinged.'
            : `Free shows ${FREE_PREVIEW}. Unlock the full list with DateToday+.`}
        </AppText>

        {visible.length === 0 ? (
          <AppText variant="secondary" style={styles.empty}>
            No likes yet — keep Pinging.
          </AppText>
        ) : (
          visible.map((person) => (
            <Pressable
              key={person.id}
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/profile/[userId]',
                  params: { userId: person.id, name: person.name },
                })
              }
            >
              {person.videoThumbUrl ? (
                <Image source={{ uri: person.videoThumbUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPh]} />
              )}
              <View style={styles.meta}>
                <AppText style={styles.name}>
                  {person.name}, {person.age}
                </AppText>
                <AppText variant="secondary">
                  {person.neighborhood}
                  {person.isLive ? ' · Live' : ''}
                </AppText>
              </View>
              <AppText style={styles.chev}>›</AppText>
            </Pressable>
          ))
        )}

        {!unlocked && lockedCount > 0 ? (
          <View style={styles.lockCard}>
            <AppText style={styles.lockTitle}>+{lockedCount} more like you</AppText>
            <AppText style={styles.lockBody}>
              See everyone who liked you with DateToday+.
            </AppText>
            <Button label="Get DateToday+" onPress={() => router.push('/paywall')} />
          </View>
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
    marginTop: spacing.xl,
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
