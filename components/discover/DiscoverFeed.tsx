import { DtIconHero } from '@/components/onboarding/DtIconHero';
import { friendlyError } from '@/lib/errors';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton, dismissToLive } from '@/components/ui/CloseButton';
import {
    BlockLabel,
    LiveAtmosphere,
    UnderlineTabs,
    livePad,
} from '@/components/ui/LiveChrome';
import { OptionChip } from '@/components/ui/OptionChip';
import { Screen } from '@/components/ui/Screen';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { radiusPresets } from '@/constants/copy';
import { DEMO_VIDEO_PROMPTS, demoCity, demoVideoPromptsFor } from '@/constants/demoTonight';
import {
    flowCopy,
    formatLaterHour,
} from '@/constants/flow';
import { colors, radii, spacing } from '@/constants/theme';
import { foodLabel } from '@/constants/tonightVibe';
import { promptDisplayLabel } from '@/constants/videoPrompts';
import { compareDiscoveryRank } from '@/lib/commerce/sessionCommerce';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { canMatchToday } from '@/lib/usage/dailyLimits';
import {
  applyDiscoverFilters,
  INTENT_OPTIONS,
  matchedFilterLabels,
} from '@/features/discover/applyFilters';
import {
  activityStatus,
  availabilityText,
  cardStatusTags,
  feedTier,
  isRecentlyActive,
  keyTraits,
  openToLabel,
} from '@/features/discover/statusTags';
import { sharedInterests } from '@/constants/interests';
import { FilterBar } from '@/components/discover/FilterBar';
import { MatchPill } from '@/components/discover/MatchPill';
import { AFTER_HOURS_TAGS, isAfterHours } from '@/constants/afterHours';
import { canUseAdvancedFilters, canUsePriorityPool, maxRadiusMiles } from '@/lib/entitlements';
import { env, isBackendConfigured } from '@/lib/env';
import { useContentLayout } from '@/lib/layout';
import { fetchDiscoveryFeed, sendPing } from '@/services/api';
import {
  fetchFirestoreNearbyBrowse,
  subscribeActiveLiveSessions,
  updateMyLiveSession,
} from '@/features/live/firestoreLive';
import { isMatchLimitError, sendInterest, subscribeSentInterests } from '@/features/matches/api';
import { registerPushTokenAsync } from '@/features/notifications/push';
import { useHiddenUserMap } from '@/store/blocks';
import { useDiscoverFilters } from '@/store/discoverFilters';
import { useMatchesStore } from '@/store/matches';
import { useSessionStore } from '@/store/session';
import type { DiscoveryCard, FoodCuisine, RadiusMiles, TonightActivity } from '@/types';
import { formatDistanceMiles, isLiveSessionActive } from '@/utils/time';
import { freeUntilLabel } from '@/features/live/freeUntil';
import { isUpcomingTraveler, shownDistanceMiles, tripLabel } from '@/features/travel/trip';
import { tonightCompatibility } from '@/utils/tonightCompatibility';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledSheet, rs } from '@/lib/scale';
import { androidGlow } from '@/lib/glow';
import { energyLabel, TRAVEL_OPTIONS } from '@/constants/datingTraits';
import { MediaCarousel, type CarouselItem } from '@/components/discover/MediaCarousel';

const ACTIVITY_EMOJI: Record<string, string> = {
  drinks: '🍸',
  dinner: '🍽',
  coffee: '☕',
  activity: '🎳',
  walk: '🚶',
  movie: '🎬',
  chill: '😌',
  surprise: '✨',
};

const DEMO_CARDS: DiscoveryCard[] = DEMO_VIDEO_PROMPTS.map((p, i) => ({
  userId: p.id,
  displayName: p.name,
  age: p.age,
  neighborhoodLabel: p.neighborhood,
  distanceMiles: p.distanceMiles,
  verificationStatus: p.verified ? 'verified' : 'unverified',
  datingIntention: 'open_vibe',
  bio: null,
  mainPhotoUrl: p.videoThumbUrl,
  liveSessionId: `demo-live-${p.id}`,
  liveUntil: new Date(Date.now() + (3 - i * 0.4) * 60 * 60 * 1000).toISOString(),
  availabilityLabel: 'Tonight',
  activities: p.activities.map((a) => a.toLowerCase() as TonightActivity),
  foodCuisines: [...(p.foodCuisines ?? [])] as FoodCuisine[],
  // Preview: first card is boosted so ranking logic is visible.
  isBoosted: i === 0,
  rankScore: i === 0 ? 10 : 1,
  videoPrompts: demoVideoPromptsFor(p),
}));

/** Main photo, then videos interleaved with the remaining photos. */
function carouselItemsFor(card: DiscoveryCard): CarouselItem[] {
  const photos: CarouselItem[] = (
    card.photoUrls?.length ? card.photoUrls : card.mainPhotoUrl ? [card.mainPhotoUrl] : []
  ).map((uri) => ({ kind: 'photo', uri }));
  const prompts = card.videoPrompts ?? [];
  const ordered = [
    prompts.find((p) => p.kind === 'tonight_signature'),
    prompts.find((p) => p.kind === 'about_you'),
    ...prompts.filter((p) => p.kind !== 'tonight_signature' && p.kind !== 'about_you'),
  ];
  const videos: CarouselItem[] = ordered
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.videoUrl))
    .map((p) => ({
      kind: 'video',
      uri: p.videoUrl!,
      label: promptDisplayLabel(p.kind),
      prompt: p.promptText,
    }));
  const out: CarouselItem[] = [];
  const [first, ...restPhotos] = photos;
  if (first) out.push(first);
  for (let i = 0; i < Math.max(videos.length, restPhotos.length); i++) {
    if (videos[i]) out.push(videos[i]);
    if (restPhotos[i]) out.push(restPhotos[i]);
  }
  return out;
}

/**
 * Distance words for someone who isn't a traveler, or null to show none. While the viewer is in
 * Travel Mode without a known location, say which city they're in rather than a made-up distance.
 */
function distanceText(c: DiscoveryCard, tripCity: string | null): string | null {
  const miles = shownDistanceMiles(c);
  if (c.hideDistance || miles == null) {
    return c.awayMiles === undefined ? null : `In ${tripCity ?? 'this city'}`;
  }
  return formatDistanceMiles(miles);
}

