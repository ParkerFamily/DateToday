import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton, dismissToLive } from '@/components/ui/CloseButton';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { OptionChip } from '@/components/ui/OptionChip';
import { radiusPresets } from '@/constants/copy';
import { DEMO_VIDEO_PROMPTS, demoVideoPromptsFor, demoCity } from '@/constants/demoTonight';
import {
  flowCopy,
  formatCityTonightTeaser,
  formatLaterHour,
  formatPingMatchLine,
} from '@/constants/flow';
import { promptDisplayLabel } from '@/constants/videoPrompts';
import { foodLabel } from '@/constants/tonightVibe';
import { colors, radii, spacing } from '@/constants/theme';
import { formatDistanceMiles, formatLiveUntil, isLiveSessionActive } from '@/utils/time';
import type { DiscoveryCard, FoodCuisine, TonightActivity } from '@/types';
import { useSessionStore } from '@/store/session';
import { useDiscoverFilters } from '@/store/discoverFilters';
import { useBlocksStore } from '@/store/blocks';
import { env, isBackendConfigured } from '@/lib/env';
import { fetchDiscoveryFeed, sendPing } from '@/services/api';
import { tonightCompatibility } from '@/utils/tonightCompatibility';
import { canUseAdvancedFilters, canUsePriorityPool } from '@/lib/entitlements';
import { compareDiscoveryRank } from '@/lib/commerce/sessionCommerce';

const { height: SCREEN_H } = Dimensions.get('window');

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

function activityLabel(a: string): string {
  const emoji = ACTIVITY_EMOJI[a] ?? '';
  const word = a.charAt(0).toUpperCase() + a.slice(1);
  return emoji ? `${emoji} ${word}` : word;
}

interface DiscoverFeedProps {
  /** When true, show close control (modal route). Tab hides it. */
  showClose?: boolean;
}

