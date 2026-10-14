import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { LiveModeSwitch } from '@/components/friendDate/LiveModeSwitch';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { AFTER_HOURS_START_HOUR } from '@/constants/afterHours';
import { colors, gradients, spacing } from '@/constants/theme';
import { FOOD_CUISINES, type FoodCuisine } from '@/constants/tonightVibe';
import {
  inRoom,
  joinRoom,
  LATE_PLANS,
  roomLive,
  roomOpen,
  visibleRooms,
  type LatePlan,
  type Room,
  type RoomId,
} from '@/features/explore/rooms';
import { fetchLiveRoomPeople, type RoomPerson } from '@/features/live/firestoreLive';
import { syncLiveSessionPatch } from '@/features/live/restoreLiveSession';
import { getHere, getHereQuietly, useTravelTrip } from '@/features/location/effective';
import type { LatLng } from '@/features/places/search';
import { analytics } from '@/lib/analytics';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { isPlusActive, preferredRadius } from '@/lib/entitlements';
import { isBackendConfigured } from '@/lib/env';
import { rs, ScaledSheet } from '@/lib/scale';
import { useHiddenUserMap } from '@/store/blocks';
import { useExploreRoom } from '@/store/exploreRoom';
import { useFeedMode } from '@/store/friendDate';
import { useSessionStore } from '@/store/session';
import { calculateAge, isLiveSessionActive } from '@/utils/time';

const round2 = (n: number) => Math.round(n * 100) / 100;

