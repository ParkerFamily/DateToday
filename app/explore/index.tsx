import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { ExploreCard } from '@/components/explore/ExploreCard';
import { MakePlanSheet } from '@/components/explore/MakePlanSheet';
import { LiveModeSwitch } from '@/components/friendDate/LiveModeSwitch';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { AFTER_HOURS_START_HOUR } from '@/constants/afterHours';
import { colors, spacing } from '@/constants/theme';
import { findSomeoneFor, isLiveNow, openDirections, planWithMatch, type PlanPrefill } from '@/features/explore/actions';
import { explorePlaces, exploreEvents } from '@/features/explore/api';
import {
  DEFAULT_EVENT_RADIUS,
  DEFAULT_PLACE_RADIUS,
  EVENT_FILTERS,
  FOODIE_STYLES,
  PLACE_RADII,
  categoryInfo,
  eventKind,
  eventTag,
  eventWhenLabel,
  hoursLine,
  planShape,
  priceLabel,
  visibleCategories,
  type EventFilter,
  type EventWindow,
  type ExploreCategory,
  type ExploreEvent,
  type ExplorePlace,
  type FoodieStyle,
  type PlaceCategory,
} from '@/features/explore/catalog';
import { formatMiles, getMyLocation, ratingLine, type LatLng } from '@/features/places/search';
import { usableTrip } from '@/features/travel/trip';
import { analytics } from '@/lib/analytics';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { isPlusActive } from '@/lib/entitlements';
import { rs, ScaledSheet } from '@/lib/scale';
import { useFeedMode, useFriendDateMode } from '@/store/friendDate';
import { useSessionStore } from '@/store/session';
import { useTravelMode } from '@/store/travelMode';
import type { MatchDoc } from '@/features/matches/api';
import type { FoodCuisine } from '@/constants/tonightVibe';
import type { LiveMode, TonightActivity } from '@/types';
import { calculateAge, isLiveSessionActive } from '@/utils/time';

type Row =
  | { type: 'place'; key: string; place: ExplorePlace }
  | { type: 'event'; key: string; event: ExploreEvent }
  | { type: 'section'; key: string; title: string }
  | { type: 'note'; key: string; text: string };

