import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { colors, radii, spacing } from '@/constants/theme';
import { searchCities, type CityResult } from '@/features/places/search';
import {
  addDays,
  dayKey,
  POPULAR_CITIES,
  shortDay,
  TRIP_MAX_DAYS_AHEAD,
  TRIP_MAX_NIGHTS,
  tripDatesLabel,
  tripLabel,
  usableTrip,
} from '@/features/travel/trip';
import { isPlusActive } from '@/lib/entitlements';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet, rs } from '@/lib/scale';
import { useSessionStore } from '@/store/session';
import { useTravelMode } from '@/store/travelMode';
import type { TravelTrip } from '@/types';

type City = Pick<TravelTrip, 'city' | 'region' | 'latitude' | 'longitude'>;

const dayChip = (key: string, now: Date) => {
  const label = shortDay(key, now);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export default function TravelModeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entitlements = useSessionStore((s) => s.entitlements);
  const userId = useSessionStore((s) => s.userId);
  const liveSession = useSessionStore((s) => s.liveSession);
  const plus = isPlusActive(entitlements);
  const saved = useTravelMode((s) => s.trip);
  const setTrip = useTravelMode((s) => s.setTrip);
  const now = useMemo(() => new Date(), []);
  const today = dayKey(now);
  const current = usableTrip(saved, now);

  const [city, setCity] = useState<City | null>(
    current ? { city: current.city, region: current.region ?? null, latitude: current.latitude, longitude: current.longitude } : null,
  );
  const [startsOn, setStartsOn] = useState(current?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(current?.endsOn ?? addDays(today, 2));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    void useTravelMode.getState().hydrate(userId);
  }, [userId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const id = setTimeout(() => {
      searchCities(q)
        .then((list) => {
          if (!alive) return;
          setResults(list);
          setSearchError(list.length ? null : 'No cities found. Try another spelling.');
        })
        .catch((error) => {
          if (alive) setSearchError(friendlyError(error, 'Couldn’t search cities right now.'));
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [query]);

  const startDays = useMemo(
    () => Array.from({ length: TRIP_MAX_DAYS_AHEAD + 1 }, (_, i) => addDays(today, i)),
    [today],
  );
  const endDays = useMemo(
    () => Array.from({ length: TRIP_MAX_NIGHTS + 1 }, (_, i) => addDays(startsOn, i)),
    [startsOn],
  );

  const pickStart = (key: string) => {
    void Haptics.selectionAsync();
    setStartsOn(key);
    if (endsOn < key || endsOn > addDays(key, TRIP_MAX_NIGHTS)) setEndsOn(addDays(key, Math.min(2, TRIP_MAX_NIGHTS)));
  };

  const pickCity = (next: City) => {
    void Haptics.selectionAsync();
    setCity(next);
    setQuery('');
    setResults([]);
  };

  const draft: TravelTrip | null = city ? { ...city, startsOn, endsOn } : null;

  const save = async () => {
    if (!draft) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setTrip(draft);
    router.back();
  };

  const turnOff = async () => {
    void Haptics.selectionAsync();
    await setTrip(null);
    router.back();
  };

  if (!plus) {
    return (
      <Screen padded={false} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.top}>
            <View style={styles.flex}>
              <AppText style={styles.title}>Travel Mode ✨</AppText>
              <AppText style={styles.sub}>See who’s out tonight in another city</AppText>
            </View>
            <CloseButton onPress={() => router.back()} />
          </View>
        </View>
        <View style={styles.lockedBody}>
          <Ionicons name="airplane" size={rs(40)} color={colors.brandBright} />
          <AppText style={styles.lockedTitle}>Plan your night before you land</AppText>
          <AppText style={styles.lockedText}>
            Flying to Miami Friday? Visiting New York this weekend? Go Live in the city you’re headed to and
            match with people who are out there.
          </AppText>
          <Button
            label="Unlock with DateToday+"
            onPress={() => router.replace({ pathname: '/paywall', params: { reason: 'travel' } })}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.top}>
          <View style={styles.flex}>
            <AppText style={styles.title}>Travel Mode ✨</AppText>
            <AppText style={styles.sub}>See who’s out tonight in another city</AppText>
          </View>
          <CloseButton onPress={() => router.back()} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 150 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AppText style={styles.section}>WHERE</AppText>
        {city ? (
          <View style={styles.cityCard}>
            <Ionicons name="airplane" size={rs(18)} color={colors.brandBright} />
            <View style={styles.flex}>
              <AppText style={styles.cityName}>{city.city}</AppText>
              {city.region ? <AppText style={styles.cityRegion}>{city.region}</AppText> : null}
            </View>
            <Pressable onPress={() => setCity(null)} hitSlop={8} style={styles.changeBtn}>
              <AppText style={styles.changeText}>Change</AppText>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={rs(16)} color={colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search a city"
                placeholderTextColor={colors.textSecondary}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="search"
              />
              {searching ? <ActivityIndicator color={colors.brandBright} /> : null}
            </View>
            {results.map((r) => (
              <Pressable
                key={r.id}
                style={styles.resultRow}
                onPress={() => pickCity({ city: r.name, region: r.region, latitude: r.lat, longitude: r.lng })}
              >
                <Ionicons name="location-outline" size={rs(16)} color={colors.brandBright} />
                <AppText style={styles.resultName} numberOfLines={1}>
                  {r.name}
                  <AppText style={styles.cityRegion}>
                    {[r.region, r.country && r.country !== 'US' ? r.country : null].filter(Boolean).length
                      ? ` · ${[r.region, r.country && r.country !== 'US' ? r.country : null].filter(Boolean).join(', ')}`
                      : ''}
                  </AppText>
                </AppText>
              </Pressable>
            ))}
            {searchError ? <AppText style={styles.hint}>{searchError}</AppText> : null}
            {query.trim().length < 2 ? (
              <View style={styles.chips}>
                {POPULAR_CITIES.map((c) => (
                  <Pressable
                    key={c.name}
                    style={styles.chip}
                    onPress={() => pickCity({ city: c.name, region: c.region, latitude: c.lat, longitude: c.lng })}
                  >
                    <AppText style={styles.chipText}>{c.name}</AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}

        <AppText style={styles.section}>ARRIVING</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {startDays.map((key) => {
            const on = key === startsOn;
            return (
              <Pressable key={key} style={[styles.chip, on && styles.chipOn]} onPress={() => pickStart(key)}>
                <AppText style={[styles.chipText, on && styles.chipTextOn]}>{dayChip(key, now)}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <AppText style={styles.section}>LEAVING</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {endDays.map((key) => {
            const on = key === endsOn;
            return (
              <Pressable
                key={key}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setEndsOn(key);
                }}
              >
                <AppText style={[styles.chipText, on && styles.chipTextOn]}>{dayChip(key, now)}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.trustCard}>
          <Ionicons name="shield-checkmark" size={rs(18)} color={colors.brandBright} />
          <View style={styles.flex}>
            <AppText style={styles.trustTitle}>
              {draft ? `People there see: “${tripLabel(draft, now)}”` : 'You’re always labelled as a traveler'}
            </AppText>
            <AppText style={styles.trustText}>
              Never shown as nearby, and your real location isn’t shared. Go Live each night of your trip to show
              up in {city?.city ?? 'that city'}.
            </AppText>
          </View>
        </View>
        {liveSession && !liveSession.trip ? (
          <AppText style={styles.hint}>You’re Live here right now. Your trip starts the next time you go Live.</AppText>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label={draft ? `Set trip · ${draft.city}, ${tripDatesLabel(draft, now)}` : 'Pick a city'}
          disabled={!draft}
          onPress={() => void save()}
        />
        {current ? (
          <Pressable onPress={() => void turnOff()} hitSlop={8} style={styles.offBtn}>
            <AppText style={styles.offText}>Turn off Travel Mode</AppText>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  content: { gap: 12, paddingHorizontal: spacing.lg, paddingTop: 16 },
  section: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  cityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.45)',
  },
  cityName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  cityRegion: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  changeBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radii.pill,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayRow: { gap: 8, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: 'rgba(167,139,250,0.22)', borderColor: colors.brandBright },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: '#fff', fontWeight: '800' },
  trustCard: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trustTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  trustText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    backgroundColor: 'rgba(9,9,11,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  offBtn: { alignSelf: 'center', paddingVertical: 4 },
  offText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  lockedBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: spacing.xl },
  lockedTitle: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  lockedText: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 8 },
});