function planWord(a: string): string {
  return a === 'surprise' ? 'Spontaneous' : a.charAt(0).toUpperCase() + a.slice(1);
}

interface DiscoverFeedProps {
  /** When true, show close control (modal route). Tab hides it. */
  showClose?: boolean;
  /** Rendered above the feed (Live tab status bar). The feed then skips its own top safe-area padding. */
  liveHeader?: ReactNode;
}

export const DiscoverFeed = memo(DiscoverFeedInner);

function DiscoverFeedInner({ showClose = false, liveHeader }: DiscoverFeedProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const topPad = liveHeader ? 0 : insets.top;
  const { layoutHeight } = useContentLayout();
  const scrollRef = useRef<ScrollView>(null);
  /** People passed or hearted this Live session — never shown again after a feed refresh. */
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  /** People passed this Live session, newest last — rewind brings them back one at a time. */
  const [passed, setPassed] = useState<string[]>([]);
  /** Shown first, ahead of the normal ranking, right after a rewind. */
  const [rewoundId, setRewoundId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(() => new Set());
  const [interestFlash, setInterestFlash] = useState(false);
  const [scrollH, setScrollH] = useState(0);
  const [actionBarH, setActionBarH] = useState(0);
  /** No one in range → browsing people who aren't live, past the Live radius. */
  const [browseWider, setBrowseWider] = useState(false);
  /** Preview: first ♥ is one-way interest; second ♥ simulates mutual match */
  const interestsSentRef = useRef(0);
  const uid = useSessionStore((s) => s.userId);
  // A primitive key so new messages / read receipts on matches don't re-render the whole feed.
  const matchedKey = useMatchesStore((s) => {
    const ids: string[] = [];
    for (const m of s.matches) for (const u of m.userIds) if (u !== uid) ids.push(u);
    return ids.sort().join(',');
  });
  const matchedIds = useMemo(
    () => new Set(matchedKey ? matchedKey.split(',') : []),
    [matchedKey],
  );
  const liveSession = useSessionStore((s) => s.liveSession);
  const discoveryPaused = useSessionStore((s) => s.discoveryPaused);
  const setDiscoverAttention = useSessionStore((s) => s.setDiscoverAttention);
  const setPingResults = useSessionStore((s) => s.setPingResults);
  const clearNewInPing = useSessionStore((s) => s.clearNewInPing);
  const profile = useSessionStore((s) => s.profile);
  const entitlements = useSessionStore((s) => s.entitlements);
  const filters = useDiscoverFilters();
  const blockedMap = useHiddenUserMap();
  const live = liveSession ? isLiveSessionActive(liveSession, new Date()) : false;
  const priorityPool = canUsePriorityPool(entitlements);
  const plusFoods = canUseAdvancedFilters(entitlements);

  useFocusEffect(
    useCallback(() => {
      setDiscoverAttention(false);
      clearNewInPing();
    }, [setDiscoverAttention, clearNewInPing]),
  );

  const feedQuery = useQuery({
    queryKey: [
      'discovery-feed',
      live,
      liveSession?.id,
      liveSession?.radiusMiles,
      filters.maxDistanceMiles,
      liveSession?.trip?.city ?? null,
    ],
    queryFn: () => fetchDiscoveryFeed(40, filters.maxDistanceMiles),
    // People who aren't live browse from their nearby presence (Firestore only).
    enabled: live
      ? Boolean(isBackendConfigured() || (env.supabaseUrl && env.supabaseAnonKey))
      : isBackendConfigured(),
    retry: false,
    refetchInterval: live ? 45_000 : 90_000,
  });

  useEffect(() => {
    setHandled(new Set());
    setPassed([]);
    setRewoundId(null);
    setBrowseWider(false);
  }, [liveSession?.id]);

  useEffect(() => {
    if (!uid || !isBackendConfigured()) return;
    return subscribeSentInterests(uid, setSentTo);
  }, [uid]);

  // Someone going live nearby shows up without waiting for the 45s poll.
  useEffect(() => {
    if (!live || !isBackendConfigured()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeActiveLiveSessions(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['discovery-feed'] });
      }, 1500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [live, queryClient]);

  const myVibe = useMemo(
    () => ({
      activities: (liveSession?.activities ?? []) as TonightActivity[],
      foodCuisines: liveSession?.foodCuisines ?? [],
    }),
    [liveSession],
  );
  const myInterests = profile?.interests ?? null;

  /** Real Firestore/Supabase feed only — never invent people when empty. */
  const rawFeed = useMemo((): DiscoveryCard[] => {
    if (feedQuery.data && feedQuery.data.length > 0) return feedQuery.data;
    // Opt-in sandbox only (`EXPO_PUBLIC_USE_MOCK_DATA=true`). Default: empty → low-density UX.
    if (live && env.useMockData) return DEMO_CARDS;
    return [];
  }, [live, feedQuery.data, feedQuery.isError]);

  const nearbyBeforeFilters = useMemo(() => {
    return rawFeed
      .filter((c) => c.distanceMiles <= filters.maxDistanceMiles)
      .filter((c) => !blockedMap[c.userId])
      .filter((c) => !handled.has(c.userId) && !sentTo.has(c.userId) && !matchedIds.has(c.userId));
  }, [rawFeed, filters.maxDistanceMiles, blockedMap, handled, sentTo, matchedIds]);

  const liveRadius = liveSession?.radiusMiles ?? filters.maxDistanceMiles;
  const widerRadius = maxRadiusMiles(entitlements);
  const widerQuery = useQuery({
    queryKey: ['nearby-wider', liveSession?.id, widerRadius, liveSession?.trip?.city ?? null],
    queryFn: () => fetchFirestoreNearbyBrowse(widerRadius),
    enabled:
      live &&
      isBackendConfigured() &&
      widerRadius > liveRadius &&
      (browseWider || (feedQuery.isFetched && nearbyBeforeFilters.length === 0)),
    retry: false,
    staleTime: 60_000,
  });
  const widerExtra = useMemo(() => {
    const inFeed = new Set(rawFeed.map((c) => c.userId));
    return (widerQuery.data ?? []).filter(
      (c) =>
        !inFeed.has(c.userId) &&
        !blockedMap[c.userId] &&
        !handled.has(c.userId) &&
        !sentTo.has(c.userId) &&
        !matchedIds.has(c.userId),
    );
  }, [widerQuery.data, rawFeed, blockedMap, handled, sentTo, matchedIds]);
  const widerCount = widerExtra.length;
  const pool = useMemo(
    () => (browseWider ? [...nearbyBeforeFilters, ...widerExtra] : nearbyBeforeFilters),
    [browseWider, nearbyBeforeFilters, widerExtra],
  );

  // Memoize compatibility scores per card to avoid O(n^2 log n) recalculation during sort
  const cardScores = useMemo(() => {
    const scores = new Map<string, number>();
    for (const c of pool) {
      const compatScore = tonightCompatibility(myVibe, { 
        activities: c.activities, 
        foodCuisines: c.foodCuisines 
      }).score;
      const interestScore = sharedInterests(myInterests, c.interests).length * 4;
      scores.set(c.userId, compatScore + interestScore);
    }
    return scores;
  }, [pool, myVibe, myInterests]);

  // Once everyone who matches the filters has been seen, keep going with everyone else (and say so).
  const { cards, outsideFilters } = useMemo(() => {
    const list = applyDiscoverFilters(pool, filters, { plus: plusFoods, myInterests });
    const matching = new Set(list.map((c) => c.userId));
    const outside = list.length ? [] : pool.filter((c) => !matching.has(c.userId));
    const shown = list.length ? list : outside;

    // Live now, then free later tonight, then nearby people who aren't live.
    const sorted = [...shown].sort((a, b) => {
      const ta = feedTier(a);
      const tb = feedTier(b);
      if (ta !== tb) return ta - tb;
      if (ta === 1) return (a.laterTonightHour ?? 99) - (b.laterTonightHour ?? 99);
      const sa = cardScores.get(a.userId) ?? 0;
      const sb = cardScores.get(b.userId) ?? 0;
      if (ta === 2) {
        const ra = isRecentlyActive(a) ? 1 : 0;
        const rb = isRecentlyActive(b) ? 1 : 0;
        if (ra !== rb) return rb - ra;
        if (sa !== sb) return sb - sa;
        return a.distanceMiles - b.distanceMiles;
      }
      return compareDiscoveryRank(
        { isBoosted: a.isBoosted, distanceMiles: a.distanceMiles, compatScore: sa },
        { isBoosted: b.isBoosted, distanceMiles: b.distanceMiles, compatScore: sb },
        { priorityPool },
      );
    });
    const back = rewoundId ? pool.find((c) => c.userId === rewoundId) : undefined;
    const ordered = back ? [back, ...sorted.filter((c) => c.userId !== back.userId)] : sorted;
    return { cards: ordered, outsideFilters: outside.length > 0 };
  }, [pool, filters, cardScores, priorityPool, plusFoods, myInterests, rewoundId]);

  /** Most recent pass that's still in the feed (they may have gone offline or matched since). */
  const rewindTo = useMemo(() => {
    const wider = browseWider ? widerQuery.data ?? [] : [];
    const available = new Set(
      [...rawFeed.filter((c) => c.distanceMiles <= filters.maxDistanceMiles), ...wider]
        .filter((c) => !blockedMap[c.userId] && !sentTo.has(c.userId) && !matchedIds.has(c.userId))
        .map((c) => c.userId),
    );
    for (let i = passed.length - 1; i >= 0; i--) if (available.has(passed[i])) return passed[i];
    return null;
  }, [passed, rawFeed, widerQuery.data, browseWider, filters.maxDistanceMiles, blockedMap, sentTo, matchedIds]);

  const laterTonight = useMemo(() => {
    return nearbyBeforeFilters
      .filter((c) => c.availabilityMode === 'later')
      .sort((a, b) => (a.laterTonightHour ?? 99) - (b.laterTonightHour ?? 99));
  }, [nearbyBeforeFilters]);

  const tripCity = liveSession?.trip?.city ?? null;
  const tonightCount = cards.filter((c) => feedTier(c) < 2).length;
  const nearbyCount = cards.length - tonightCount;

  useEffect(() => {
    if (live) setPingResults(tonightCount);
  }, [live, tonightCount, setPingResults]);

  const pingSummary = useMemo(() => {
    const acts = (liveSession?.activities ?? []).map(
      (a) => a.charAt(0).toUpperCase() + a.slice(1),
    );
    const foods = (liveSession?.foodCuisines ?? [])
      .filter((f) => f !== 'anything')
      .slice(0, 2)
      .map((f) => foodLabel(f));
    const bits = [...acts];
    if (foods.length) bits.push(foods.join('/'));
    const within = `within ${liveSession?.radiusMiles ?? filters.maxDistanceMiles} mi`;
    bits.push(liveSession?.trip ? `${within} of ${liveSession.trip.city}` : within);
    return bits.join(' · ');
  }, [liveSession, filters.maxDistanceMiles]);

  const card = cards[0];
  const compat = card
    ? tonightCompatibility(myVibe, {
        activities: card.activities,
        foodCuisines: card.foodCuisines,
      })
    : null;
  const commonInterests = card ? sharedInterests(myInterests, card.interests) : [];
  const mediaItems = card ? carouselItemsFor(card) : [];
  const statusTags = card ? cardStatusTags(card) : [];
  const matched = card ? matchedFilterLabels(card, filters, { plus: plusFoods, myInterests }) : [];
  const tier = card ? feedTier(card) : 0;
  const tonight = tier !== 2;
  const activity = card && !tonight ? activityStatus(card) : null;
  const intentLabel = card
    ? INTENT_OPTIONS.find((o) => o.value === card.datingIntention)?.label ?? null
    : null;
  const lifestyle = card ? keyTraits(card, 4).filter((t) => t !== intentLabel) : [];
  const vibeChips = card
    ? [
        intentLabel ? `💞 ${intentLabel}` : null,
        energyLabel(card.energy),
        card.planIdea ? `📍 ${card.planIdea}` : null,
        card.travel ? `🚗 ${TRAVEL_OPTIONS.find((o) => o.value === card.travel)?.label}` : null,
      ].filter((v): v is string => Boolean(v))
    : [];
  const otherInterests = (card?.interests ?? []).filter((i) => !commonInterests.includes(i));

  const markHandled = (userId: string) => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setHandled((prev) => new Set(prev).add(userId));
  };

  const goNext = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!card) return;
    markHandled(card.userId);
    setPassed((prev) => [...prev.filter((id) => id !== card.userId), card.userId].slice(-30));
  };

  const rewind = () => {
    if (!rewindTo) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setPassed((prev) => prev.slice(0, prev.lastIndexOf(rewindTo)));
    setHandled((prev) => {
      const next = new Set(prev);
      next.delete(rewindTo);
      return next;
    });
    setRewoundId(rewindTo);
  };

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);
  /** Small "Interest sent" pill over the next card — never blocks the buttons. */
  const flashInterestSent = () => {
    setInterestFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setInterestFlash(false), 1200);
  };

  /** A heart that didn't go through: put them back on top so it can be retried. */
  const restoreCard = (userId: string) => {
    setHandled((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    setRewoundId(userId);
    setInterestFlash(false);
  };

  const openMatch = (target: DiscoveryCard, matchId: string) => {
    const matchCompat = tonightCompatibility(myVibe, {
      activities: target.activities,
      foodCuisines: target.foodCuisines,
    });
    markHandled(target.userId);
    router.push({
      pathname: '/mutual',
      params: {
        name: target.displayName,
        photo: target.mainPhotoUrl ?? '',
        food: matchCompat.sharedFood[0] ?? '',
        activities: (target.activities ?? []).join(','),
        matchId,
      },
    });
  };

  /** Moves on the instant you tap; the server answers in the background (match screen if mutual). */
  const onInterested = () => {
    if (!card) return;
    if (!canMatchToday(entitlements, useMatchesStore.getState().matches).ok) {
      openUpgrade(router, 'match');
      return;
    }
    const target = card;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markHandled(target.userId);
    // Never invent mutual matches from demo ids outside explicit mock mode.
    if (env.useMockData && target.userId.startsWith('demo-')) {
      interestsSentRef.current += 1;
      if (interestsSentRef.current === 1) flashInterestSent();
      else openMatch(target, `preview-${target.userId}`);
      return;
    }
    flashInterestSent();
    void (async () => {
      try {
        let result: { mutual: boolean; matchId?: string | null; created: boolean };
        if (isBackendConfigured()) {
          void registerPushTokenAsync({ prompt: true });
          result = await sendInterest(target.userId);
        } else {
          result = { ...(await sendPing(target.userId)), created: true };
        }
        if (!result.mutual || !result.matchId) return;
        setInterestFlash(false);
        if (!result.created) {
          router.push({ pathname: '/chat/[conversationId]', params: { conversationId: result.matchId } });
          return;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        openMatch(target, result.matchId);
      } catch (error) {
        restoreCard(target.userId);
        if (isMatchLimitError(error)) {
          openUpgrade(router, 'match');
          return;
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Could not send interest', friendlyError(error, 'Try again'));
      }
    })();
  };

  if (live && discoveryPaused) {
    return (
      <Screen padded={false} edges={liveHeader ? ['left', 'right'] : undefined}>
        <LinearGradient
          colors={['#0A0A0C', '#09090B']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {liveHeader}
        <View style={[styles.quietPad, { paddingTop: topPad + spacing.md }]}>
          <View style={styles.quiet}>
            <AppText style={styles.quietTitle}>Discovery paused.</AppText>
            <AppText variant="secondary" style={styles.quietBody}>
              You've got a plan tonight. Stay focused — or jump back in.
            </AppText>
            <Button
              label="RESUME DISCOVER"
              onPress={() => useSessionStore.getState().setDiscoveryPaused(false)}
              style={styles.quietCta}
            />
            <Button
              label="VIEW MATCHES"
              variant="secondary"
              onPress={() => router.push('/(tabs)/dates')}
              style={styles.quietCta}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (!live && cards.length === 0) {
    const city =
      profile?.neighborhoodLabel?.split(',')[0]?.trim() ||
      profile?.hometown ||
      demoCity.label;
    const radiusMi = liveSession?.radiusMiles ?? filters.maxDistanceMiles;
    const selectedVibe =
      ((liveSession?.activities?.[0] as string | undefined) ?? 'dinner') as
        | 'dinner'
        | 'drinks'
        | 'coffee'
        | 'activity';

    return (
      <Screen padded={false} edges={['top', 'left', 'right']}>
        <LiveAtmosphere />
        <ScrollView
          contentContainerStyle={[
            styles.offlinePad,
            livePad,
            { paddingBottom: Math.max(insets.bottom, 8) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {showClose ? <CloseButton onPress={() => dismissToLive(router)} /> : null}

          <View style={styles.offlineStage}>
            <DtIconHero size={128} mode="breathe" atmosphere="soft" />
            <AppText style={styles.teaserEyebrow}>TONIGHT · {city.toUpperCase()}</AppText>
          </View>

          <View style={styles.offlineBlock}>
            <BlockLabel>Tonight</BlockLabel>
            <UnderlineTabs
              value={selectedVibe}
              onChange={() => router.push('/(tabs)/live')}
              options={[
                { id: 'drinks', label: 'Drinks' },
                { id: 'dinner', label: 'Dinner' },
                { id: 'coffee', label: 'Coffee' },
                { id: 'activity', label: 'Activity' },
              ]}
            />
          </View>

          <View style={styles.quiet}>
            <AppText style={styles.quietTitleLead}>{flowCopy.quietTitleLead}</AppText>
            <AppText style={styles.quietTitleAccent}>{flowCopy.quietTitleAccent}</AppText>
            <AppText style={styles.quietBody}>{flowCopy.quietBody}</AppText>
            <AppText style={styles.quietMeta}>Within {radiusMi} miles</AppText>

            <Button
              label={flowCopy.beFirstCta.toUpperCase()}
              onPress={() => router.push('/(tabs)/live')}
              style={styles.quietCta}
            />
            <Button
              label={flowCopy.seeWhosLive}
              variant="secondary"
              onPress={() => router.push('/(tabs)/live')}
              style={styles.quietCta}
            />
          </View>

          <View style={styles.offlineBlock}>
            <BlockLabel>{flowCopy.tonightIdeas}</BlockLabel>
            <UnderlineTabs
              value="dinner"
              onChange={() => router.push('/(tabs)/live')}
              options={[
                { id: 'dinner', label: 'Dinner' },
                { id: 'drinks', label: 'Drinks' },
                { id: 'coffee', label: 'Coffee' },
                { id: 'fun', label: 'Something fun' },
              ]}
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (!card) {
    const radiusMi = liveRadius;
    const nextRadius = radiusPresets.find((mi) => mi > radiusMi && mi <= widerRadius) ?? null;
    // The feed reads the radius off the saved Live session, so a local-only change finds no one new.
    const applyRadius = (mi: RadiusMiles) => {
      if (mi > widerRadius) {
        router.push('/paywall');
        return;
      }
      void Haptics.selectionAsync();
      useDiscoverFilters.getState().setMaxDistanceMiles(mi);
      if (!liveSession) return;
      useSessionStore.getState().setLiveSession({ ...liveSession, radiusMiles: mi });
      if (!isBackendConfigured()) return;
      void updateMyLiveSession({ radiusMiles: mi })
        .then(() => queryClient.invalidateQueries({ queryKey: ['discovery-feed'] }))
        .catch((error) => Alert.alert('Couldn’t change your radius', friendlyError(error, 'Try again.')));
    };

    return (
      <Screen padded={false} edges={liveHeader ? ['left', 'right'] : undefined}>
        <LinearGradient
          colors={['#0A0A0C', '#09090B']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {liveHeader}
        {liveHeader ? <FilterBar /> : null}
        <ScrollView
          contentContainerStyle={[
            styles.quietPad,
            { paddingTop: topPad + spacing.md, paddingBottom: 48 },
          ]}
        >
          {showClose ? <CloseButton onPress={() => dismissToLive(router)} /> : null}
          <View style={styles.quiet}>
            <AppText style={styles.teaserEyebrow}>{flowCopy.youreLiveWatching}</AppText>
            <AppText style={styles.quietTitle}>{flowCopy.watchingArea}</AppText>
            <AppText style={[styles.quietBody, styles.quietLead]}>{flowCopy.noLiveMatchesYet}</AppText>
            <AppText variant="secondary" style={styles.quietBody}>
              {flowCopy.notifyWhenNearby}
            </AppText>
            <AppText variant="label" style={styles.radiusLabel}>
              {flowCopy.expandRadius}
            </AppText>
            <View style={styles.radiusRow}>
              {radiusPresets.map((mi) => (
                <OptionChip
                  key={mi}
                  label={mi > widerRadius ? `${mi} mi ✦` : `${mi} mi`}
                  selected={radiusMi === mi}
                  onPress={() => applyRadius(mi)}
                />
              ))}
            </View>
            {nextRadius ? (
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => applyRadius(nextRadius)}>
                <AppText style={styles.tryFarther}>Try {nextRadius} mi instead →</AppText>
              </Pressable>
            ) : null}
            {rewindTo ? (
              <Button
                label="↺ Back to the last person"
                variant="secondary"
                onPress={rewind}
                style={styles.quietCta}
              />
            ) : null}
            <Button
              label={flowCopy.adjustFilters}
              variant="secondary"
              onPress={() => router.push('/filters')}
              style={styles.quietCta}
            />
            {widerCount > 0 ? (
              <View style={styles.widerBlock}>
                <AppText style={styles.widerTitle}>{flowCopy.notLiveYetTitle}</AppText>
                <Button
                  label={flowCopy.recentlyActiveNearby}
                  variant="secondary"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setBrowseWider(true);
                  }}
                  style={styles.quietCta}
                />
                <AppText variant="secondary" style={styles.widerMeta}>
                  {widerCount === 1 ? '1 person' : `${widerCount} people`} within {widerRadius} mi · you
                  stay Live while you browse
                </AppText>
              </View>
            ) : null}

            {laterTonight.length > 0 ? (
              <View style={styles.laterBlock}>
                <AppText style={styles.laterTitle}>{flowCopy.laterTonightTitle}</AppText>
                <AppText variant="secondary" style={styles.quietBody}>
                  {laterTonight.length}{' '}
                  {laterTonight.length === 1 ? 'person is' : 'people are'} planning to be free
                  later
                  {laterTonight[0]?.laterTonightHour != null
                    ? ` after ${formatLaterHour(laterTonight[0].laterTonightHour)}`
                    : ''}
                  .
                </AppText>
                {laterTonight.slice(0, 4).map((p) => (
                  <Pressable
                    key={p.userId}
                    style={styles.laterRow}
                    onPress={() =>
                      router.push({
                        pathname: '/profile/[userId]',
                        params: { userId: p.userId, name: p.displayName },
                      })
                    }
                  >
                    {p.mainPhotoUrl ? (
                      <Image 
                        source={{ uri: p.mainPhotoUrl }} 
                        style={styles.laterAvatar}
                        cachePolicy="memory-disk"
                        transition={200}
                      />
                    ) : (
                      <View style={[styles.laterAvatar, styles.laterAvatarPh]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <AppText style={styles.laterName}>
                        {p.displayName}, {p.age}
                      </AppText>
                      <AppText variant="secondary">
                        {p.laterTonightHour != null
                          ? `Free after ${formatLaterHour(p.laterTonightHour)}`
                          : 'Later tonight'}{' '}
                        · {p.trip ? tripLabel(p.trip) : distanceText(p, tripCity) ?? 'Nearby'}
                      </AppText>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {showClose ? (
              <Button
                label="Back to Live"
                variant="ghost"
                onPress={() => dismissToLive(router)}
                style={styles.quietCta}
              />
            ) : null}
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const heroH = Math.min(layoutHeight * 0.68, rs(620));
  // Media ends right above the fixed X / heart so the name + distance are never covered.
  const mediaH =
    scrollH > 0 && actionBarH > 0
      ? Math.max(Math.min(heroH * 0.92, scrollH - actionBarH), rs(320))
      : heroH * 0.92;
  const lowCount = tonightCount <= 3;
  // Travelers sit at a city center: say they're visiting, never "nearby".
  // In Travel Mode, distance is from where you really are, so it's never "nearby".
  const distanceLabel = card.trip
    ? 'Visiting'
    : card.awayMiles !== undefined
      ? card.hideDistance || card.awayMiles == null
        ? distanceText(card, tripCity)
        : `${formatDistanceMiles(card.awayMiles)} away`
      : card.hideDistance
        ? 'Nearby'
        : `Nearby · ${formatDistanceMiles(card.distanceMiles).replace('Under', 'under')} away`;
  const upcomingTrip = isUpcomingTraveler(card);
  const bottomPad = showClose ? 120 + insets.bottom : 100 + insets.bottom;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <View style={styles.stage}>
        {liveHeader}
        <View style={[styles.pingHeader, { paddingTop: topPad + 8 }]}>
          <View style={styles.pingHeaderLeft}>
            <AppText style={[styles.pingHeaderEyebrow, !tonight && styles.pingHeaderEyebrowNearby]}>
              {tonight ? '⚡ OUT TONIGHT' : 'MORE NEARBY'}
            </AppText>
            <AppText style={styles.pingHeaderTitle}>
              {!tonight
                ? 'More people you might like'
                : lowCount
                  ? `${tonightCount} live now${nearbyCount > 0 ? ' · more nearby' : ''}`
                  : `${tonightCount} people looking for plans now`}
            </AppText>
            <AppText style={styles.pingHeaderMeta} numberOfLines={1}>
              {tonight
                ? nearbyCount > 0 && !lowCount
                  ? `${pingSummary} · ${nearbyCount} more nearby`
                  : pingSummary
                : 'They haven’t gone live tonight, but you can still match'}
            </AppText>
          </View>
          <View style={styles.pingHeaderActions}>
            <Pressable
              onPress={() => router.push('/likes')}
              style={styles.filterBtn}
              accessibilityLabel="Who liked you"
            >
              <Ionicons name="heart-outline" size={rs(18)} color={colors.brandBright} />
            </Pressable>
          </View>
        </View>
        <FilterBar />
        {outsideFilters ? (
          <Pressable
            onPress={() => router.push('/filters')}
            style={styles.outsideBanner}
            accessibilityRole="button"
            accessibilityLabel="You've seen everyone who matches your filters. Showing people outside them. Edit filters."
          >
            <Ionicons name="options-outline" size={rs(16)} color={colors.brandBright} />
            <AppText style={styles.goLiveText}>
              You’ve seen everyone who matches your filters, so we’re showing people outside them.
            </AppText>
            <AppText style={styles.outsideCta}>EDIT</AppText>
          </Pressable>
        ) : null}
        {!live ? (
          <Pressable
            onPress={() => router.navigate('/(tabs)/live')}
            style={styles.goLiveBanner}
            accessibilityRole="button"
          >
            <View style={styles.goLiveDot} />
            <AppText style={styles.goLiveText}>
              Go live to appear higher and let people know you're actually free tonight.
            </AppText>
            <AppText style={styles.goLiveCta}>GO LIVE</AppText>
          </Pressable>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          onLayout={(e) => setScrollH(e.nativeEvent.layout.height)}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
        >
          <View style={[styles.hero, { height: mediaH }]}>
            <MediaCarousel
              items={mediaItems}
              height={mediaH}
              resetKey={card.userId}
              overlay={
                <>
                  <LinearGradient
                    colors={
                      tonight
                        ? ['rgba(124,58,237,0.22)', 'rgba(20,8,36,0)', 'rgba(16,6,30,0.97)']
                        : ['transparent', 'rgba(5,5,6,0.1)', 'rgba(5,5,6,0.96)']
                    }
                    locations={[0, 0.45, 1]}
                    style={styles.fade}
                    pointerEvents="none"
                  />
                  {tonight ? <View style={styles.tonightFrame} pointerEvents="none" /> : null}
                  <View style={[styles.topBar, { top: rs(20) }]} pointerEvents="box-none">
                    {showClose ? (
                      <CloseButton onPress={() => dismissToLive(router)} />
                    ) : (
                      <View style={styles.topSpacer} />
                    )}
                    <View style={styles.topBadges} pointerEvents="none">
                      {tonight ? (
                        <View style={styles.tonightBadge}>
                          {card.trip ? (
                            <Ionicons name="airplane" size={rs(13)} color="#fff" />
                          ) : tier === 0 ? (
                            <Ionicons name="flash" size={rs(13)} color="#fff" />
                          ) : (
                            <View style={styles.laterDot} />
                          )}
                          <AppText style={[styles.tonightBadgeText, styles.shrinkText]} numberOfLines={1}>
                            {availabilityText(card).toUpperCase()}
                          </AppText>
                        </View>
                      ) : null}
                      <View style={styles.distanceBadge}>
                        <Ionicons name={card.trip ? 'airplane' : 'location'} size={rs(12)} color="#fff" />
                        <AppText style={styles.distanceBadgeText}>{distanceLabel}</AppText>
                      </View>
                    </View>
                  </View>
                  {card.isBoosted ? (
                    <View style={styles.boostedTag} pointerEvents="none">
                      <AppText style={styles.boostedTagText}>BOOSTED</AppText>
                    </View>
                  ) : null}
                  <View style={styles.heroMeta} pointerEvents="box-none">
                    {compat?.cue ? (
                      <View style={styles.compatCue}>
                        <AppText style={styles.compatText}>{compat.cue}</AppText>
                      </View>
                    ) : null}
                    <AppText style={styles.name}>
                      {card.displayName}, {card.age}
                    </AppText>
                    <View style={styles.verifyRow}>
                      <VerificationTag status={card.verificationStatus} compact />
                      <MatchPill otherUid={card.userId} theirLevel={card.quizLevel ?? 0} />
                    </View>
                    {tonight ? (
                      <View style={styles.statusLine}>
                        {card.trip ? (
                          <Ionicons name="airplane" size={rs(14)} color={colors.brandBright} />
                        ) : tier === 0 ? (
                          <Ionicons name="flash" size={rs(14)} color={colors.brandBright} />
                        ) : (
                          <View style={styles.laterDot} />
                        )}
                        <AppText
                          style={[styles.statusLineStrong, card.trip && styles.shrinkText]}
                          numberOfLines={1}
                        >
                          {availabilityText(card).toUpperCase()}
                        </AppText>
                        <AppText style={styles.place} numberOfLines={1}>
                          {[
                            card.activities[0] ? planWord(card.activities[0]) : null,
                            card.trip ? null : distanceText(card, tripCity),
                            upcomingTrip ? null : freeUntilLabel(card.freeUntil),
                          ]
                            .filter(Boolean)
                            .map((bit) => ` · ${bit}`)
                            .join('')}
                        </AppText>
                      </View>
                    ) : (
                      <>
                        <View style={styles.statusLine}>
                          {activity?.online ? <View style={styles.onlineDot} /> : null}
                          <AppText style={styles.place}>
                            {activity?.label}
                          </AppText>
                        </View>
                      </>
                    )}
                  </View>
                </>
              }
            />
          </View>

          {vibeChips.length || statusTags.length || card.activities.length ? (
            <View style={styles.block}>
              <View style={styles.promptHead}>
                <Ionicons name="sparkles" size={rs(14)} color={colors.brandBright} />
                <AppText style={styles.promptHeadText}>TONIGHT’S VIBE</AppText>
              </View>
              {card.activities.length || (isAfterHours() && card.afterHours?.length) ? (
                <View style={styles.detailChips}>
                  {card.activities.map((a) => (
                    <View key={a} style={[styles.detailChip, styles.vibeChip]}>
                      <AppText style={styles.detailChipText}>
                        {ACTIVITY_EMOJI[a] ? `${ACTIVITY_EMOJI[a]} ` : ''}
                        {openToLabel(a)}
                      </AppText>
                    </View>
                  ))}
                  {isAfterHours()
                    ? (card.afterHours ?? []).map((t) => (
                        <View key={t} style={[styles.detailChip, styles.nightPill]}>
                          <AppText style={styles.detailChipText}>
                            🌙 {AFTER_HOURS_TAGS.find((o) => o.value === t)?.label}
                          </AppText>
                        </View>
                      ))
                    : null}
                </View>
              ) : null}
              {vibeChips.length ? (
                <View style={styles.detailChips}>
                  {vibeChips.map((v) => (
                    <View key={v} style={[styles.detailChip, styles.vibeChip]}>
                      <AppText style={styles.detailChipText}>{v}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}
              {statusTags.length ? (
                <View style={styles.detailChips}>
                  {statusTags.map((t) => (
                    <View
                      key={t.key}
                      style={[
                        styles.statusPill,
                        t.tone === 'live'
                          ? styles.statusLive
                          : t.tone === 'brand'
                            ? styles.statusBrand
                            : null,
                      ]}
                    >
                      {t.key === 'availability' ? <View style={styles.statusDot} /> : null}
                      <AppText style={styles.statusText}>{t.label}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {card.bio?.trim() ? (
            <View style={styles.block}>
              <View style={styles.promptHead}>
                <Ionicons name="person-circle-outline" size={rs(14)} color={colors.brandBright} />
                <AppText style={styles.promptHeadText}>BIO</AppText>
              </View>
              <AppText style={styles.bioText}>{card.bio.trim()}</AppText>
            </View>
          ) : null}

          {commonInterests.length || otherInterests.length ? (
            <View style={styles.block}>
              <View style={styles.promptHead}>
                <Ionicons name="heart" size={rs(14)} color={colors.brandBright} />
                <AppText style={styles.promptHeadText}>
                  {commonInterests.length
                    ? `INTERESTS · ${commonInterests.length} IN COMMON`
                    : 'INTERESTS'}
                </AppText>
              </View>
              <View style={styles.detailChips}>
                {commonInterests.map((i) => (
                  <View key={i} style={[styles.detailChip, styles.sharedChip]}>
                    <AppText style={styles.detailChipText}>♥ {i}</AppText>
                  </View>
                ))}
                {otherInterests.map((i) => (
                  <View key={i} style={styles.detailChip}>
                    <AppText style={styles.detailChipText}>{i}</AppText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {lifestyle.length ? (
            <View style={styles.block}>
              <View style={styles.promptHead}>
                <Ionicons name="person-outline" size={rs(14)} color={colors.brandBright} />
                <AppText style={styles.promptHeadText}>LIFESTYLE</AppText>
              </View>
              <View style={styles.detailChips}>
                {lifestyle.map((t) => (
                  <View key={t} style={styles.detailChip}>
                    <AppText style={styles.detailChipText}>{t}</AppText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {matched.length ? (
            <View style={styles.block}>
              <View style={styles.matchedHead}>
                <Ionicons name="checkmark-circle" size={rs(13)} color={colors.brandBright} />
                <AppText style={styles.matchedTitle}>MATCHES YOUR FILTERS</AppText>
              </View>
              <View style={styles.matchedChips}>
                {matched.map((m) => (
                  <View key={m} style={styles.matchedChip}>
                    <AppText style={styles.matchedText}>{m}</AppText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.actionBar,
            {
              paddingBottom: showClose
                ? Math.max(insets.bottom, 16)
                : Math.max(insets.bottom - 8, 8),
            },
          ]}
          onLayout={(e) => setActionBarH(e.nativeEvent.layout.height)}
          pointerEvents="box-none"
        >
          <Pressable
            accessibilityLabel="Go back to the last person you passed"
            accessibilityRole="button"
            accessibilityState={{ disabled: !rewindTo }}
            onPress={rewind}
            disabled={!rewindTo}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: 24 }}
            style={({ pressed }) => [styles.rewindBtn, !rewindTo && styles.rewindOff, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-undo" size={rs(26)} color={colors.warning} />
          </Pressable>
          <Pressable
            accessibilityLabel="Pass"
            accessibilityRole="button"
            onPress={goNext}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', radius: 32 }}
            style={({ pressed }) => [styles.passBtn, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={rs(32)} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityLabel="Interested"
            accessibilityRole="button"
            onPress={onInterested}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            android_ripple={{ color: 'rgba(255,255,255,0.3)', radius: 36 }}
            style={({ pressed }) => [styles.likeBtn, pressed && styles.pressed]}
          >
            <Ionicons name="heart" size={rs(30)} color={colors.text} />
          </Pressable>
          {/* Balances the rewind button so X and heart stay centered. */}
          <View style={styles.rewindSpacer} pointerEvents="none" />
        </View>

        {interestFlash ? (
          <View style={[styles.interestFlash, { bottom: actionBarH + rs(12) }]} pointerEvents="none">
            <AppText style={styles.interestFlashTitle}>{flowCopy.interestSentTitle}</AppText>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  stage: {
    flex: 1,
    backgroundColor: '#050506',
  },
  pingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: '#050506',
  },
  pingHeaderLeft: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  pingHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pingHeaderEyebrow: {
    color: colors.live,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  pingHeaderEyebrowNearby: { color: colors.textSecondary },
  pingHeaderTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  pingHeaderMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
    zIndex: 1,
  },
  hero: {
    width: '100%',
    backgroundColor: '#121018',
  },
  media: {
    ...StyleSheet.absoluteFill,
  },
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoHint: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.brandBright,
  },
  fade: {
    ...StyleSheet.absoluteFill,
  },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 5,
  },
  topSpacer: {
    width: 40,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,9,11,0.55)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  boostedTag: {
    position: 'absolute',
    top: 68,
    left: spacing.lg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(124,58,237,0.92)',
  },
  boostedTagText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  compatCue: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(34,229,139,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.35)',
    marginBottom: 4,
  },
  compatText: {
    color: colors.live,
    fontSize: 13,
    fontWeight: '700',
  },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(124,58,237,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.55)',
    maxWidth: '100%',
  },
  sharedText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  matchedWrap: { gap: 6 },
  matchedHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  matchedTitle: { color: colors.brandBright, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  matchedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  matchedChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.45)',
  },
  matchedText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  heroMeta: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 24,
    gap: 6,
  },
  name: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  verifyRow: {
    marginTop: 2,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  nightPill: {
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.6)',
    backgroundColor: 'rgba(76,29,149,0.45)',
  },
  place: {
    color: 'rgba(250,250,250,0.85)',
    fontSize: 15,
    flexShrink: 1,
  },
  freeUntil: {
    color: colors.live,
    fontSize: 14,
    fontWeight: '700',
  },
  activities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  pillText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  statusLive: {
    backgroundColor: 'rgba(34,229,139,0.14)',
    borderColor: 'rgba(34,229,139,0.45)',
  },
  statusBrand: {
    backgroundColor: 'rgba(124,58,237,0.22)',
    borderColor: 'rgba(168,85,247,0.5)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
  statusText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  traits: { color: 'rgba(250,250,250,0.8)', fontSize: 14, fontWeight: '600', marginTop: 4 },
  goLiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.input,
    backgroundColor: 'rgba(34,229,139,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.35)',
  },
  outsideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.input,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  outsideCta: { color: colors.brandBright, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  goLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22E58B' },
  goLiveText: { flex: 1, color: colors.white, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  goLiveCta: { color: '#22E58B', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  tonightFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: 'rgba(168,85,247,0.85)',
  },
  tonightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.brandBright,
    shadowColor: colors.brandBright,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    ...androidGlow(colors.brandBright, 0.8, 12),
  },
  tonightBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  topBadges: { alignItems: 'flex-end', gap: 6, flexShrink: 1, marginLeft: 8 },
  shrinkText: { flexShrink: 1 },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(9,9,11,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  distanceBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  laterDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#C084FC',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusLineStrong: { color: '#E9D5FF', fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
  planLine: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  block: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  promptHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bioText: { color: colors.text, fontSize: 16, lineHeight: 23 },
  detailChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  vibeChip: {
    backgroundColor: 'rgba(124,58,237,0.16)',
    borderColor: 'rgba(168,85,247,0.4)',
  },
  sharedChip: {
    backgroundColor: 'rgba(124,58,237,0.28)',
    borderColor: 'rgba(168,85,247,0.6)',
  },
  detailChipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  promptHeadText: {
    color: colors.brandBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    flex: 1,
  },
  promptHeadTonight: {
    color: colors.live,
  },
  duration: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  promptQ: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  videoFrame: {
    height: 420,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#121018',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFrameAlt: {
    height: 360,
  },
  photoBlock: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  midPhoto: {
    width: '100%',
    height: 420,
    borderRadius: 20,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(124,58,237,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  feeling: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingTop: 12,
    backgroundColor: 'rgba(5,5,6,0.88)',
    zIndex: 10,
    elevation: 10,
  },
  passBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  rewindBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,176,32,0.16)',
    borderWidth: 2,
    borderColor: colors.warning,
    elevation: 8,
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  rewindOff: {
    opacity: 0.45,
  },
  rewindSpacer: {
    width: 56,
  },
  likeBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    elevation: 8,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  interestFlash: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.brand,
    zIndex: 100,
    elevation: 12,
  },
  interestFlashTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  offlinePad: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  offlineStage: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.sm,
  },
  offlineBlock: {
    gap: 12,
  },
  quiet: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.md,
  },
  quietTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  quietTitleLead: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  quietTitleAccent: {
    color: colors.brandBright,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: -4,
  },
  teaserEyebrow: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  quietBody: {
    maxWidth: 320,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 15,
  },
  quietLead: { color: colors.text, fontWeight: '600' },
  quietMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  widerBlock: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tryFarther: { color: colors.brandBright, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  widerTitle: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  widerMeta: { fontSize: 12, textAlign: 'center' },
  quietCta: {
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 4,
  },
  quietPad: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  teaserRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: spacing.sm,
  },
  teaserCard: {
    width: 72,
    height: 96,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
  },
  teaserImg: {
    width: '100%',
    height: '100%',
  },
  teaserScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9,9,11,0.35)',
  },
  radarStub: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  radarRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
  },
  radarRingOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderColor: 'rgba(168,85,247,0.18)',
  },
  radarRingMid: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderColor: 'rgba(168,85,247,0.55)',
  },
  radarCore: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.45)',
  },
  radiusLabel: {
    marginTop: spacing.md,
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
    justifyContent: 'center',
  },
  laterBlock: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    gap: 10,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  laterTitle: {
    color: colors.brandBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  laterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  laterAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.elevated,
  },
  laterAvatarPh: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  laterName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