type PlanTarget = {
  emoji: string;
  title: string;
  subtitle: string | null;
  prefill: PlanPrefill;
  find: { activity: TonightActivity; cuisine: FoodCuisine | null; spot: string };
  category: ExploreCategory;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function join(parts: (string | null | undefined | false)[]) {
  return parts.filter(Boolean).join(' · ') || null;
}

function Chip({
  label,
  on,
  onPress,
  friend,
  icon,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  friend?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.chip, on && (friend ? styles.chipFriendOn : styles.chipOn), pressed && styles.pressed]}
    >
      {icon ? <Ionicons name={icon} size={rs(13)} color={on ? colors.text : colors.textSecondary} /> : null}
      <AppText style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

function StateCard({
  icon,
  title,
  body,
  action,
  onAction,
  secondary,
  onSecondary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
  secondary?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.state}>
      <View style={styles.stateIcon}>
        <Ionicons name={icon} size={rs(24)} color={colors.brandBright} />
      </View>
      <AppText style={styles.stateTitle}>{title}</AppText>
      <AppText style={styles.stateBody}>{body}</AppText>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}>
          <AppText style={styles.stateButtonText}>{action}</AppText>
        </Pressable>
      ) : null}
      {secondary && onSecondary ? (
        <Pressable onPress={onSecondary} accessibilityRole="button" hitSlop={8}>
          <AppText style={styles.stateLink}>{secondary}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function LoadingCards() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.brandBright} />
      {[0, 1].map((i) => (
        <View key={i} style={styles.skeleton}>
          <View style={styles.skeletonPhoto} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonShort]} />
        </View>
      ))}
    </View>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const mode = useFeedMode();
  const friend = mode === 'friend';
  const entitlements = useSessionStore((s) => s.entitlements);
  const plus = isPlusActive(entitlements);
  const dob = useSessionStore((s) => s.profile?.dateOfBirth ?? null);
  const age = useMemo(() => {
    try {
      return dob ? calculateAge(dob) : null;
    } catch {
      return null;
    }
  }, [dob]);
  const categories = useMemo(() => visibleCategories(mode, age), [mode, age]);

  const [category, setCategory] = useState<ExploreCategory>(() => {
    const wanted = categories.find((c) => c.value === params.category);
    return wanted?.value ?? 'foodie';
  });
  useEffect(() => {
    if (!categories.some((c) => c.value === category)) setCategory('foodie');
  }, [categories, category]);

  const [style, setStyle] = useState<FoodieStyle>('anything');
  const [placeRadius, setPlaceRadius] = useState<number>(DEFAULT_PLACE_RADIUS);
  const [eventRadius, setEventRadius] = useState<number>(DEFAULT_EVENT_RADIUS);
  const [openOnly, setOpenOnly] = useState(false);
  const [topRated, setTopRated] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [eventWindow, setEventWindow] = useState<EventWindow>('tonight');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [planTarget, setPlanTarget] = useState<PlanTarget | null>(null);

  // Travel Mode: the trip you're Live with, else a usable saved trip (DateToday+), else where you are.
  const liveTrip = useSessionStore((s) =>
    s.liveSession && isLiveSessionActive(s.liveSession, new Date()) ? (s.liveSession.trip ?? null) : null,
  );
  const savedTrip = useTravelMode((s) => s.trip);
  const userId = useSessionStore((s) => s.userId);
  useEffect(() => {
    void useTravelMode.getState().hydrate(userId);
  }, [userId]);
  const trip = liveTrip ?? (plus ? usableTrip(savedTrip) : null);
  const tripKey = trip ? `${trip.city}|${trip.latitude}|${trip.longitude}` : 'here';

  const centerQuery = useQuery({
    queryKey: ['explore-center', tripKey],
    queryFn: async (): Promise<LatLng> =>
      trip ? { lat: trip.latitude, lng: trip.longitude } : await getMyLocation(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const center = centerQuery.data ? { lat: round3(centerQuery.data.lat), lng: round3(centerQuery.data.lng) } : null;

  const isPlaces = category !== 'events';
  const lateLocked = category === 'late' && !plus;
  const placesQuery = useQuery({
    queryKey: ['explore-places', category, category === 'foodie' ? style : null, placeRadius, center?.lat, center?.lng],
    queryFn: () =>
      explorePlaces({
        center: center!,
        category: category as PlaceCategory,
        style: category === 'foodie' ? style : null,
        radiusMiles: placeRadius,
      }),
    enabled: Boolean(center) && isPlaces && !lateLocked,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const wantsEvents = category === 'events' || (category === 'late' && plus);
  const activeWindow: EventWindow = category === 'late' ? 'tonight' : eventWindow;
  const eventsQuery = useQuery({
    queryKey: ['explore-events', activeWindow, eventRadius, center?.lat, center?.lng],
    queryFn: () => exploreEvents({ center: center!, radiusMiles: eventRadius, window: activeWindow }),
    enabled: Boolean(center) && wantsEvents,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    analytics.track('explore_opened', { mode, travel: Boolean(trip), live: isLiveNow() });
  }, [mode, trip]);

  const pickCategory = (value: ExploreCategory) => {
    if (value === category) return;
    void Haptics.selectionAsync();
    setCategory(value);
    analytics.track('explore_category_selected', { category: value, mode });
  };

  const places = placesQuery.data?.places ?? [];
  const provider = placesQuery.data?.provider ?? null;
  const hasHours = places.some((p) => p.openNow != null);
  const hasRatings = places.some((p) => p.rating != null);
  const hasPrices = places.some((p) => p.priceLevel != null);
  const shownPlaces = useMemo(() => {
    let list = places;
    if (category === 'late' && hasHours) list = list.filter((p) => p.lateTonight !== false);
    if (openOnly && hasHours) list = list.filter((p) => p.openNow === true);
    if (topRated && hasRatings) list = list.filter((p) => (p.rating ?? 0) >= 4);
    if (maxPrice != null && hasPrices) list = list.filter((p) => p.priceLevel != null && p.priceLevel <= maxPrice);
    return list;
  }, [places, category, hasHours, openOnly, topRated, hasRatings, maxPrice, hasPrices]);

  const events = eventsQuery.data ?? [];
  const shownEvents = useMemo(() => {
    if (category === 'late') {
      return events.filter((e) => e.localTime && Number(e.localTime.slice(0, 2)) >= AFTER_HOURS_START_HOUR);
    }
    return eventFilter === 'all' ? events : events.filter((e) => eventKind(e) === eventFilter);
  }, [events, eventFilter, category]);

  const filtersOn = openOnly || topRated || maxPrice != null;
  const clearFilters = () => {
    setOpenOnly(false);
    setTopRated(false);
    setMaxPrice(null);
  };

  const rows: Row[] = useMemo(() => {
    if (category === 'events') return shownEvents.map((e) => ({ type: 'event', key: e.id, event: e }));
    const out: Row[] = [];
    if (category === 'movies' && shownPlaces.length) {
      out.push({ type: 'note', key: 'movies-note', text: 'Theaters near you. Showtimes aren’t listed here, so check with the theater before you go.' });
    }
    if (category === 'late' && shownPlaces.length && !hasHours) {
      out.push({ type: 'note', key: 'late-note', text: 'Late-night spots nearby. Hours vary, so check before you head out.' });
    }
    out.push(...shownPlaces.map((p) => ({ type: 'place' as const, key: p.id, place: p })));
    if (category === 'late' && shownEvents.length) {
      out.push({ type: 'section', key: 'late-shows', title: 'Late shows tonight' });
      out.push(...shownEvents.map((e) => ({ type: 'event' as const, key: e.id, event: e })));
    }
    return out;
  }, [category, shownEvents, shownPlaces, hasHours]);

  const info = categoryInfo(category);

  const openPlace = (p: ExplorePlace) => {
    analytics.track('explore_place_opened', { category, source: p.source });
    const url =
      p.mapsUri ??
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address, p.area].filter(Boolean).join(' '))}`;
    void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
  };

  const openEvent = (e: ExploreEvent) => {
    analytics.track('explore_event_opened', { source: e.source, kind: eventKind(e) });
    void WebBrowser.openBrowserAsync(e.url).catch(() => Linking.openURL(e.url));
  };

  const placeTarget = (p: ExplorePlace): PlanTarget => {
    const shape = planShape(category, { style, kind: p.kind });
    return {
      emoji: info.emoji,
      title: p.name,
      subtitle: join([p.kind, p.area, formatMiles(p.distanceMiles)]),
      category,
      prefill: {
        activity: shape.plan,
        label: shape.label,
        startsAt: null,
        venueName: p.name,
        venueAddress: p.address,
        neighborhood: p.area,
        venueLat: p.lat,
        venueLng: p.lng,
      },
      find: { activity: shape.activity, cuisine: shape.cuisine, spot: p.name },
    };
  };

  const eventTarget = (e: ExploreEvent): PlanTarget => {
    const shape = planShape('events');
    return {
      emoji: '🎟',
      title: e.name,
      subtitle: join([eventWhenLabel(e), e.venueName]),
      category: 'events',
      prefill: {
        activity: shape.plan,
        label: `🎟 ${e.name}`.slice(0, 60),
        startsAt: e.startsAt,
        venueName: e.venueName ?? e.name,
        venueAddress: e.address,
        neighborhood: e.area,
        venueLat: e.lat,
        venueLng: e.lng,
      },
      find: { activity: shape.activity, cuisine: null, spot: e.name },
    };
  };

  const makePlan = (target: PlanTarget) => {
    void Haptics.selectionAsync();
    analytics.track('explore_make_plan_tapped', { category: target.category, mode });
    setPlanTarget(target);
  };

  /** Close the plan sheet first: iOS drops alerts and pushes started while a modal is still dismissing. */
  const afterSheet = (run: () => void) => {
    if (!planTarget) {
      run();
      return;
    }
    setPlanTarget(null);
    setTimeout(run, Platform.OS === 'ios' ? 450 : 60);
  };

  const findSomeone = (target: PlanTarget, forMode: LiveMode = mode) => {
    void Haptics.selectionAsync();
    const live = isLiveNow();
    analytics.track('explore_find_someone_tapped', { category: target.category, mode: forMode, live });
    afterSheet(() => {
      if (forMode !== mode) {
        if (live) {
          Alert.alert(
            mode === 'friend' ? 'You’re Live for a Friend Date' : 'You’re Live for dating',
            'Switch modes on the Live screen to find someone for this kind of plan.',
          );
          return;
        }
        useFriendDateMode.getState().setMode(forMode);
      }
      if (!live) {
        findSomeoneFor(router, target.find);
        return;
      }
      Alert.alert(
        'Add it to your Live plan?',
        `People nearby will see “${target.find.spot}” as your plan tonight. Nothing is sent to anyone.`,
        [
          { text: 'Just browse', onPress: () => findSomeoneFor(router, target.find) },
          { text: 'Add it', onPress: () => findSomeoneFor(router, target.find, { addToLivePlan: true }) },
        ],
      );
    });
  };

  const pickMatch = (match: MatchDoc) => {
    if (!planTarget) return;
    const target = planTarget;
    afterSheet(() => planWithMatch(router, match, target.prefill));
  };

  const askRadius = (current: number, set: (n: number) => void) => {
    Alert.alert(
      'Distance',
      'How far are you willing to go?',
      [
        ...PLACE_RADII.map((n) => ({ text: `${n === current ? '✓ ' : ''}Within ${n} mi`, onPress: () => set(n) })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const askPrice = () => {
    Alert.alert('Price', 'Only where prices are listed.', [
      { text: 'Any price', onPress: () => setMaxPrice(null) },
      ...[1, 2, 3].map((n) => ({ text: `Up to ${priceLabel(n)}`, onPress: () => setMaxPrice(n) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/live');
  };

  const radius = isPlaces ? placeRadius : eventRadius;
  const setRadius = isPlaces ? setPlaceRadius : setEventRadius;
  const nextRadius = PLACE_RADII.find((n) => n > radius) ?? null;

  const locationLine = trip
    ? `✈️ Exploring ${trip.city} · Travel Mode`
    : centerQuery.data
      ? `📍 Near you · within ${radius} mi`
      : '📍 Finding where you are…';

  const header = (
    <View>
      <LinearGradient
        colors={friend ? ['rgba(20,184,166,0.22)', 'rgba(9,9,11,0)'] : ['rgba(124,58,237,0.32)', 'rgba(9,9,11,0)']}
        style={styles.headerGlow}
        pointerEvents="none"
      />
      <View style={styles.topRow}>
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.backButton}>
          <Ionicons name="chevron-back" size={rs(24)} color={colors.text} />
        </Pressable>
        <LiveModeSwitch compact />
      </View>
      <View style={styles.titleBlock}>
        <AppText style={styles.title}>Explore Tonight</AppText>
        <AppText style={styles.subtitle}>Find something worth going out for.</AppText>
        <Pressable
          onPress={() => (trip ? router.push('/travel') : askRadius(radius, setRadius))}
          accessibilityRole="button"
          hitSlop={6}
        >
          <AppText style={[styles.location, trip && styles.locationTrip]} numberOfLines={1}>
            {locationLine}
          </AppText>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {categories.map((c) => {
          const on = c.value === category;
          return (
            <Pressable
              key={c.value}
              onPress={() => pickCategory(c.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c.label}
              style={({ pressed }) => [styles.tile, on && (friend ? styles.tileFriendOn : styles.tileOn), pressed && styles.pressed]}
            >
              <AppText style={styles.tileEmoji}>{c.emoji}</AppText>
              <AppText style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={1}>
                {c.label}
              </AppText>
              {c.plusOnly && !plus ? (
                <View style={styles.plusTag}>
                  <AppText style={styles.plusTagText}>✦</AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {!lateLocked ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip
            label={`Within ${radius} mi`}
            icon="location-outline"
            on={false}
            onPress={() => askRadius(radius, setRadius)}
          />
          {category === 'foodie'
            ? FOODIE_STYLES.map((s) => (
                <Chip key={s.value} label={s.label} on={style === s.value} friend={friend} onPress={() => setStyle(s.value)} />
              ))
            : null}
          {category === 'events' ? (
            <>
              <Chip label="Tonight" on={eventWindow === 'tonight'} friend={friend} onPress={() => setEventWindow('tonight')} />
              <Chip label="Coming up" on={eventWindow === 'soon'} friend={friend} onPress={() => setEventWindow('soon')} />
              {EVENT_FILTERS.map((f) => (
                <Chip key={f.value} label={f.label} on={eventFilter === f.value} friend={friend} onPress={() => setEventFilter(f.value)} />
              ))}
            </>
          ) : null}
          {isPlaces && hasHours ? (
            <Chip label="Open now" icon="time-outline" on={openOnly} friend={friend} onPress={() => setOpenOnly((v) => !v)} />
          ) : null}
          {isPlaces && hasRatings ? (
            <Chip label="4★ & up" on={topRated} friend={friend} onPress={() => setTopRated((v) => !v)} />
          ) : null}
          {isPlaces && hasPrices ? (
            <Chip
              label={maxPrice != null ? `Up to ${priceLabel(maxPrice)}` : 'Price'}
              on={maxPrice != null}
              friend={friend}
              onPress={askPrice}
            />
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );

  let body: ReactNode = null;
  if (centerQuery.isError) {
    body = (
      <StateCard
        icon="location-outline"
        title="Turn on location to explore"
        body="We use it only to find spots near you. It’s never shown to anyone."
        action="Try again"
        onAction={() => void centerQuery.refetch()}
        secondary={Platform.OS === 'web' ? undefined : 'Open Settings'}
        onSecondary={() => void Linking.openSettings()}
      />
    );
  } else if (lateLocked) {
    body = (
      <StateCard
        icon="moon"
        title="After Hours is part of DateToday+"
        body="Spots open late tonight and late shows nearby, for when the night’s still going."
        action="Unlock After Hours"
        onAction={() => openUpgrade(router, 'after_hours')}
      />
    );
  } else if (!center || (isPlaces ? placesQuery.isPending : eventsQuery.isPending)) {
    body = <LoadingCards />;
  } else if (isPlaces && placesQuery.isError) {
    body = (
      <StateCard
        icon="cloud-offline-outline"
        title="Couldn’t load places right now"
        body="Try again in a moment."
        action="Try again"
        onAction={() => void placesQuery.refetch()}
      />
    );
  } else if (!isPlaces && eventsQuery.isError) {
    body = (
      <StateCard
        icon="cloud-offline-outline"
        title="Couldn’t load events right now"
        body="Try again in a moment."
        action="Try again"
        onAction={() => void eventsQuery.refetch()}
      />
    );
  } else if (!rows.length) {
    if (isPlaces && places.length && filtersOn) {
      body = (
        <StateCard
          icon="options-outline"
          title="Nothing matches those filters"
          body="Loosen them up to see more spots."
          action="Clear filters"
          onAction={clearFilters}
        />
      );
    } else if (category === 'events' && events.length && eventFilter !== 'all') {
      body = (
        <StateCard
          icon="ticket-outline"
          title="Nothing like that nearby"
          body="Try another kind of event."
          action="Show all events"
          onAction={() => setEventFilter('all')}
        />
      );
    } else if (category === 'events' && eventWindow === 'tonight') {
      body = (
        <StateCard
          icon="ticket-outline"
          title="No events tonight nearby"
          body="See what’s coming up in the next two weeks."
          action="Show upcoming"
          onAction={() => setEventWindow('soon')}
        />
      );
    } else {
      body = (
        <StateCard
          icon="compass-outline"
          title="Nothing nearby yet"
          body="Try expanding your distance."
          action={nextRadius ? `Search within ${nextRadius} mi` : undefined}
          onAction={nextRadius ? () => setRadius(nextRadius) : undefined}
        />
      );
    }
  }

  const footer =
    rows.length && !body ? (
      <View style={styles.footer}>
        {isPlaces && provider ? (
          <AppText style={styles.attribution}>
            {provider === 'google' ? 'Places data © Google' : 'Map data © OpenStreetMap contributors'}
          </AppText>
        ) : null}
        {(category === 'events' || (category === 'late' && shownEvents.length > 0)) ? (
          <AppText style={styles.attribution}>Events and tickets from Ticketmaster</AppText>
        ) : null}
      </View>
    ) : null;

  const renderRow = ({ item }: { item: Row }) => {
    if (item.type === 'section') {
      return <AppText style={styles.section}>{item.title}</AppText>;
    }
    if (item.type === 'note') {
      return (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={rs(15)} color={colors.textSecondary} />
          <AppText style={styles.noteText}>{item.text}</AppText>
        </View>
      );
    }
    if (item.type === 'event') {
      const e = item.event;
      const target = eventTarget(e);
      return (
        <View style={styles.cardWrap}>
          <ExploreCard
            image={e.image}
            tint={categoryInfo('events').tint}
            emoji="🎟"
            badge={eventTag(e)}
            title={e.name}
            meta={join([e.venueName, e.area, formatMiles(e.distanceMiles)])}
            detail={eventWhenLabel(e)}
            address={e.address}
            primaryLabel="Make this the plan"
            onPrimary={() => makePlan(target)}
            onFind={() => findSomeone(target)}
            onDirections={e.lat != null && e.lng != null ? () => openDirections({ name: e.venueName ?? e.name, lat: e.lat, lng: e.lng }) : null}
            onOpen={() => openEvent(e)}
            openLabel="Tickets on Ticketmaster"
            friend={friend}
          />
        </View>
      );
    }
    const p = item.place;
    const target = placeTarget(p);
    return (
      <View style={styles.cardWrap}>
        <ExploreCard
          image={p.photo}
          tint={info.tint}
          emoji={info.emoji}
          badge={category === 'movies' ? 'Movie theater' : p.kind}
          title={p.name}
          meta={join([p.area, formatMiles(p.distanceMiles)])}
          detail={join([ratingLine(p), priceLabel(p.priceLevel)])}
          status={hoursLine(p)}
          address={p.address}
          credit={p.photo && p.photoCredit ? `Photo: ${p.photoCredit}` : null}
          primaryLabel={category === 'movies' ? 'Movie date here' : 'Make this the plan'}
          onPrimary={() => makePlan(target)}
          onFind={() => findSomeone(target)}
          onDirections={() => openDirections(p)}
          onOpen={() => openPlace(p)}
          openLabel={p.mapsUri ? 'View on Google Maps' : 'View on map'}
          friend={friend}
        />
      </View>
    );
  };

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <FlatList
        data={body ? [] : rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={body ? <View style={styles.bodyWrap}>{body}</View> : null}
        ListFooterComponent={footer}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        showsVerticalScrollIndicator={false}
        refreshing={false}
        onRefresh={() => void (isPlaces ? placesQuery.refetch() : eventsQuery.refetch())}
        initialNumToRender={4}
        windowSize={7}
      />
      <MakePlanSheet
        visible={Boolean(planTarget)}
        onClose={() => setPlanTarget(null)}
        emoji={planTarget?.emoji ?? info.emoji}
        title={planTarget?.title ?? ''}
        subtitle={planTarget?.subtitle ?? null}
        mode={mode}
        onPickMatch={pickMatch}
        onFind={(forMode) => planTarget && findSomeone(planTarget, forMode)}
      />
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingBottom: 40,
  },
  headerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: 6,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  titleBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  location: {
    marginTop: 6,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  locationTrip: { color: colors.brandBright },
  rail: {
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: 16,
    paddingBottom: 4,
  },
  tile: {
    width: 84,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tileOn: { borderColor: colors.brandBright, backgroundColor: 'rgba(168,85,247,0.18)' },
  tileFriendOn: { borderColor: colors.friend, backgroundColor: 'rgba(94,234,212,0.12)' },
  tileEmoji: { fontSize: 24, lineHeight: 30 },
  tileLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  tileLabelOn: { color: colors.text },
  plusTag: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
  plusTagText: { color: colors.brandBright, fontSize: 12, fontWeight: '800' },
  filters: {
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipOn: { borderColor: colors.brandBright, backgroundColor: 'rgba(168,85,247,0.2)' },
  chipFriendOn: { borderColor: colors.friend, backgroundColor: 'rgba(94,234,212,0.14)' },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: colors.text },
  gap: { height: 14 },
  cardWrap: { paddingHorizontal: spacing.md },
  bodyWrap: { paddingHorizontal: spacing.md },
  section: {
    marginTop: 10,
    marginHorizontal: spacing.md,
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  note: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    marginHorizontal: spacing.md,
  },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  footer: { paddingTop: 18, paddingHorizontal: spacing.md, gap: 4, alignItems: 'center' },
  attribution: { color: colors.textSecondary, fontSize: 11 },
  state: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.14)',
    marginBottom: 6,
  },
  stateTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  stateBody: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  stateButton: {
    marginTop: 10,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  stateButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  stateLink: { marginTop: 8, color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  loading: { gap: 14, paddingTop: 4 },
  skeleton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
    paddingBottom: 14,
    gap: 8,
  },
  skeletonPhoto: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.elevated },
  skeletonLine: { height: 12, marginHorizontal: 14, borderRadius: 6, backgroundColor: colors.elevated },
  skeletonShort: { width: '45%' },
  pressed: { opacity: 0.82 },
});
