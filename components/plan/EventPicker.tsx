import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors, radii } from '@/constants/theme';
import { exploreEvents } from '@/features/explore/api';
import { eventTag, eventWhenLabel, plannableEvents, type EventWindow, type ExploreEvent } from '@/features/explore/catalog';
import { formatMiles, getMyLocation, getMyLocationQuietly, type LatLng } from '@/features/places/search';
import { ScaledSheet, rs } from '@/lib/scale';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Real Ticketmaster listings near you; tickets and prices stay on Ticketmaster. */
export function EventPicker({ onPick }: { onPick: (event: ExploreEvent) => void }) {
  const [span, setSpan] = useState<EventWindow>('tonight');
  const centerQuery = useQuery({
    queryKey: ['plan-event-center'],
    queryFn: async (): Promise<LatLng> => (await getMyLocationQuietly()) ?? (await getMyLocation()),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const center = centerQuery.data ? { lat: round2(centerQuery.data.lat), lng: round2(centerQuery.data.lng) } : null;
  const eventsQuery = useQuery({
    queryKey: ['plan-events', span, center?.lat, center?.lng],
    queryFn: () => exploreEvents({ center: center!, radiusMiles: 25, window: span }),
    enabled: Boolean(center),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const events = plannableEvents(eventsQuery.data ?? []).slice(0, 12);

  const pickSpan = (next: EventWindow) => {
    void Haptics.selectionAsync();
    setSpan(next);
  };

  let status: string | null = null;
  if (centerQuery.isError) status = centerQuery.error instanceof Error ? centerQuery.error.message : 'Turn on location to see events near you.';
  else if (eventsQuery.isError) status = 'Couldn’t load events right now. Try again in a moment.';
  else if (eventsQuery.isSuccess && !events.length)
    status = span === 'tonight' ? 'No events tonight nearby. Check what’s coming up.' : 'Nothing coming up nearby yet.';

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {(['tonight', 'soon'] as const).map((w) => (
          <Pressable
            key={w}
            onPress={() => pickSpan(w)}
            accessibilityRole="button"
            accessibilityState={{ selected: span === w }}
            style={({ pressed }) => [styles.tab, span === w && styles.tabOn, pressed && styles.pressed]}
          >
            <AppText style={[styles.tabText, span === w && styles.tabTextOn]}>{w === 'tonight' ? 'Tonight' : 'Coming up'}</AppText>
          </Pressable>
        ))}
      </View>

      {centerQuery.isPending || (center && eventsQuery.isPending) ? (
        <View style={styles.status}>
          <ActivityIndicator color={colors.brandBright} size="small" />
          <AppText style={styles.meta}>Finding events near you…</AppText>
        </View>
      ) : status ? (
        <View style={styles.status}>
          <AppText style={[styles.meta, styles.flex]}>{status}</AppText>
          {span === 'tonight' && eventsQuery.isSuccess ? (
            <Pressable onPress={() => pickSpan('soon')} hitSlop={8}>
              <AppText style={styles.link}>Coming up</AppText>
            </Pressable>
          ) : eventsQuery.isError ? (
            <Pressable onPress={() => void eventsQuery.refetch()} hitSlop={8}>
              <AppText style={styles.link}>Retry</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {events.map((e) => (
        <Pressable
          key={e.id}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPick(e);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${e.name}, ${eventWhenLabel(e)}`}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          {e.image ? (
            <Image source={{ uri: e.image }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <AppText style={styles.thumbEmoji}>🎟</AppText>
            </View>
          )}
          <View style={styles.flex}>
            <AppText style={styles.name} numberOfLines={2}>
              {e.name}
            </AppText>
            <AppText style={styles.when} numberOfLines={1}>
              {eventWhenLabel(e)}
            </AppText>
            <AppText style={styles.meta} numberOfLines={1}>
              {[eventTag(e), e.venueName, formatMiles(e.distanceMiles)].filter(Boolean).join(' · ')}
            </AppText>
          </View>
        </Pressable>
      ))}
      {events.length ? <AppText style={styles.credit}>Events from Ticketmaster</AppText> : null}
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: { gap: 10 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brandBright },
  tabText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  tabTextOn: { color: '#fff' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  meta: { color: colors.textSecondary, fontSize: 13 },
  link: { color: colors.brandBright, fontSize: 14, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radii.input,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.elevated },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 26 },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  when: { color: colors.brandBright, fontSize: 13, fontWeight: '700' },
  credit: { color: colors.textSecondary, fontSize: 11, textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
