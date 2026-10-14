import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors, radii } from '@/constants/theme';
import { getHere, getHereQuietly, nearLabel, useTravelTrip } from '@/features/location/effective';
import {
  formatMiles,
  halfwayPlaces,
  hotPlaces,
  nearbyPlaces,
  ratingLine,
  searchPlaces,
  type LatLng,
  type Place,
  type PlanCategory,
} from '@/features/places/search';
import { ScaledSheet, rs } from '@/lib/scale';

type Mode = 'near' | 'halfway' | 'search' | 'manual';

const NEARBY_KIND: Record<PlanCategory, string> = {
  drinks: 'Bars',
  dinner: 'Restaurants',
  coffee: 'Coffee',
  activity: 'Fun spots',
};

const nearbyTitle = (category: PlanCategory, city: string | null) =>
  `${NEARBY_KIND[category]} ${city ? `in ${city}` : 'near you'}`;

export function placeLine(p: Place) {
  return [p.kind, p.area].filter(Boolean).join(' · ');
}

export function SelectedPlaceCard({ place, onChange }: { place: Place; onChange: () => void }) {
  const miles = formatMiles(place.distanceMiles);
  return (
    <View style={styles.selected}>
      <View style={styles.selectedIcon}>
        <Ionicons name="location" size={rs(20)} color="#fff" />
      </View>
      <View style={styles.flex}>
        <AppText style={styles.selectedName} numberOfLines={1}>
          {place.name}
        </AppText>
        {placeLine(place) || ratingLine(place) ? (
          <AppText style={styles.meta} numberOfLines={1}>
            {[ratingLine(place), placeLine(place)].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        {place.address || miles ? (
          <AppText style={styles.meta} numberOfLines={1}>
            {[place.address, miles].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
      </View>
      <Pressable onPress={onChange} hitSlop={10}>
        <AppText style={styles.change}>Change</AppText>
      </Pressable>
    </View>
  );
}

export function PlacePicker({
  category,
  cuisine,
  onPick,
  allowManual = true,
  nearby,
  halfway,
}: {
  category: PlanCategory;
  cuisine?: string | null;
  onPick: (place: Place) => void;
  allowManual?: boolean;
  /** A different "Near me" list (e.g. movie theaters); opens on it, without the hot picks. */
  nearby?: { title: (city: string | null) => string; load: (me: LatLng) => Promise<Place[]>; kind?: 'theaters' };
  /** Offers "Halfway": spots between you and this match. */
  halfway?: { matchId: string; name: string } | null;
}) {
  const city = useTravelTrip()?.city ?? null;
  const [mode, setMode] = useState<Mode | null>(nearby ? 'near' : null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState('');
  const searchSeq = useRef(0);
  const [slow, setSlow] = useState(false);
  const [hot, setHot] = useState<Place[]>([]);
  const [hotLoading, setHotLoading] = useState(false);

  useEffect(() => {
    if (mode !== 'near' || !me || nearby) return;
    let alive = true;
    setHot([]);
    setHotLoading(true);
    hotPlaces(me, category, cuisine)
      .then((places) => alive && setHot(places))
      .catch(() => undefined)
      .finally(() => alive && setHotLoading(false));
    return () => {
      alive = false;
    };
  }, [mode, me, category, cuisine, nearby]);

  const [halfwayTitle, setHalfwayTitle] = useState<string | null>(null);
  const hotNames = new Set(hot.map((p) => p.name.toLowerCase()));
  const listed = mode === 'near' ? results.filter((p) => !hotNames.has(p.name.toLowerCase())) : results;

  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  /** Four choices don't fit one row on small phones. */
  const grid = Boolean(halfway) && allowManual;

  const choose = (next: Mode) => {
    void Haptics.selectionAsync();
    setError(null);
    setResults([]);
    setMode(next);
  };

  useEffect(() => {
    if (mode !== 'near') return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const here = me ?? (await getHereQuietly()) ?? (await getHere());
        if (!alive) return;
        setMe(here);
        const places = nearby ? await nearby.load(here) : await nearbyPlaces(here, category, cuisine);
        if (!alive) return;
        setResults(places);
        if (!places.length) setError(allowManual ? 'Nothing showing up nearby. Try search or type it in.' : 'Nothing showing up nearby. Try search.');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Couldn’t load places right now.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, category, cuisine, me, allowManual, nearby]);

  useEffect(() => {
    if (mode !== 'halfway' || !halfway) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setHalfwayTitle(null);
    (async () => {
      try {
        const here = me ?? (await getHereQuietly()) ?? (await getHere());
        if (!alive) return;
        setMe(here);
        const { places, status } = await halfwayPlaces({
          me: here,
          matchId: halfway.matchId,
          category,
          cuisine,
          kind: nearby?.kind,
        });
        if (!alive) return;
        setResults(places);
        const fallback = `Try ${nearLabel(city)} or Search.`;
        if (status === 'unavailable') {
          setError(`We don’t have a recent area for ${halfway.name}, so there’s no halfway point yet. ${fallback}`);
        } else if (status === 'too_far') {
          setError(`You and ${halfway.name} are too far apart for a halfway spot. ${fallback}`);
        } else if (!places.length) {
          setError(`Nothing showing up halfway. ${fallback}`);
        } else {
          setHalfwayTitle(status === 'close' ? `You’re close, so these work for you both` : `Halfway between you and ${halfway.name}`);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Couldn’t load places right now.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, category, cuisine, me, halfway, nearby, city]);

  useEffect(() => {
    if (mode !== 'search') return;
    if (!me) void getHereQuietly().then((here) => here && setMe(here));
  }, [mode, me]);

  useEffect(() => {
    if (mode !== 'search') return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const seq = ++searchSeq.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      searchPlaces(q, me)
        .then((places) => {
          if (seq !== searchSeq.current) return;
          setResults(places);
          if (!places.length) setError(allowManual ? 'No matches. Try another name, or type it in.' : 'No matches. Try another name.');
        })
        .catch((e) => seq === searchSeq.current && setError(e instanceof Error ? e.message : 'Search failed.'))
        .finally(() => seq === searchSeq.current && setLoading(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [mode, query, me, allowManual]);

  const pick = (place: Place) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPick(place);
  };

  const submitManual = () => {
    const name = manual.trim();
    if (!name) return;
    pick({ id: `manual-${name}`, name, address: null, area: null, lat: null, lng: null, distanceMiles: null, kind: null });
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.modes, grid && styles.modesGrid]}>
        <ModeButton icon="navigate" label={nearLabel(city)} on={mode === 'near'} onPress={() => choose('near')} grid={grid} />
        {halfway ? (
          <ModeButton
            icon="git-compare-outline"
            label="Halfway"
            on={mode === 'halfway'}
            onPress={() => choose('halfway')}
            grid={grid}
          />
        ) : null}
        <ModeButton icon="search" label="Search" on={mode === 'search'} onPress={() => choose('search')} grid={grid} />
        {allowManual ? (
          <ModeButton
            icon="create-outline"
            label="Type it"
            on={mode === 'manual'}
            onPress={() => choose('manual')}
            grid={grid}
          />
        ) : null}
      </View>

      {mode === 'search' ? (
        <View style={styles.inputRow}>
          <Ionicons name="search" size={rs(18)} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Restaurants, bars, cafés…"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoFocus
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>
      ) : null}

      {mode === 'manual' ? (
        <View style={styles.inputRow}>
          <Ionicons name="create-outline" size={rs(18)} color={colors.textSecondary} />
          <TextInput
            value={manual}
            onChangeText={setManual}
            placeholder="A public spot, e.g. Joe’s Bar"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitManual}
          />
          <Pressable onPress={submitManual} disabled={!manual.trim()} hitSlop={8}>
            <AppText style={[styles.change, !manual.trim() && styles.dim]}>Use</AppText>
          </Pressable>
        </View>
      ) : null}

      {mode === 'near' && (hot.length || hotLoading) ? (
        <View style={styles.hotHeader}>
          <Ionicons name="flame" size={rs(15)} color="#FF7A45" />
          <AppText style={styles.hotTitle}>HOT RIGHT NOW</AppText>
          <AppText style={styles.hotSub} numberOfLines={1}>
            · top rated {city ? `in ${city}` : 'near you'}
          </AppText>
        </View>
      ) : null}
      {mode === 'near' && hotLoading && !hot.length ? (
        <View style={styles.status}>
          <ActivityIndicator color="#FF7A45" size="small" />
          <AppText style={[styles.meta, styles.flex]}>Checking reviews for the best spots {city ? `in ${city}` : 'nearby'}…</AppText>
        </View>
      ) : null}
      {mode === 'near' ? hot.map((p) => <HotRow key={p.id} place={p} onPress={() => pick(p)} />) : null}

      {mode === 'near' && listed.length ? (
        <AppText style={styles.listTitle}>{nearby ? nearby.title(city) : nearbyTitle(category, city)}</AppText>
      ) : null}
      {mode === 'halfway' && halfwayTitle && listed.length ? (
        <AppText style={styles.listTitle}>{halfwayTitle}</AppText>
      ) : null}

      {loading ? (
        <View style={styles.status}>
          <ActivityIndicator color={colors.brandBright} size="small" />
          <AppText style={[styles.meta, styles.flex]}>
            {slow
              ? 'Still looking — first searches in a new area take a few seconds.' + (allowManual ? ' You can also type it in.' : '')
              : mode === 'near'
                ? `Finding spots ${city ? `in ${city}` : 'near you'}…`
                : mode === 'halfway'
                  ? 'Finding spots halfway…'
                  : 'Searching…'}
          </AppText>
        </View>
      ) : error ? (
        <AppText style={[styles.meta, styles.status]}>{error}</AppText>
      ) : null}

      {!loading && (mode === 'near' || mode === 'search' || (mode === 'halfway' && halfwayTitle))
        ? listed.slice(0, 8).map((p) => (
            <Pressable
              key={p.id}
              onPress={() => pick(p)}
              style={({ pressed }) => [styles.result, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <AppText style={styles.resultName} numberOfLines={1}>
                  {p.name}
                </AppText>
                <AppText style={styles.meta} numberOfLines={1}>
                  {[placeLine(p), p.rating ? `★ ${p.rating.toFixed(1)}` : null].filter(Boolean).join(' · ') ||
                    p.address ||
                    'Public spot'}
                </AppText>
              </View>
              {p.distanceMiles != null ? (
                <AppText style={styles.distance}>{p.distanceMiles < 0.1 ? '<0.1' : p.distanceMiles.toFixed(1)} mi</AppText>
              ) : null}
            </Pressable>
          ))
        : null}
    </View>
  );
}

function HotRow({ place, onPress }: { place: Place; onPress: () => void }) {
  const stars = ratingLine(place);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.hotRow, pressed && styles.pressed]}>
      <View style={styles.flex}>
        <AppText style={styles.resultName} numberOfLines={1}>
          {place.name}
        </AppText>
        <AppText style={styles.meta} numberOfLines={1}>
          {stars ? <AppText style={styles.stars}>{stars}</AppText> : null}
          {stars && placeLine(place) ? ' · ' : ''}
          {placeLine(place)}
        </AppText>
        {place.why ? (
          <AppText style={styles.why} numberOfLines={2}>
            {place.why}
          </AppText>
        ) : null}
      </View>
      {place.distanceMiles != null ? (
        <AppText style={styles.distance}>
          {place.distanceMiles < 0.1 ? '<0.1' : place.distanceMiles.toFixed(1)} mi
        </AppText>
      ) : null}
    </Pressable>
  );
}

function ModeButton({
  icon,
  label,
  on,
  onPress,
  grid,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  on: boolean;
  onPress: () => void;
  grid?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.mode, grid && styles.modeGrid, on && styles.modeOn, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={rs(16)} color={on ? '#fff' : colors.brandBright} />
      <AppText style={[styles.modeText, on && styles.modeTextOn]} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  wrap: { gap: 10 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  modes: { flexDirection: 'row', gap: 8 },
  modesGrid: { flexWrap: 'wrap' },
  modeGrid: { flexBasis: '45%' },
  mode: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radii.input,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeOn: { backgroundColor: colors.brand, borderColor: colors.brandBright },
  modeText: { flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  modeTextOn: { color: '#fff' },
  pressed: { opacity: 0.8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: radii.input,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brandBright,
  },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 13 },
  listTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.input,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  hotHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  hotTitle: { color: '#FF9A6B', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  hotSub: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  hotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.input,
    backgroundColor: 'rgba(255,122,69,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,69,0.35)',
  },
  stars: { color: '#FFC24B', fontSize: 13, fontWeight: '700' },
  why: { color: colors.text, fontSize: 13, lineHeight: 18, opacity: 0.85, marginTop: 2 },
  resultName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 13 },
  distance: { color: colors.brandBright, fontSize: 13, fontWeight: '700' },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: 'rgba(124,58,237,0.16)',
    borderWidth: 1.5,
    borderColor: colors.brandBright,
  },
  selectedIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  selectedName: { color: colors.text, fontSize: 17, fontWeight: '800' },
  change: { color: colors.brandBright, fontSize: 14, fontWeight: '800' },
  dim: { opacity: 0.4 },
});