export function DiscoverFeed({ showClose = false }: DiscoverFeedProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [interestedLoading, setInterestedLoading] = useState(false);
  const [interestFlash, setInterestFlash] = useState(false);
  /** Preview: first ♥ is one-way interest; second ♥ simulates mutual match */
  const interestsSentRef = useRef(0);
  const liveSession = useSessionStore((s) => s.liveSession);
  const discoveryPaused = useSessionStore((s) => s.discoveryPaused);
  const setDiscoverAttention = useSessionStore((s) => s.setDiscoverAttention);
  const setPingResults = useSessionStore((s) => s.setPingResults);
  const clearNewInPing = useSessionStore((s) => s.clearNewInPing);
  const profile = useSessionStore((s) => s.profile);
  const entitlements = useSessionStore((s) => s.entitlements);
  const filters = useDiscoverFilters();
  const blockedMap = useBlocksStore((s) => s.byId);
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
    queryKey: ['discovery-feed', liveSession?.id, liveSession?.radiusMiles],
    queryFn: () => fetchDiscoveryFeed(40),
    enabled: Boolean(live && (isBackendConfigured() || (env.supabaseUrl && env.supabaseAnonKey))),
    retry: false,
    refetchInterval: live ? 45_000 : false,
  });

  const myVibe = useMemo(
    () => ({
      activities: (liveSession?.activities ?? []) as TonightActivity[],
      foodCuisines: liveSession?.foodCuisines ?? [],
    }),
    [liveSession],
  );

  /** Real feed only — mocks never fill an empty production pool. */
  const rawFeed = useMemo((): DiscoveryCard[] => {
    if (!live) return [];
    if (feedQuery.data && feedQuery.data.length > 0) return feedQuery.data;
    // Intentional preview sandbox only — never a silent production fallback.
    if (env.useMockData && !feedQuery.isFetching && feedQuery.isFetched) {
      return DEMO_CARDS;
    }
    return [];
  }, [live, feedQuery.data, feedQuery.isFetching, feedQuery.isFetched]);

  const nearbyBeforeFilters = useMemo(() => {
    return rawFeed
      .filter((c) => c.distanceMiles <= filters.maxDistanceMiles)
      .filter((c) => !blockedMap[c.userId]);
  }, [rawFeed, filters.maxDistanceMiles, blockedMap]);

  const cards = useMemo(() => {
    let list = [...nearbyBeforeFilters];

    if (filters.verifiedOnly) {
      list = list.filter((c) => c.verificationStatus === 'verified');
    }

    if (filters.vibeFilter.length) {
      const matchAll = filters.matchAllFilters && plusFoods;
      list = list.filter((c) =>
        matchAll
          ? filters.vibeFilter.every((v) => c.activities.includes(v))
          : c.activities.some((a) => filters.vibeFilter.includes(a)),
      );
    }
    if (filters.foodFilter.length) {
      const foods = plusFoods ? filters.foodFilter : filters.foodFilter.slice(0, 1);
      const matchAll = filters.matchAllFilters && plusFoods;
      list = list.filter((c) => {
        const theirs = c.foodCuisines ?? [];
        if (matchAll) {
          return foods.every((f) => theirs.includes(f) || theirs.includes('anything'));
        }
        return theirs.some((f) => foods.includes(f) || f === 'anything');
      });
    }
    if (filters.freeUntilHour != null) {
      list = list.filter((c) => new Date(c.liveUntil).getHours() >= filters.freeUntilHour!);
    }

    // Live Now first; Later Tonight stays in pool but ranked after.
    list = list.filter((c) => c.availabilityMode !== 'later');

    return [...list].sort((a, b) => {
      const sa = tonightCompatibility(myVibe, {
        activities: a.activities,
        foodCuisines: a.foodCuisines,
      }).score;
      const sb = tonightCompatibility(myVibe, {
        activities: b.activities,
        foodCuisines: b.foodCuisines,
      }).score;
      return compareDiscoveryRank(
        { isBoosted: a.isBoosted, distanceMiles: a.distanceMiles, compatScore: sa },
        { isBoosted: b.isBoosted, distanceMiles: b.distanceMiles, compatScore: sb },
        { priorityPool },
      );
    });
  }, [nearbyBeforeFilters, filters, myVibe, priorityPool, plusFoods]);

  const laterTonight = useMemo(() => {
    return nearbyBeforeFilters
      .filter((c) => c.availabilityMode === 'later')
      .sort((a, b) => (a.laterTonightHour ?? 99) - (b.laterTonightHour ?? 99));
  }, [nearbyBeforeFilters]);

  const filtersTight =
    cards.length === 0 &&
    nearbyBeforeFilters.filter((c) => c.availabilityMode !== 'later').length > 0;

  useEffect(() => {
    if (live) setPingResults(cards.length);
  }, [live, cards.length, setPingResults]);

  useEffect(() => {
    setIndex(0);
  }, [filters.maxDistanceMiles, filters.verifiedOnly, filters.freeUntilHour, filters.vibeFilter, filters.foodFilter]);

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
    bits.push(`within ${liveSession?.radiusMiles ?? filters.maxDistanceMiles} mi`);
    return bits.join(' · ');
  }, [liveSession, filters.maxDistanceMiles]);

  const card = cards[index];
  const compat = card
    ? tonightCompatibility(myVibe, {
        activities: card.activities,
        foodCuisines: card.foodCuisines,
      })
    : null;
  const prompts = card?.videoPrompts ?? [];
  const signature = prompts.find((p) => p.kind === 'tonight_signature') ?? prompts[0];
  const about = prompts.find((p) => p.kind === 'about_you') ?? prompts[1];
  const tonightFeeling = (card?.activities ?? []).map(activityLabel).join(' · ');

  const goNext = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (index < cards.length - 1) setIndex((i) => i + 1);
    else setIndex(cards.length);
  };

  const showInterestSentThenAdvance = () => {
    setInterestFlash(true);
    setTimeout(() => {
      setInterestFlash(false);
      goNext();
    }, 1100);
  };

  const openMatch = (target: DiscoveryCard) => {
    const matchCompat = tonightCompatibility(myVibe, {
      activities: target.activities,
      foodCuisines: target.foodCuisines,
    });
    router.push({
      pathname: '/mutual',
      params: {
        name: target.displayName,
        photo: target.mainPhotoUrl ?? '',
        food: matchCompat.sharedFood[0] ?? '',
        activities: (target.activities ?? []).join(','),
        conversationId: `preview-${target.userId}`,
      },
    });
  };

  const onInterested = async () => {
    if (!card || interestFlash) return;
    try {
      setInterestedLoading(true);
      // Mock sandbox only — real builds never invent mutual matches.
      if (env.useMockData && (!env.supabaseUrl || card.userId.startsWith('demo-'))) {
        interestsSentRef.current += 1;
        if (interestsSentRef.current === 1) {
          showInterestSentThenAdvance();
        } else {
          openMatch(card);
        }
        return;
      }
      if (!env.supabaseUrl) {
        // Firebase interest path not live yet — still acknowledge ♥ honestly.
        showInterestSentThenAdvance();
        return;
      }
      const result = await sendPing(card.userId);
      if (result.mutual) {
        openMatch(card);
      } else {
        showInterestSentThenAdvance();
      }
    } catch (error) {
      Alert.alert(
        'Could not send interest',
        error instanceof Error ? error.message : 'Try again',
      );
    } finally {
      setInterestedLoading(false);
    }
  };

  if (live && discoveryPaused) {
    return (
      <Screen padded={false}>
        <LinearGradient
          colors={['#0A0A0C', '#09090B']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.quietPad, { paddingTop: insets.top + spacing.md }]}>
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
              label="VIEW DATES"
              variant="secondary"
              onPress={() => router.push('/(tabs)/dates')}
              style={styles.quietCta}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (!live) {
    const city =
      profile?.neighborhoodLabel?.split(',')[0]?.trim() ||
      profile?.hometown ||
      demoCity.label;

    return (
      <Screen padded={false}>
        <LinearGradient
          colors={['#0A0A0C', '#09090B']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.quietPad, { paddingTop: insets.top + spacing.md }]}>
          {showClose ? <CloseButton onPress={() => dismissToLive(router)} /> : null}
          <View style={styles.quiet}>
            <AppText style={styles.teaserEyebrow}>TONIGHT · {city.toUpperCase()}</AppText>
            <View style={styles.radarStub}>
              <View style={styles.radarRing} />
              <View style={[styles.radarRing, styles.radarRingMid]} />
              <Ionicons name="radio-outline" size={28} color={colors.brandBright} />
            </View>
            <AppText style={styles.quietTitle}>{flowCopy.quietTitle}</AppText>
            <AppText variant="secondary" style={styles.quietBody}>
              {formatCityTonightTeaser(city)}
            </AppText>
            <AppText variant="secondary" style={styles.quietBody}>
              {flowCopy.quietBody}
            </AppText>
            <Button
              label={flowCopy.beFirstCta}
              onPress={() => router.push('/(tabs)/live')}
              style={styles.quietCta}
            />
            <AppText variant="label" style={styles.radiusLabel}>
              {flowCopy.tonightIdeas}
            </AppText>
            <AppText variant="secondary" style={styles.quietBody}>
              Dinner · Drinks · Coffee · Something fun
            </AppText>
          </View>
        </View>
      </Screen>
    );
  }

  if (!card) {
    const radiusMi = liveSession?.radiusMiles ?? filters.maxDistanceMiles;
    const nextRadius =
      radiusPresets.find((mi) => mi > radiusMi) ?? radiusPresets[radiusPresets.length - 1];

    return (
      <Screen padded={false}>
        <LinearGradient
          colors={['#0A0A0C', '#09090B']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <ScrollView
          contentContainerStyle={[
            styles.quietPad,
            { paddingTop: insets.top + spacing.md, paddingBottom: 48 },
          ]}
        >
          {showClose ? <CloseButton onPress={() => dismissToLive(router)} /> : null}
          <View style={styles.quiet}>
            {filtersTight ? (
              <>
                <AppText style={styles.quietTitle}>{flowCopy.loosenFiltersTitle}</AppText>
                <AppText variant="secondary" style={styles.quietBody}>
                  {nearbyBeforeFilters.filter((c) => c.availabilityMode !== 'later').length}{' '}
                  {flowCopy.loosenFiltersBody}
                </AppText>
                <Button
                  label={flowCopy.showNearby}
                  onPress={() => {
                    useDiscoverFilters.getState().reset();
                    void feedQuery.refetch();
                  }}
                  style={styles.quietCta}
                />
                <Button
                  label={flowCopy.adjustFilters}
                  variant="secondary"
                  onPress={() => router.push('/filters')}
                  style={styles.quietCta}
                />
              </>
            ) : (
              <>
                <AppText style={styles.teaserEyebrow}>{flowCopy.youreLiveWatching}</AppText>
                <AppText style={styles.quietTitle}>{flowCopy.watchingArea}</AppText>
                <AppText variant="secondary" style={styles.quietBody}>
                  {flowCopy.zeroMatchNow}
                </AppText>
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
                      label={`${mi} mi`}
                      selected={radiusMi === mi}
                      onPress={() => {
                        useDiscoverFilters.getState().setMaxDistanceMiles(mi);
                        if (liveSession) {
                          useSessionStore.getState().setLiveSession({
                            ...liveSession,
                            radiusMiles: mi,
                          });
                        }
                        void feedQuery.refetch();
                      }}
                    />
                  ))}
                </View>
                <AppText variant="secondary" style={styles.quietBody}>
                  Only a few people match within {radiusMi} mi? Try {nextRadius} mi.
                </AppText>
                <Button
                  label={flowCopy.adjustFilters}
                  variant="secondary"
                  onPress={() => router.push('/filters')}
                  style={styles.quietCta}
                />
              </>
            )}

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
                      <Image source={{ uri: p.mainPhotoUrl }} style={styles.laterAvatar} />
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
                        · {formatDistanceMiles(p.distanceMiles)}
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

  const heroH = SCREEN_H * 0.68;
  const bottomPad = showClose ? 120 + insets.bottom : 100 + insets.bottom;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <View style={styles.stage}>
        <View style={[styles.pingHeader, { paddingTop: insets.top + 8 }]}>
          <View style={styles.pingHeaderLeft}>
            <AppText style={styles.pingHeaderEyebrow}>{flowCopy.yourPing}</AppText>
            <AppText style={styles.pingHeaderTitle}>
              {formatPingMatchLine(cards.length)}
            </AppText>
            <AppText style={styles.pingHeaderMeta} numberOfLines={1}>
              {pingSummary}
            </AppText>
          </View>
          <View style={styles.pingHeaderActions}>
            <Pressable
              onPress={() => router.push('/likes')}
              style={styles.filterBtn}
              accessibilityLabel="Who liked you"
            >
              <Ionicons name="heart-outline" size={18} color={colors.brandBright} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/filters')}
              style={styles.filterBtn}
              accessibilityLabel="Filters"
            >
              <Ionicons name="options-outline" size={18} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, { height: heroH * 0.92 }]}>
            {card.mainPhotoUrl ? (
              <Image source={{ uri: card.mainPhotoUrl }} style={styles.media} />
            ) : (
              <View style={[styles.media, styles.mediaPlaceholder]}>
                <AppText style={styles.videoHint}>VIDEO</AppText>
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(5,5,6,0.15)', 'rgba(5,5,6,0.96)']}
              style={styles.fade}
            />
            <View style={[styles.topBar, { top: 12 }]}>
              {showClose ? (
                <CloseButton onPress={() => dismissToLive(router)} />
              ) : (
                <View style={styles.topSpacer} />
              )}
              <LiveBadge label={formatLiveUntil(card.liveUntil)} />
            </View>
            {card.isBoosted ? (
              <View style={styles.boostedTag}>
                <AppText style={styles.boostedTagText}>BOOSTED</AppText>
              </View>
            ) : null}
            <View style={styles.heroMeta}>
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
              </View>
              <AppText style={styles.place}>
                {formatDistanceMiles(card.distanceMiles)} · Free until{' '}
                {new Date(card.liveUntil).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {compat && compat.sharedActivities.length > 0
                  ? ` · ${compat.sharedActivities.length} tonight vibe${
                      compat.sharedActivities.length === 1 ? '' : 's'
                    } match`
                  : ''}
              </AppText>
              <View style={styles.activities}>
                {card.activities.map((a) => (
                  <View key={a} style={styles.pill}>
                    <AppText style={styles.pillText}>{activityLabel(a)}</AppText>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.block}>
            <View style={styles.promptHead}>
              <Ionicons name="videocam" size={14} color={colors.live} />
              <AppText style={[styles.promptHeadText, styles.promptHeadTonight]}>
                🎥 {signature ? promptDisplayLabel(signature.kind) : 'TONIGHT'}
              </AppText>
              {signature?.durationSeconds ? (
                <AppText style={styles.duration}>{signature.durationSeconds}s</AppText>
              ) : null}
            </View>
            <AppText style={styles.promptQ}>
              “{signature?.promptText ?? "You get me for tonight. What's the move?"}”
            </AppText>
            <View style={styles.videoFrame}>
              {(signature?.thumbnailUrl ?? card.mainPhotoUrl) ? (
                <Image
                  source={{ uri: signature?.thumbnailUrl ?? card.mainPhotoUrl! }}
                  style={styles.media}
                />
              ) : null}
              <View style={styles.playBtn}>
                <Ionicons name="play" size={28} color={colors.text} />
              </View>
            </View>
          </View>

          {card.mainPhotoUrl ? (
            <View style={styles.photoBlock}>
              <Image source={{ uri: card.mainPhotoUrl }} style={styles.midPhoto} />
            </View>
          ) : null}

          <View style={styles.block}>
            <View style={styles.promptHead}>
              <Ionicons name="videocam" size={14} color={colors.brandBright} />
              <AppText style={styles.promptHeadText}>
                🎥 {about ? promptDisplayLabel(about.kind) : 'ABOUT YOU'}
              </AppText>
              {about?.durationSeconds ? (
                <AppText style={styles.duration}>{about.durationSeconds}s</AppText>
              ) : null}
            </View>
            <AppText style={styles.promptQ}>
              “{about?.promptText ?? 'My friends would warn you that I…'}”
            </AppText>
            <View style={[styles.videoFrame, styles.videoFrameAlt]}>
              {(about?.thumbnailUrl ?? card.mainPhotoUrl) ? (
                <Image
                  source={{ uri: about?.thumbnailUrl ?? card.mainPhotoUrl! }}
                  style={styles.media}
                />
              ) : null}
              <View style={styles.playBtn}>
                <Ionicons name="play" size={28} color={colors.text} />
              </View>
            </View>
          </View>

          <View style={styles.block}>
            <AppText style={styles.sectionLabel}>Tonight</AppText>
            <AppText style={styles.feeling}>{tonightFeeling || 'Open'}</AppText>
          </View>
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
        >
          <Pressable
            accessibilityLabel="Pass"
            onPress={goNext}
            disabled={interestFlash}
            style={({ pressed }) => [styles.passBtn, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={32} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityLabel="Interested"
            disabled={interestedLoading || interestFlash}
            onPress={() => void onInterested()}
            style={({ pressed }) => [styles.likeBtn, pressed && styles.pressed]}
          >
            <Ionicons name="heart" size={30} color={colors.text} />
          </Pressable>
        </View>

        {interestFlash ? (
          <View style={styles.interestFlash} pointerEvents="none">
            <AppText style={styles.interestFlashTitle}>{flowCopy.interestSentTitle}</AppText>
            <AppText style={styles.interestFlashBody}>{flowCopy.interestSentBody}</AppText>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    top: 56,
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
  },
  place: {
    color: 'rgba(250,250,250,0.85)',
    fontSize: 15,
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
  },
  likeBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  interestFlash: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,6,0.72)',
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  interestFlashTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  interestFlashBody: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  quietPad: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  quiet: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  quietTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  teaserEyebrow: {
    color: colors.brandBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
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
  quietBody: {
    maxWidth: 320,
    lineHeight: 22,
    textAlign: 'center',
  },
  quietCta: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 320,
    marginTop: spacing.sm,
  },
  radarStub: {
    width: 120,
    height: 120,
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
  radarRingMid: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderColor: 'rgba(168,85,247,0.55)',
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
