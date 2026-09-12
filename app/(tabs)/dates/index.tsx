import React, { useMemo } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { DEMO_DATES } from '@/constants/demoTonight';
import { colors, radii, spacing } from '@/constants/theme';
import { env } from '@/lib/env';
import { useBlocksStore } from '@/store/blocks';
import type { DateStatus } from '@/types';

interface DateListItem {
  id: string;
  partnerId?: string;
  partnerName: string;
  scheduledAt: string;
  venueName: string | null;
  neighborhood: string | null;
  activityLabel: string | null;
  status: DateStatus;
  section: 'tonight' | 'upcoming' | 'past';
  photoUrl?: string;
}

/** Preview boarding-pass UI only in local/dev — never invent dates in production. */
const useDemo = env.previewContentEnabled;

const ACTIVITY_EMOJI: Record<string, string> = {
  Drinks: '🍸',
  Dinner: '🍽',
  Coffee: '☕',
  Activity: '🎳',
};

function DateRadarIcon() {
  return (
    <View style={styles.radar}>
      <View style={styles.radarRing} />
      <View style={[styles.radarRing, styles.radarRingMid]} />
      <Ionicons name="calendar-outline" size={28} color={colors.brandBright} />
    </View>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function activityLine(label: string | null): string {
  if (!label) return '';
  const emoji = ACTIVITY_EMOJI[label] ?? '';
  return emoji ? `${emoji} ${label}` : label;
}

export default function DatesScreen() {
  const router = useRouter();
  const blockedMap = useBlocksStore((s) => s.byId);
  const data = useMemo(() => {
    const raw = useDemo ? ([...DEMO_DATES] as DateListItem[]) : [];
    return raw.filter((d) => {
      if (d.partnerId && blockedMap[d.partnerId]) return false;
      return !Object.values(blockedMap).some(
        (b) =>
          (b.displayName &&
            b.displayName.toLowerCase() === d.partnerName.toLowerCase()) ||
          b.blockedId === d.id,
      );
    });
  }, [blockedMap]);
  const tonight = useMemo(() => data.filter((d) => d.section === 'tonight'), [data]);
  const upcoming = useMemo(() => data.filter((d) => d.section === 'upcoming'), [data]);
  const past = useMemo(() => data.filter((d) => d.section === 'past'), [data]);
  const isEmpty = tonight.length + upcoming.length + past.length === 0;

  const rows = useMemo(() => {
    const out: Array<
      | { type: 'section'; title: string; key: string }
      | { type: 'item'; item: DateListItem; key: string; featured?: boolean }
    > = [];

    if (tonight.length) {
      out.push({ type: 'section', title: 'TONIGHT', key: 'tonight' });
      tonight.forEach((d) =>
        out.push({ type: 'item', item: d, key: d.id, featured: true }),
      );
    }
    if (upcoming.length) {
      out.push({ type: 'section', title: 'UPCOMING', key: 'up' });
      upcoming.forEach((d) => out.push({ type: 'item', item: d, key: d.id }));
    }
    if (past.length) {
      out.push({ type: 'section', title: 'PAST DATES', key: 'past' });
      past.forEach((d) => out.push({ type: 'item', item: d, key: d.id }));
    }
    return out;
  }, [tonight, upcoming, past]);

  return (
    <Screen padded={false}>
      <LinearGradient
        colors={['#0E0A14', '#09090B']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.pad}>
        <AppText style={styles.header}>Dates</AppText>
        <AppText style={styles.subheader}>Matches that turn into plans</AppText>

        {isEmpty ? (
          <EmptyState
            icon={<DateRadarIcon />}
            title="Tonight is wide open."
            body="Matches that turn into plans show up here — like a boarding pass for the night."
            actionLabel="GO LIVE"
            onAction={() => router.push('/(tabs)/live')}
            secondaryLabel="SEE PING"
            onSecondary={() => router.push('/(tabs)/pings')}
          />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: row }) => {
              if (row.type === 'section') {
                return (
                  <AppText variant="label" style={styles.section}>
                    {row.title}
                  </AppText>
                );
              }

              const item = row.item;
              if (row.featured) {
                return (
                  <Pressable
                    style={styles.pass}
                    onPress={() => router.push(`/dates/${item.id}`)}
                  >
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.passPhoto} />
                    ) : null}
                    <LinearGradient
                      colors={['rgba(9,9,11,0.2)', 'rgba(9,9,11,0.94)']}
                      style={styles.passScrim}
                    />
                    <View style={styles.passBody}>
                      <AppText style={styles.passEyebrow}>TONIGHT</AppText>
                      <AppText style={styles.passTime}>{formatTime(item.scheduledAt)}</AppText>
                      <AppText style={styles.passName}>{item.partnerName.toUpperCase()}</AppText>
                      {item.activityLabel ? (
                        <AppText style={styles.passActivity}>
                          {activityLine(item.activityLabel)}
                        </AppText>
                      ) : null}
                      {item.venueName ? (
                        <AppText style={styles.passVenue}>
                          {item.venueName}
                          {item.neighborhood ? ` · ${item.neighborhood}` : ''}
                        </AppText>
                      ) : null}
                      <View style={styles.passActions}>
                        <Button
                          label="MESSAGE"
                          variant="secondary"
                          onPress={() => router.push('/chat/preview')}
                          style={styles.half}
                        />
                        <Button
                          label="DATE DETAILS"
                          onPress={() => router.push(`/dates/${item.id}`)}
                          style={styles.half}
                        />
                      </View>
                      <Pressable style={styles.shareRow}>
                        <Ionicons name="shield-checkmark-outline" size={16} color={colors.live} />
                        <AppText style={styles.shareText}>Share date with a friend</AppText>
                      </Pressable>
                    </View>
                  </Pressable>
                );
              }

              return (
                <Pressable
                  style={styles.card}
                  onPress={() => router.push(`/dates/${item.id}`)}
                >
                  {item.photoUrl ? (
                    <Image source={{ uri: item.photoUrl }} style={styles.cardPhoto} />
                  ) : (
                    <View style={[styles.cardPhoto, styles.cardPhotoEmpty]} />
                  )}
                  <View style={styles.cardBody}>
                    <AppText style={styles.cardName}>{item.partnerName}</AppText>
                    <AppText style={styles.cardWhen}>
                      {formatDay(item.scheduledAt)} · {formatTime(item.scheduledAt)}
                    </AppText>
                    <AppText style={styles.cardWhere}>
                      {[item.activityLabel, item.venueName].filter(Boolean).join(' · ') ||
                        'Details TBD'}
                    </AppText>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    marginTop: spacing.md,
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subheader: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
    marginTop: 4,
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  radar: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
  },
  radarRingMid: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderColor: 'rgba(168,85,247,0.55)',
  },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
  pass: {
    height: 420,
    borderRadius: radii.surface,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.28)',
  },
  passPhoto: {
    ...StyleSheet.absoluteFill,
  },
  passScrim: {
    ...StyleSheet.absoluteFill,
  },
  passBody: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    gap: 6,
  },
  passEyebrow: {
    color: colors.live,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  passTime: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 46,
  },
  passName: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  passActivity: {
    color: colors.brandBright,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  passVenue: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  passActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  half: {
    flex: 1,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
  },
  shareText: {
    color: colors.live,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    padding: 12,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  cardPhoto: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  cardPhotoEmpty: {
    backgroundColor: colors.card,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardWhen: {
    color: colors.brandBright,
    fontSize: 13,
    fontWeight: '600',
  },
  cardWhere: {
    color: colors.textSecondary,
    fontSize: 13,
  },
});