function Faces({ people, extra }: { people: RoomPerson[]; extra: number }) {
  return (
    <View style={styles.faces}>
      {people.map((p, i) =>
        p.photo ? (
          <Image
            key={p.userId}
            source={{ uri: p.photo }}
            style={[styles.face, i > 0 && styles.faceOverlap]}
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View key={p.userId} style={[styles.face, styles.faceEmpty, i > 0 && styles.faceOverlap]}>
            <Ionicons name="person" size={rs(13)} color={colors.textSecondary} />
          </View>
        ),
      )}
      {extra > 0 ? (
        <View style={[styles.face, styles.faceMore, styles.faceOverlap]}>
          <AppText style={styles.faceMoreText}>+{extra}</AppText>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, on, friend, onPress }: { label: string; on: boolean; friend: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.chip, on && (friend ? styles.chipFriendOn : styles.chipOn), pressed && styles.pressed]}
    >
      <AppText style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const mode = useFeedMode();
  const friend = mode === 'friend';
  const entitlements = useSessionStore((s) => s.entitlements);
  const plus = isPlusActive(entitlements);
  const preferredMiles = useSessionStore((s) => s.preferences?.maxDistanceMiles);
  const liveSession = useSessionStore((s) => s.liveSession);
  const setLiveSession = useSessionStore((s) => s.setLiveSession);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const live = liveSession ? isLiveSessionActive(liveSession, now) : false;
  const dob = useSessionStore((s) => s.profile?.dateOfBirth ?? null);
  const age = useMemo(() => {
    try {
      return dob ? calculateAge(dob) : null;
    } catch {
      return null;
    }
  }, [dob]);
  const rooms = useMemo(() => visibleRooms(mode, age), [mode, age]);
  const drinksOk = rooms.some((r) => r.id === 'drinks');
  const latePlans = useMemo(() => LATE_PLANS.filter((p) => drinksOk || p.value !== 'drinks'), [drinksOk]);

  const [cuisine, setCuisine] = useState<FoodCuisine>('anything');
  const [late, setLate] = useState<LatePlan>('surprise');

  const trip = useTravelTrip();
  const tripKey = trip ? `${trip.city}|${trip.latitude}|${trip.longitude}` : 'here';
  const radius = live && liveSession ? liveSession.radiusMiles : preferredRadius(entitlements, preferredMiles);

  const centerQuery = useQuery({
    queryKey: ['explore-center', tripKey],
    queryFn: async (): Promise<LatLng> => (await getHereQuietly()) ?? (await getHere()),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const center = centerQuery.data ? { lat: round2(centerQuery.data.lat), lng: round2(centerQuery.data.lng) } : null;

  const peopleQuery = useQuery({
    queryKey: ['explore-rooms', mode, center?.lat, center?.lng, radius],
    queryFn: () => fetchLiveRoomPeople({ latitude: center!.lat, longitude: center!.lng }, radius, mode),
    enabled: Boolean(center) && isBackendConfigured(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const hidden = useHiddenUserMap();
  const people = useMemo(
    () => (peopleQuery.data ?? []).filter((p) => !hidden[p.userId]),
    [peopleQuery.data, hidden],
  );
  const counted = peopleQuery.isSuccess;

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    analytics.track('explore_opened', { mode, travel: Boolean(trip), live });
  }, [mode, trip, live]);

  const mine = useMemo(
    () => ({
      activities: liveSession?.activities ?? [],
      foodCuisines: liveSession?.foodCuisines ?? [],
      afterHours: liveSession?.afterHours ?? [],
    }),
    [liveSession],
  );
  const myRooms = live ? rooms.filter((r) => inRoom(mine, r.id)) : [];

  const options = (room: RoomId) => ({ cuisine: room === 'foodie' ? cuisine : null, late: room === 'late' ? late : null });

  const goLiveIn = (room: Room) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    analytics.track('explore_go_live_tapped', { room: room.id, mode });
    useExploreRoom.getState().requestGoLive({ ...roomLive(room.id, options(room.id)), room: room.id });
    router.navigate('/(tabs)/live');
  };

  const browse = (room: Room) => {
    void Haptics.selectionAsync();
    if (room.id === 'late' && !plus) {
      openUpgrade(router, 'after_hours');
      return;
    }
    analytics.track('explore_room_browsed', { room: room.id, mode });
    useExploreRoom.getState().setRoom(room.id);
    router.navigate('/(tabs)/live');
  };

  const join = (room: Room) => {
    if (!liveSession) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    analytics.track('explore_room_joined', { room: room.id, mode });
    const next = joinRoom(mine, room.id, options(room.id));
    setLiveSession({ ...liveSession, ...next });
    void syncLiveSessionPatch(next);
    if (room.id === 'late' && !plus) {
      useExploreRoom.getState().setRoom(null);
      router.navigate('/(tabs)/live');
      return;
    }
    useExploreRoom.getState().setRoom(room.id);
    router.navigate('/(tabs)/live');
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/live');
  };

  const totalLive = people.length;
  const where = trip ? trip.city : null;
  const locationLine = trip
    ? `✈️ Tonight in ${trip.city} · Travel Mode`
    : centerQuery.isError
      ? '📍 Turn on location to see who’s Live near you'
      : `📍 Near you · within ${radius} mi`;
  const lateStarts = `${AFTER_HOURS_START_HOUR % 12 || 12} PM`;

  const renderRoom = (room: Room) => {
    const inside = people.filter((p) => inRoom(p, room.id));
    const count = inside.length;
    const open = roomOpen(room.id, now);
    const lockedFaces = room.id === 'late' && !plus;
    const imIn = myRooms.some((r) => r.id === room.id);
    const countText = !counted
      ? peopleQuery.isPending && center
        ? 'Checking who’s Live…'
        : 'Live rooms near you'
      : count === 0
        ? 'No one yet. Be the first.'
        : `${count} Live ${where ? `in ${where}` : 'nearby'}`;

    let primary: { label: string; onPress: () => void } | null = null;
    let secondary: { label: string; onPress: () => void } | null = null;
    if (!open) {
      primary = null;
    } else if (!live) {
      primary = { label: `Go Live in ${room.label}`, onPress: () => goLiveIn(room) };
    } else if (imIn) {
      primary = { label: lockedFaces ? 'See who’s here ✦' : `See who’s in ${room.label}`, onPress: () => browse(room) };
    } else {
      primary = { label: `Join ${room.label}`, onPress: () => join(room) };
      secondary = { label: lockedFaces ? 'Just look ✦' : 'Just look', onPress: () => browse(room) };
    }

    return (
      <View key={room.id} style={[styles.room, !open && styles.roomClosed]}>
        <LinearGradient colors={room.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.roomArt} pointerEvents="none" />
        <View style={styles.roomTop}>
          <AppText style={styles.roomEmoji}>{room.emoji}</AppText>
          <View style={styles.roomText}>
            <View style={styles.roomTitleRow}>
              <AppText style={styles.roomTitle}>{room.label}</AppText>
              {imIn ? (
                <View style={[styles.youPill, friend && styles.youPillFriend]}>
                  <AppText style={styles.youPillText}>You’re in</AppText>
                </View>
              ) : null}
              {room.id === 'late' && !plus ? <AppText style={styles.plusMark}>✦</AppText> : null}
            </View>
            <AppText style={styles.roomBlurb}>{room.blurb}</AppText>
          </View>
        </View>

        <View style={styles.liveRow}>
          {count > 0 ? <View style={[styles.liveDot, friend && styles.liveDotFriend]} /> : null}
          <AppText style={[styles.liveText, count > 0 && styles.liveTextOn]} numberOfLines={1}>
            {open ? countText : `Opens at ${lateStarts}`}
          </AppText>
          {count > 0 && open && !lockedFaces ? <Faces people={inside.slice(0, 4)} extra={Math.max(0, count - 4)} /> : null}
          {count > 0 && open && lockedFaces ? <Ionicons name="lock-closed" size={rs(14)} color={colors.textSecondary} /> : null}
        </View>

        {open && room.id === 'foodie' && (!live || !imIn) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[...FOOD_CUISINES.filter((c) => c.value === 'anything'), ...FOOD_CUISINES.filter((c) => c.value !== 'anything')].map((c) => (
              <Chip key={c.value} label={c.label} on={cuisine === c.value} friend={friend} onPress={() => setCuisine(c.value)} />
            ))}
          </ScrollView>
        ) : null}
        {open && room.id === 'late' && (!live || !imIn) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {latePlans.map((p) => (
              <Chip key={p.value} label={p.label} on={late === p.value} friend={friend} onPress={() => setLate(p.value)} />
            ))}
          </ScrollView>
        ) : null}

        {primary ? (
          <View style={styles.actions}>
            <Pressable
              onPress={primary.onPress}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <LinearGradient
                colors={friend ? ['#14B8A6', '#0F766E'] : [...gradients.brand]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryFill}
              >
                <Ionicons name={live ? (imIn ? 'people' : 'add-circle') : 'flash'} size={rs(16)} color="#fff" />
                <AppText style={styles.primaryText} numberOfLines={1}>
                  {primary.label}
                </AppText>
              </LinearGradient>
            </Pressable>
            {secondary ? (
              <Pressable
                onPress={secondary.onPress}
                accessibilityRole="button"
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              >
                <AppText style={styles.secondaryText} numberOfLines={1}>
                  {secondary.label}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {open && room.id === 'late' && !plus ? (
          <AppText style={styles.roomFoot}>Anyone can go Live here. Seeing who’s in After Hours is DateToday+.</AppText>
        ) : null}
      </View>
    );
  };

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          <AppText style={[styles.location, trip && styles.locationTrip]} numberOfLines={1}>
            {locationLine}
          </AppText>
        </View>

        {live && myRooms.length ? (
          <Pressable
            onPress={() => router.navigate('/(tabs)/live')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.liveBanner, friend && styles.liveBannerFriend, pressed && styles.pressed]}
          >
            <Ionicons name="flash" size={rs(16)} color={friend ? colors.friend : colors.brandBright} />
            <AppText style={styles.liveBannerText} numberOfLines={1}>
              You’re Live in {myRooms.map((r) => r.label).join(' + ')}
            </AppText>
            <Ionicons name="chevron-forward" size={rs(16)} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        <View style={styles.howRow}>
          <AppText style={styles.how}>
            {counted && totalLive > 0
              ? `${totalLive} ${totalLive === 1 ? 'person is' : 'people are'} Live ${where ? `in ${where}` : 'near you'} right now.`
              : 'Pick what you’re in the mood for and go Live in it.'}{' '}
            Match first, then pick the place together.
          </AppText>
        </View>

        <View style={styles.rooms}>{rooms.map(renderRoom)}</View>

        <AppText style={styles.privacy}>
          Rooms only show who’s Live for what. Your exact location is never shown to anyone.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: { paddingBottom: 40 },
  headerGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 220 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: 6,
  },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  titleBlock: { paddingHorizontal: spacing.md, paddingTop: 10, gap: 3 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: colors.textSecondary, fontSize: 15 },
  location: { marginTop: 6, color: colors.text, fontSize: 13, fontWeight: '600' },
  locationTrip: { color: colors.brandBright },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginHorizontal: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.5)',
    backgroundColor: 'rgba(168,85,247,0.12)',
  },
  liveBannerFriend: { borderColor: 'rgba(94,234,212,0.45)', backgroundColor: 'rgba(94,234,212,0.08)' },
  liveBannerText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  howRow: { paddingHorizontal: spacing.md, paddingTop: 14 },
  how: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  rooms: { gap: 14, paddingHorizontal: spacing.md, paddingTop: 14 },
  room: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    padding: 16,
    gap: 12,
    backgroundColor: colors.card,
  },
  roomClosed: { opacity: 0.6 },
  roomArt: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  roomTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roomEmoji: { fontSize: 34, lineHeight: 42 },
  roomText: { flex: 1, minWidth: 0, gap: 2 },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  roomBlurb: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  plusMark: { color: colors.brandBright, fontSize: 14, fontWeight: '800' },
  youPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(168,85,247,0.35)',
  },
  youPillFriend: { backgroundColor: 'rgba(20,184,166,0.4)' },
  youPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  liveDotFriend: { backgroundColor: colors.friend },
  liveText: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  liveTextOn: { color: '#fff', fontWeight: '800' },
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(12,8,20,0.9)',
    backgroundColor: colors.elevated,
  },
  faceOverlap: { marginLeft: -9 },
  faceEmpty: { alignItems: 'center', justifyContent: 'center' },
  faceMore: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  faceMoreText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  chips: { gap: 8 },
  chip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
  },
  chipOn: { borderColor: colors.brandBright, backgroundColor: 'rgba(168,85,247,0.35)' },
  chipFriendOn: { borderColor: colors.friend, backgroundColor: 'rgba(20,184,166,0.3)' },
  chipText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 10 },
  primary: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  primaryFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  secondary: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  secondaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  roomFoot: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17 },
  privacy: {
    paddingHorizontal: spacing.lg,
    paddingTop: 18,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  pressed: { opacity: 0.82 },
});
