import { AppText } from '@/components/ui/AppText';
import { friendlyError } from '@/lib/errors';
import { CloseButton, dismissToLive } from '@/components/ui/CloseButton';
import { Screen } from '@/components/ui/Screen';
import { PlacePicker, SelectedPlaceCard, placeLine } from '@/components/plan/PlacePicker';
import { colors, radii, spacing } from '@/constants/theme';
import { foodLabel, type FoodCuisine } from '@/constants/tonightVibe';
import { proposeDate } from '@/features/matches/api';
import { prefetchNearby, type Place, type PlanCategory } from '@/features/places/search';
import {
  availableSlots,
  dateForChoice,
  formatTime,
  pickableDays,
  sameDay,
  startsAt,
  suggestedTimes,
  whenLabel,
  whenSentence,
  type DayChoice,
} from '@/features/plan/when';
import { useSessionStore } from '@/store/session';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const KINDS: { value: PlanCategory; emoji: string; label: string; blurb: string }[] = [
  { value: 'drinks', emoji: '🍸', label: 'Drinks', blurb: 'Casual & easy' },
  { value: 'dinner', emoji: '🍽', label: 'Dinner', blurb: 'Sit down & talk' },
  { value: 'coffee', emoji: '☕', label: 'Coffee', blurb: 'Quick meetup' },
  { value: 'activity', emoji: '🎳', label: 'Activity', blurb: 'Something fun' },
];

const DAY_CHIPS: { value: DayChoice; label: string }[] = [
  { value: 'tonight', label: 'Tonight' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'weekend', label: 'Weekend' },
  { value: 'pick', label: 'Pick date' },
];

const tap = () => void Haptics.selectionAsync();

