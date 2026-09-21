import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import {
  BlockLabel,
  LiveAtmosphere,
  UnderlineTabs,
  livePad,
} from '@/components/ui/LiveChrome';
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

type DatesTab = 'upcoming' | 'requests' | 'past';

const useDemo = env.useMockData;

const ACTIVITY_EMOJI: Record<string, string> = {
  Drinks: '🍸',
  Dinner: '🍽',
  Coffee: '☕',
  Activity: '🎳',
};

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

function openDateDetail(item: DateListItem) {
  return {
    pathname: '/dates/[dateId]' as const,
    params: {
      dateId: item.id,
      partner: item.partnerName,
      when: `${formatDay(item.scheduledAt)} · ${formatTime(item.scheduledAt)}`,
      venue: item.venueName ?? '',
      neighborhood: item.neighborhood ?? '',
      activity: item.activityLabel ?? '',
    },
  };
}

function activityLine(label: string | null): string {
  if (!label) return '';
  const emoji = ACTIVITY_EMOJI[label] ?? '';
  return emoji ? `${emoji} ${label}` : label;
}

function EmptyPanel({
  icon,
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  cta,
  onCta,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Ionicons name={icon} size={18} color={colors.brandBright} />
        <View style={{ flex: 1 }}>
          <AppText style={styles.panelTitle}>{title}</AppText>
          <AppText style={styles.panelSub}>{subtitle}</AppText>
        </View>
      </View>
      <View style={styles.emptyGraphic}>
        <View style={styles.emptyCircle}>
          <Ionicons name={icon} size={26} color={colors.brandBright} />
        </View>
      </View>
      <AppText style={styles.emptyTitle}>{emptyTitle}</AppText>
      <AppText style={styles.emptyBody}>{emptyBody}</AppText>
      {cta && onCta ? (
        <Button label={cta} onPress={onCta} style={{ marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}

export default function DatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<DatesTab>('upcoming');
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

  const upcomingItems = useMemo(() => [...tonight, ...upcoming], [tonight, upcoming]);
  const listForTab =
    tab === 'upcoming' ? upcomingItems : tab === 'past' ? past : ([] as DateListItem[]);
  const isEmpty = listForTab.length === 0;

  const rows = useMemo(() => {
    const out: Array<
      | { type: 'section'; title: string; key: string }
      | { type: 'item'; item: DateListItem; key: string; featured?: boolean }
    > = [];

    if (tab === 'upcoming') {
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
    } else if (tab === 'past') {
      past.forEach((d) => out.push({ type: 'item', item: d, key: d.id }));
    }
    return out;
  }, [tab, tonight, upcoming, past]);

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <LiveAtmosphere />
      <View style={[styles.pad, livePad, { paddingTop: spacing.sm }]}>
        <AppText style={styles.header}>Dates</AppText>
        <AppText style={styles.subheader}>Plans, invites, and upcoming meetups.</AppText>

        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'requests', label: 'Requests' },
            { id: 'past', label: 'Past' },
          ]}
        />

        {isEmpty ? (
          <ScrollView
            contentContainerStyle={{
              gap: spacing.md,
              paddingBottom: Math.max(insets.bottom, 8) + 24,
              paddingTop: spacing.sm,
            }}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'upcoming' ? (
              <>
                <EmptyPanel
                  icon="calendar-outline"
                  title="Planned tonight"
                  subtitle="Your upcoming date plans"
                  emptyTitle="No date plans yet"
                  emptyBody="You don't need to be live to plan dates. Save your matches, set up plans, and meet up later tonight or another day."
                  cta="PLAN A DATE →"
                  onCta={() => router.push('/(tabs)/pings')}
                />
                <EmptyPanel
                  icon="paper-plane-outline"
                  title="Pending invites"
                  subtitle="Dates you've been invited to"
                  emptyTitle="No pending invites"
                  emptyBody="When someone invites you to a date, it'll show up here."
                />
                <Pressable
                  style={styles.discoverRow}
                  onPress={() => router.push('/(tabs)/pings')}
                >
                  <Ionicons name="sparkles-outline" size={18} color={colors.brandBright} />
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.panelTitle}>Discover people to date</AppText>
                    <AppText style={styles.panelSub}>
                      Find new matches and start planning.
                    </AppText>
                  </View>
                  <AppText style={styles.chevron}>›</AppText>
                </Pressable>
                <Button
                  label="BROWSE PING"
                  variant="secondary"
                  onPress={() => router.push('/(tabs)/pings')}
                />
              </>
            ) : tab === 'requests' ? (
              <EmptyPanel
                icon="paper-plane-outline"
                title="Pending invites"
                subtitle="Dates you've been invited to"
                emptyTitle="No pending invites"
                emptyBody="When someone invites you to a date, it'll show up here."
              />
            ) : (
              <EmptyPanel
                icon="calendar-outline"
                title="Past dates"
                subtitle="Where you've been"
                emptyTitle="No past dates yet"
                emptyBody="After you go out, your plans will live here."
              />
            )}
          </ScrollView>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 8) + 24 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: row }) => {
              if (row.type === 'section') {
                return <BlockLabel>{row.title}</BlockLabel>;
              }
              const item = row.item;
              if (row.featured) {
                return (
                  <Pressable
                    style={styles.pass}
                    onPress={() => router.push(openDateDetail(item))}
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
                          onPress={() => router.push(openDateDetail(item))}
                          style={styles.half}
                        />
                      </View>
                    </View>
                  </Pressable>
                );
              }
              return (
                <Pressable
                  style={styles.card}
                  onPress={() => router.push(openDateDetail(item))}
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
  },
  header: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subheader: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
    marginTop: 4,
  },
  panel: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 10,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  panelSub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  emptyGraphic: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  emptyCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.1)',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  discoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 22,
    fontWeight: '300',
  },
  pass: {
    height: 420,
    borderRadius: radii.surface,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passPhoto: { ...StyleSheet.absoluteFill },
  passScrim: { ...StyleSheet.absoluteFill },
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
  },
  passActivity: {
    color: colors.brandBright,
    fontSize: 16,
    fontWeight: '700',
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
  half: { flex: 1 },
  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 12,
    marginBottom: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPhoto: { width: 72, height: 72, borderRadius: 14 },
  cardPhotoEmpty: { backgroundColor: colors.card },
  cardBody: { flex: 1, gap: 4 },
  cardName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  cardWhen: { color: colors.brandBright, fontSize: 13, fontWeight: '600' },
  cardWhere: { color: colors.textSecondary, fontSize: 13 },
});