function displayName(raw: string) {
  const first = raw.trim().split(/\s+/)[0] || 'them';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function Avatar({ uri, size, style }: { uri?: string | null; size: number; style?: object }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  return uri ? (
    <Image source={{ uri }} style={[styles.avatar, box, style]} />
  ) : (
    <View style={[styles.avatar, styles.avatarEmpty, box, style]}>
      <Ionicons name="person" size={size * 0.45} color={colors.textSecondary} />
    </View>
  );
}

export default function PlanDateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    name?: string;
    photo?: string;
    food?: string;
    mode?: string;
    conversationId?: string;
  }>();
  const theirName = displayName(params.name ?? 'them');
  const theirPhoto = typeof params.photo === 'string' && params.photo ? params.photo : null;
  const myPhoto = useSessionStore((s) => s.profile?.mainPhotoUrl ?? null);
  const matchId = typeof params.conversationId === 'string' ? params.conversationId : '';
  const sharedFood =
    typeof params.food === 'string' && params.food.length ? (params.food as FoodCuisine) : null;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const tonightOpen = availableSlots(now, now).length > 0;
  const [category, setCategory] = useState<PlanCategory>(sharedFood ? 'dinner' : 'drinks');
  const [dayChoice, setDayChoice] = useState<DayChoice>(tonightOpen ? 'tonight' : 'tomorrow');
  const [pickedDay, setPickedDay] = useState<Date>(() => pickableDays(now)[0]);
  const todayKey = now.toDateString();
  const day = useMemo(
    () => (dayChoice === 'pick' ? pickedDay : dateForChoice(dayChoice, new Date(todayKey))),
    [dayChoice, pickedDay, todayKey],
  );
  const suggestions = useMemo(() => suggestedTimes(category, day, now), [category, day, now]);
  const allSlots = useMemo(() => availableSlots(day, now), [day, now]);
  const [time, setTime] = useState<number>(() => suggestions[1] ?? suggestions[0] ?? 20 * 60 + 30);
  const [moreTimes, setMoreTimes] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => void prefetchNearby(category, sharedFood), 400);
    return () => clearTimeout(timer);
  }, [category, sharedFood]);

  // Keep the chosen time valid when the day or date type changes (e.g. 7:30 PM already passed tonight).
  useEffect(() => {
    if (!allSlots.includes(time)) setTime(suggestions[1] ?? suggestions[0] ?? allSlots[0] ?? time);
  }, [allSlots, suggestions, time]);

  const kind = KINDS.find((k) => k.value === category) ?? KINDS[0];
  const scrollRef = useRef<ScrollView>(null);
  const whereY = useRef(0);
  const shake = useSharedValue(0);
  const whereShake = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const [whereNudge, setWhereNudge] = useState(false);

  const nudgeWhere = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setWhereNudge(true);
    setPicking(true);
    scrollRef.current?.scrollTo({ y: Math.max(0, whereY.current - 12), animated: true });
    shake.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 60 }),
      withTiming(-5, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    );
  };

  const submit = async () => {
    if (!place) {
      nudgeWhere();
      return;
    }
    if (!matchId) {
      Alert.alert('Open a chat first', 'Plans are sent inside a chat with your match.');
      return;
    }
    setSending(true);
    try {
      await proposeDate(matchId, {
        activity: category,
        activityLabel: `${kind.emoji} ${kind.label}`,
        whenLabel: whenLabel(day, time, now),
        startsAt: startsAt(day, time).toISOString(),
        venueName: place.name,
        venueAddress: place.address,
        neighborhood: place.area,
        venueLat: place.lat,
        venueLng: place.lng,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/chat/[conversationId]', params: { conversationId: matchId } });
    } catch (error) {
      Alert.alert('Couldn’t send invite', friendlyError(error, 'Try again.'));
    } finally {
      setSending(false);
    }
  };

  const visibleTimes = moreTimes ? allSlots : suggestions;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <View style={styles.root}>
        <Pressable style={styles.dim} onPress={() => dismissToLive(router)} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetAnchor}>
          <View style={styles.sheet}>
            <LinearGradient
              colors={['rgba(124,58,237,0.28)', 'rgba(18,16,26,0)']}
              style={styles.glow}
              pointerEvents="none"
            />
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.pair}>
                <Avatar uri={myPhoto} size={46} style={styles.avatarRing} />
                <Avatar uri={theirPhoto} size={46} style={[styles.avatarRing, styles.avatarOverlap]} />
                <View style={styles.pairHeart}>
                  <Ionicons name="heart" size={11} color="#fff" />
                </View>
              </View>
              <View style={styles.headerText}>
                <AppText style={styles.title}>Plan your date</AppText>
                <AppText style={styles.subtitle}>You + {theirName}</AppText>
              </View>
              <CloseButton onPress={() => dismissToLive(router)} />
            </View>

            {sharedFood ? (
              <View style={styles.sharedBanner}>
                <Ionicons name="sparkles" size={14} color={colors.live} />
                <AppText style={styles.sharedText}>You both said {foodLabel(sharedFood)}</AppText>
              </View>
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <AppText style={styles.heading}>What are you feeling?</AppText>
              <View style={styles.grid}>
                {KINDS.map((k) => {
                  const on = category === k.value;
                  return (
                    <Pressable
                      key={k.value}
                      onPress={() => {
                        tap();
                        setCategory(k.value);
                      }}
                      style={({ pressed }) => [styles.kindCard, on && styles.kindCardOn, pressed && styles.pressed]}
                    >
                      {on ? (
                        <LinearGradient
                          colors={['rgba(168,85,247,0.38)', 'rgba(124,58,237,0.12)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.kindGradient}
                        />
                      ) : null}
                      <AppText style={styles.kindEmoji}>{k.emoji}</AppText>
                      <AppText style={styles.kindLabel}>{k.label}</AppText>
                      <AppText style={[styles.kindBlurb, on && styles.kindBlurbOn]}>{k.blurb}</AppText>
                      {on ? (
                        <View style={styles.check}>
                          <Ionicons name="checkmark" size={13} color="#fff" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View onLayout={(e) => (whereY.current = e.nativeEvent.layout.y)}>
                <AppText style={styles.heading}>Where?</AppText>
              </View>
              <Animated.View style={[styles.whereBlock, whereShake]}>
                {place && !picking ? (
                  <SelectedPlaceCard
                    place={place}
                    onChange={() => {
                      tap();
                      setPicking(true);
                    }}
                  />
                ) : picking ? (
                  <PlacePicker
                    category={category}
                    cuisine={sharedFood}
                    onPick={(p) => {
                      setPlace(p);
                      setPicking(false);
                      setWhereNudge(false);
                    }}
                  />
                ) : (
                  <Pressable
                    onPress={() => {
                      tap();
                      setPicking(true);
                    }}
                    style={({ pressed }) => [styles.chooseRow, whereNudge && styles.chooseRowNudge, pressed && styles.pressed]}
                  >
                    <View style={styles.chooseIcon}>
                      <Ionicons name="location-outline" size={18} color={colors.brandBright} />
                    </View>
                    <AppText style={styles.chooseText}>Search for a place</AppText>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </Pressable>
                )}
              </Animated.View>

              <AppText style={styles.heading}>When?</AppText>
              <View style={styles.dayRow}>
                {DAY_CHIPS.map((d) => {
                  const on = dayChoice === d.value;
                  const disabled = d.value === 'tonight' && !tonightOpen;
                  return (
                    <Pressable
                      key={d.value}
                      disabled={disabled}
                      onPress={() => {
                        tap();
                        setDayChoice(d.value);
                        setMoreTimes(false);
                      }}
                      style={({ pressed }) => [
                        styles.dayChip,
                        on && styles.chipOn,
                        disabled && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <AppText style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                        {d.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {dayChoice === 'pick' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
                  {pickableDays(now).map((d) => {
                    const on = sameDay(d, pickedDay);
                    return (
                      <Pressable
                        key={d.toISOString()}
                        onPress={() => {
                          tap();
                          setPickedDay(d);
                        }}
                        style={({ pressed }) => [styles.dateChip, on && styles.chipOn, pressed && styles.pressed]}
                      >
                        <AppText style={[styles.dateDow, on && styles.chipTextOn]}>
                          {d.toLocaleDateString([], { weekday: 'short' })}
                        </AppText>
                        <AppText style={[styles.dateNum, on && styles.chipTextOn]}>{d.getDate()}</AppText>
                        <AppText style={[styles.dateDow, on && styles.chipTextOn]}>
                          {d.toLocaleDateString([], { month: 'short' })}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              <AppText style={styles.subheading}>{moreTimes ? 'All times' : 'Suggested times'}</AppText>
              <View style={styles.timeRow}>
                {visibleTimes.map((m) => {
                  const on = time === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        tap();
                        setTime(m);
                      }}
                      style={({ pressed }) => [
                        styles.timeChip,
                        moreTimes && styles.timeChipSmall,
                        on && styles.chipOn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <AppText style={[styles.timeText, on && styles.chipTextOn]}>{formatTime(m)}</AppText>
                    </Pressable>
                  );
                })}
              </View>
              {allSlots.length > suggestions.length ? (
                <Pressable
                  onPress={() => {
                    tap();
                    setMoreTimes((v) => !v);
                  }}
                  hitSlop={8}
                  style={styles.moreBtn}
                >
                  <AppText style={styles.moreText}>{moreTimes ? 'Fewer times' : 'More times'}</AppText>
                  <Ionicons name={moreTimes ? 'chevron-up' : 'chevron-down'} size={14} color={colors.brandBright} />
                </Pressable>
              ) : null}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.summary}>
                <View style={styles.summaryEmoji}>
                  <AppText style={styles.summaryEmojiText}>{kind.emoji}</AppText>
                </View>
                <View style={styles.summaryText}>
                  <AppText style={styles.summaryTitle}>{kind.label}</AppText>
                  <AppText style={styles.summaryWhen}>{whenSentence(day, time, now)}</AppText>
                  <AppText style={[styles.summaryPlace, !place && styles.summaryPlaceEmpty]} numberOfLines={1}>
                    {place
                      ? [place.name, place.area || placeLine(place)].filter(Boolean).join(' · ')
                      : 'Place not selected yet'}
                  </AppText>
                </View>
              </View>
              <Pressable
                onPress={() => void submit()}
                disabled={sending}
                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={['#7C3AED', '#C084FC']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <AppText style={styles.ctaText}>Send date invite ⚡</AppText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,5,6,0.6)' },
  dim: { ...StyleSheet.absoluteFill },
  sheetAnchor: { width: '100%', height: '93%' },
  sheet: {
    flex: 1,
    backgroundColor: colors.elevated,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    overflow: 'hidden',
  },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    marginBottom: 12,
  },
  pair: { flexDirection: 'row', alignItems: 'center' },
  avatar: { backgroundColor: colors.card },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarRing: { borderWidth: 2, borderColor: colors.elevated },
  avatarOverlap: { marginLeft: -14 },
  pairHeart: {
    position: 'absolute',
    left: 30,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandBright,
    borderWidth: 2,
    borderColor: colors.elevated,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 14, fontWeight: '600', marginTop: 1 },
  sharedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(34,229,139,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.3)',
  },
  sharedText: { color: colors.live, fontWeight: '700', fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 12 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.2, marginTop: 10 },
  subheading: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginTop: 4 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kindCard: {
    width: '48.5%',
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 104,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'flex-end',
    gap: 2,
  },
  kindGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 17 },
  kindCardOn: {
    borderColor: colors.brandBright,
    borderWidth: 1.5,
    shadowColor: colors.brandBright,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  kindEmoji: { fontSize: 28, lineHeight: 34, marginBottom: 4 },
  kindLabel: { color: colors.text, fontSize: 16, fontWeight: '800' },
  kindBlurb: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  kindBlurbOn: { color: '#E9D5FF' },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandBright,
  },
  whereBlock: { gap: 10 },
  chooseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chooseRowNudge: { borderColor: colors.danger, backgroundColor: 'rgba(255,71,87,0.08)' },
  chooseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.14)',
  },
  chooseText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  dayRow: { flexDirection: 'row', gap: 8 },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brandBright,
    shadowColor: colors.brandBright,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  disabled: { opacity: 0.35 },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  dateStrip: { gap: 8, paddingVertical: 2 },
  dateChip: {
    width: 58,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateDow: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  dateNum: { color: colors.text, fontSize: 20, fontWeight: '800', lineHeight: 26 },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeChipSmall: { flexGrow: 0, flexBasis: '31%', paddingVertical: 10 },
  timeText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
  moreText: { color: colors.brandBright, fontSize: 14, fontWeight: '800' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.elevated,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryEmoji: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.18)',
  },
  summaryEmojiText: { fontSize: 24, lineHeight: 30 },
  summaryText: { flex: 1, minWidth: 0, gap: 1 },
  summaryTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  summaryWhen: { color: colors.brandBright, fontSize: 14, fontWeight: '700' },
  summaryPlace: { color: colors.text, fontSize: 13, fontWeight: '600' },
  summaryPlaceEmpty: { color: colors.textSecondary, fontStyle: 'italic', fontWeight: '500' },
  cta: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
});
