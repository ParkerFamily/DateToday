import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { OptionChip } from '@/components/ui/OptionChip';
import { RangeSlider } from '@/components/ui/RangeSlider';
import {
  FilterGroup,
  FilterRow,
  PremiumHeader,
  SectionTitle,
  SegmentedTabs,
  SubLabel,
  ToggleFilterRow,
  type IconSpec,
} from '@/components/filters/FilterRows';
import { FOOD_CUISINES, foodLabel } from '@/constants/tonightVibe';
import {
  CLOSE_BY_OPTIONS,
  FREE_FOR_OPTIONS,
  HOW_SOON_OPTIONS,
  isAfterHours,
  OUT_LATE_OPTIONS,
} from '@/constants/afterHours';
import { ENERGY_OPTIONS, TRAITS, TRAVEL_OPTIONS, type TraitKey } from '@/constants/datingTraits';
import { ALL_INTERESTS, BROAD_INTERESTS, EXERCISE_OPTIONS, isBroadInterest, KIDS_OPTIONS } from '@/constants/interests';
import { colors, radii, spacing } from '@/constants/theme';
import {
  DOWN_FOR_OPTIONS,
  INTENT_OPTIONS,
  LIFESTYLE_OPTIONS,
  activeFilterLabels,
  applyDiscoverFilters,
  formatHeight,
} from '@/features/discover/applyFilters';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { allowedRadiusPresets, canUseAdvancedFilters } from '@/lib/entitlements';
import { useHiddenUserMap } from '@/store/blocks';
import { AGE_BOUNDS, useDiscoverFilters } from '@/store/discoverFilters';
import { useSessionStore } from '@/store/session';
import type { DiscoveryCard } from '@/types';
import { ScaledSheet, rs } from '@/lib/scale';

/** null = no bound; the slider ends map to null so "Any" stays "Any". */
const AGE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Any', min: null, max: null },
  { label: '18–24', min: null, max: 24 },
  { label: '21–29', min: 21, max: 29 },
  { label: '25–34', min: 25, max: 34 },
  { label: '30–39', min: 30, max: 39 },
  { label: '35–44', min: 35, max: 44 },
  { label: '40+', min: 40, max: null },
];

const HEIGHT_IN = { min: 58, max: 84 } as const;
const inToCm = (inches: number) => Math.round(inches * 2.54);
const cmToIn = (cm: number) => Math.round(cm / 2.54);

type Tab = 'tonight' | 'type';
type ListKey = 'drinking' | 'smoking' | 'exercise' | 'kids' | TraitKey;
type Option = { value: string; label: string };

const asOptions = (values: readonly string[]): Option[] => values.map((v) => ({ value: v, label: v }));

/** Your type rows, grouped as they appear. Every one is DateToday+. */
const LIFESTYLE_ROWS: { key: ListKey; title: string; icon: IconSpec; options: Option[] }[] = [
  { key: 'drinking', title: 'Drinking', icon: { name: 'wine' }, options: asOptions(LIFESTYLE_OPTIONS) },
  { key: 'smoking', title: 'Smoking', icon: { name: 'cloud' }, options: asOptions(LIFESTYLE_OPTIONS) },
  { key: 'weed', title: 'Weed', icon: { name: 'leaf' }, options: asOptions(TRAITS.weed.options) },
  { key: 'exercise', title: 'Fitness', icon: { name: 'barbell' }, options: asOptions(EXERCISE_OPTIONS) },
  { key: 'kids', title: 'Kids', icon: { name: 'happy' }, options: asOptions(KIDS_OPTIONS) },
  { key: 'pets', title: 'Pets', icon: { name: 'paw' }, options: asOptions(TRAITS.pets.options) },
];
const PERSONALITY_ROWS: { key: ListKey; title: string; icon: IconSpec; options: Option[] }[] = [
  { key: 'socialEnergy', title: 'Social energy', icon: { name: 'people' }, options: asOptions(TRAITS.socialEnergy.options) },
  { key: 'chronotype', title: 'Night owl or early bird', icon: { name: 'moon' }, options: asOptions(TRAITS.chronotype.options) },
  { key: 'loveLanguage', title: 'Love language', icon: { name: 'heart-circle' }, options: asOptions(TRAITS.loveLanguage.options) },
  { key: 'communication', title: 'Communication style', icon: { name: 'chatbubbles' }, options: asOptions(TRAITS.communication.options) },
];
const BACKGROUND_ROWS: { key: ListKey; title: string; icon: IconSpec; options: Option[] }[] = [
  { key: 'education', title: 'Education', icon: { name: 'school' }, options: asOptions(TRAITS.education.options) },
  { key: 'industry', title: 'Work / industry', icon: { name: 'briefcase' }, options: asOptions(TRAITS.industry.options) },
  { key: 'religion', title: 'Religion', icon: { name: 'book' }, options: asOptions(TRAITS.religion.options) },
  { key: 'politics', title: 'Politics', icon: { name: 'podium' }, options: asOptions(TRAITS.politics.options) },
];

function Stepper({
  label,
  display,
  onMinus,
  onPlus,
}: {
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <AppText style={styles.stepperLabel}>{label}</AppText>
      <View style={styles.stepperControls}>
        <Pressable accessibilityLabel={`${label} lower`} onPress={onMinus} hitSlop={6} style={styles.stepBtn}>
          <Ionicons name="remove" size={rs(18)} color={colors.text} />
        </Pressable>
        <AppText style={styles.stepperValue}>{display}</AppText>
        <Pressable accessibilityLabel={`${label} higher`} onPress={onPlus} hitSlop={6} style={styles.stepBtn}>
          <Ionicons name="add" size={rs(18)} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

/** Step a nullable bound: "Any" sits just outside the range on both ends. */
function stepBound(value: number | null, dir: 1 | -1, min: number, max: number, start: number) {
  if (value == null) return dir === 1 ? start : null;
  const next = value + dir;
  if (next < min || next > max) return null;
  return next;
}

/** Collapsed-row value: "Any", "Dinner", "Dinner, Drinks", or "Dinner +2". */
function listSummary(labels: string[]): string {
  if (!labels.length) return 'Any';
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]} +${labels.length - 1}`;
}

export default function FiltersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const entitlements = useSessionStore((s) => s.entitlements);
  const plus = canUseAdvancedFilters(entitlements);
  const radiiAllowed = allowedRadiusPresets(entitlements);
  const filters = useDiscoverFilters();
  const myInterests = useSessionStore((s) => s.profile?.interests ?? null);
  const [allInterests, setAllInterests] = useState(false);
  const [tab, setTab] = useState<Tab>('tonight');
  const [open, setOpen] = useState<string | null>(null);
  const interestChoices = allInterests
    ? ALL_INTERESTS
    : [...new Set([...BROAD_INTERESTS, ...filters.interestFilter.filter((i) => plus || isBroadInterest(i))])];
  const hidden = useHiddenUserMap();
  const labels = activeFilterLabels(filters, { plus });
  const afterHoursOpen = isAfterHours();

  const pool = useMemo(() => {
    const cached = queryClient.getQueriesData<DiscoveryCard[]>({ queryKey: ['discovery-feed'] });
    return cached.map(([, data]) => data).find((d) => d && d.length) ?? null;
  }, [queryClient]);

  const count = pool
    ? applyDiscoverFilters(
        pool.filter((c) => c.distanceMiles <= filters.maxDistanceMiles && !hidden[c.userId]),
        filters,
        { plus, myInterests },
      ).length
    : null;

  const tap = () => void Haptics.selectionAsync();
  const locked = () => openUpgrade(router, 'filters');
  const plusOnly = (fn: () => void) => () => {
    if (!plus) {
      locked();
      return;
    }
    tap();
    fn();
  };
  const free = (fn: () => void) => () => {
    tap();
    fn();
  };

  const toggleOpen = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((cur) => (cur === key ? null : key));
  };
  const rowOpen = (key: string) => ({ open: open === key, onToggle: () => toggleOpen(key) });

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    tap();
    setOpen(null);
    setTab(next);
  };

  const setAgeRange = (low: number, high: number) => {
    filters.patch({
      ageMin: low <= AGE_BOUNDS.min ? null : low,
      ageMax: high >= AGE_BOUNDS.max ? null : high,
    });
  };

  const setHeight = (which: 'minHeightCm' | 'maxHeightCm', dir: 1 | -1) => {
    const current = filters[which];
    const start = which === 'minHeightCm' ? 64 : 74;
    const nextIn = stepBound(current == null ? null : cmToIn(current), dir, HEIGHT_IN.min, HEIGHT_IN.max, start);
    const next = nextIn == null ? null : inToCm(nextIn);
    const patch: Partial<typeof filters> = { [which]: next };
    if (next != null) {
      if (which === 'minHeightCm' && filters.maxHeightCm != null && next > filters.maxHeightCm) patch.maxHeightCm = next;
      if (which === 'maxHeightCm' && filters.minHeightCm != null && next < filters.minHeightCm) patch.minHeightCm = next;
    }
    filters.patch(patch);
  };

  const pick = <T extends string>(options: readonly { value: T; label: string }[], values: readonly string[]) =>
    options.filter((o) => values.includes(o.value)).map((o) => o.label);

  // Collapsed-row summaries. Plus-only values read as "Any" for free users, matching what's applied.
  const howSoonLabel = HOW_SOON_OPTIONS.find((o) => o.value === filters.howSoon)?.label ?? null;
  const freeForLabel = FREE_FOR_OPTIONS.find((o) => o.value === filters.freeFor)?.label ?? null;
  const downForLabels = pick(DOWN_FOR_OPTIONS, filters.vibeFilter);
  const energyLabels = pick(ENERGY_OPTIONS, filters.energy);
  const travelLabels = pick(TRAVEL_OPTIONS, filters.travel);
  const foodLabels = (plus ? filters.foodFilter : filters.foodFilter.slice(0, 1)).map(foodLabel);
  const closeBy = plus ? filters.closeByMiles : null;
  const afterHoursLabels = plus
    ? [
        OUT_LATE_OPTIONS.find((o) => o.value === filters.outLate)?.label,
        filters.stillOut ? 'Still outside' : null,
        filters.afterHoursNow ? 'Now' : null,
        filters.lateNightOpen ? 'Late-night' : null,
      ].filter((v): v is string => Boolean(v))
    : [];
  const ageActive = filters.ageMin != null || filters.ageMax != null;
  const ageLabel = ageActive ? `${filters.ageMin ?? AGE_BOUNDS.min}–${filters.ageMax ?? `${AGE_BOUNDS.max}+`}` : 'Any';
  const interestCount = filters.interestFilter.length;
  const interestLabel = interestCount
    ? `${interestCount} selected${filters.sharedInterestsOnly ? ' · shared' : ''}`
    : filters.sharedInterestsOnly
      ? 'Shares mine'
      : 'Any';
  const intentLabels = plus ? pick(INTENT_OPTIONS, filters.intents) : [];
  const heightActive = plus && (filters.minHeightCm != null || filters.maxHeightCm != null);
  const heightLabel = heightActive
    ? `${filters.minHeightCm != null ? formatHeight(filters.minHeightCm) : 'Any'}–${
        filters.maxHeightCm != null ? formatHeight(filters.maxHeightCm) : 'Any'
      }`
    : 'Any';
  const listCount = (rows: { key: ListKey }[]) => (plus ? rows.filter((r) => filters[r.key].length).length : 0);

  const tonightOn = [
    howSoonLabel,
    freeForLabel,
    downForLabels.length,
    energyLabels.length,
    closeBy,
    filters.planInMind,
    travelLabels.length,
    foodLabels.length,
    afterHoursLabels.length,
    plus && filters.readyNow,
    plus && filters.lastMinute,
  ].filter(Boolean).length;
  const typeOn =
    [
      ageActive,
      filters.verifiedOnly,
      filters.recentlyActive,
      plus && filters.videoOnly,
      intentLabels.length,
      heightActive,
      interestCount || filters.sharedInterestsOnly,
      plus && filters.matchAllFilters,
    ].filter(Boolean).length +
    listCount(LIFESTYLE_ROWS) +
    listCount(PERSONALITY_ROWS) +
    listCount(BACKGROUND_ROWS);

  const chips = (options: readonly Option[], isOn: (v: string) => boolean, onPress: (v: string) => () => void) => (
    <View style={styles.chips}>
      {options.map((o) => (
        <OptionChip key={o.value} label={o.label} selected={isOn(o.value)} onPress={onPress(o.value)} />
      ))}
    </View>
  );

  const plusListRow = (row: { key: ListKey; title: string; icon: IconSpec; options: Option[] }) => {
    const selected = plus ? filters[row.key] : [];
    return (
      <FilterRow
        key={row.key}
        icon={row.icon}
        title={row.title}
        plus
        summary={listSummary(selected)}
        active={selected.length > 0}
        {...rowOpen(row.key)}
      >
        {chips(
          row.options,
          (v) => selected.includes(v),
          (v) => plusOnly(() => filters.toggleIn(row.key, v)),
        )}
      </FilterRow>
    );
  };

  const exactVibe = (
    <ToggleFilterRow
      icon={{ name: 'git-merge' }}
      title="Exact vibe"
      plus
      body="Stack mood, plan, lifestyle and intent. Hide anyone who doesn’t match all of it."
      value={plus && filters.matchAllFilters}
      onChange={(v) => {
        if (!plus) return locked();
        tap();
        filters.setMatchAllFilters(v);
      }}
    />
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={styles.top}>
          <View style={styles.flex}>
            <AppText style={styles.title}>Filters</AppText>
            <AppText style={styles.sub}>
              {labels.length ? `${labels.length} on · applies instantly` : 'Who are you trying to meet tonight?'}
            </AppText>
          </View>
          {labels.length ? (
            <Pressable onPress={() => filters.reset()} hitSlop={8} style={styles.resetBtn}>
              <AppText style={styles.resetText}>Reset</AppText>
            </Pressable>
          ) : null}
          <CloseButton onPress={() => router.back()} />
        </View>
        <SegmentedTabs
          tabs={[
            { id: 'tonight', label: 'Tonight', badge: tonightOn },
            { id: 'type', label: 'Your type', badge: typeOn },
          ]}
          value={tab}
          onChange={switchTab}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'tonight' ? (
          <>
            <SectionTitle>When</SectionTitle>
            <FilterGroup>
              <FilterRow
                icon={{ name: 'timer' }}
                title="How soon?"
                summary={howSoonLabel ?? 'Any'}
                active={Boolean(howSoonLabel)}
                {...rowOpen('howSoon')}
              >
                {chips(
                  HOW_SOON_OPTIONS,
                  (v) => filters.howSoon === v,
                  (v) => free(() => filters.patch({ howSoon: filters.howSoon === v ? null : (v as typeof filters.howSoon) })),
                )}
              </FilterRow>
              <FilterRow
                icon={{ name: 'hourglass' }}
                title="How long are they free?"
                summary={freeForLabel ?? 'Any'}
                active={Boolean(freeForLabel)}
                {...rowOpen('freeFor')}
              >
                {chips(
                  FREE_FOR_OPTIONS,
                  (v) => filters.freeFor === v,
                  (v) => free(() => filters.patch({ freeFor: filters.freeFor === v ? null : (v as typeof filters.freeFor) })),
                )}
              </FilterRow>
            </FilterGroup>

            <SectionTitle>Vibe</SectionTitle>
            <FilterGroup>
              <FilterRow
                icon={{ name: 'flash' }}
                title="What are they down for?"
                summary={listSummary(downForLabels)}
                active={downForLabels.length > 0}
                {...rowOpen('downFor')}
              >
                {chips(
                  DOWN_FOR_OPTIONS,
                  (v) => filters.vibeFilter.includes(v as never),
                  (v) => free(() => filters.toggleIn('vibeFilter', v)),
                )}
              </FilterRow>
              <FilterRow
                icon={{ name: 'sparkles' }}
                title="Energy"
                summary={listSummary(energyLabels)}
                active={energyLabels.length > 0}
                {...rowOpen('energy')}
              >
                {chips(
                  ENERGY_OPTIONS.map((o) => ({ value: o.value, label: `${o.emoji} ${o.label}` })),
                  (v) => filters.energy.includes(v as never),
                  (v) => free(() => filters.toggleIn('energy', v)),
                )}
              </FilterRow>
            </FilterGroup>

            <SectionTitle>Distance</SectionTitle>
            <FilterGroup>
              <FilterRow
                icon={{ name: 'location' }}
                title="Distance"
                summary={`${filters.maxDistanceMiles} mi`}
                active
                {...rowOpen('distance')}
              >
                <View style={styles.chips}>
                  {radiiAllowed.map((mi) => (
                    <OptionChip
                      key={mi}
                      label={`${mi} mi`}
                      selected={filters.maxDistanceMiles === mi}
                      onPress={free(() => filters.setMaxDistanceMiles(mi))}
                    />
                  ))}
                  {!plus
                    ? [15, 50].map((mi) => (
                        <OptionChip key={mi} label={`${mi} mi ✨`} selected={false} onPress={locked} />
                      ))
                    : null}
                </View>
              </FilterRow>
              <FilterRow
                icon={{ name: 'navigate' }}
                title="Close enough to actually meet"
                plus
                summary={closeBy != null ? `Under ${closeBy} mi` : 'Any'}
                active={closeBy != null}
                {...rowOpen('closeBy')}
              >
                {chips(
                  CLOSE_BY_OPTIONS.map((mi) => ({ value: String(mi), label: `Under ${mi} mi` })),
                  (v) => closeBy === Number(v),
                  (v) =>
                    plusOnly(() =>
                      filters.patch({ closeByMiles: filters.closeByMiles === Number(v) ? null : Number(v) }),
                    ),
                )}
              </FilterRow>
            </FilterGroup>

            <SectionTitle>Plan</SectionTitle>
            <FilterGroup>
              <ToggleFilterRow
                icon={{ name: 'map' }}
                title="Plan already in mind"
                body="Has a spot or idea picked out"
                value={filters.planInMind}
                onChange={(v) => {
                  tap();
                  filters.patch({ planInMind: v });
                }}
              />
              <FilterRow
                icon={{ name: 'car' }}
                title="Getting there"
                summary={listSummary(travelLabels)}
                active={travelLabels.length > 0}
                {...rowOpen('travel')}
              >
                {chips(
                  TRAVEL_OPTIONS,
                  (v) => filters.travel.includes(v as never),
                  (v) => free(() => filters.toggleIn('travel', v)),
                )}
              </FilterRow>
              <FilterRow
                icon={{ name: 'restaurant' }}
                title="Dinner preference"
                summary={listSummary(foodLabels)}
                active={foodLabels.length > 0}
                {...rowOpen('dinner')}
              >
                {!plus ? <SubLabel>Pick 1 · more with DateToday+ ✨</SubLabel> : null}
                {chips(
                  FOOD_CUISINES,
                  (v) => filters.foodFilter.includes(v as never),
                  (v) => free(() => filters.toggleFoodFilter(v as (typeof FOOD_CUISINES)[number]['value'], plus)),
                )}
              </FilterRow>
            </FilterGroup>

            <PremiumHeader
              title="Meet faster ✨"
              subtitle="After Hours, Ready now, Last-minute and Close by with DateToday+"
              plus={plus}
              onUnlock={locked}
            />

            <SectionTitle>Late-night</SectionTitle>
            <FilterGroup premium locked={!plus}>
              <FilterRow
                icon={{ emoji: '🌙' }}
                title="After Hours"
                plus
                subtitle="Only people still open to plans late tonight"
                summary={afterHoursLabels.length ? listSummary(afterHoursLabels) : afterHoursOpen ? 'Any' : 'Opens 9 PM'}
                active={afterHoursLabels.length > 0}
                badge={
                  afterHoursOpen ? (
                    <View style={styles.liveBadge}>
                      <AppText style={styles.liveBadgeText}>OPEN NOW</AppText>
                    </View>
                  ) : null
                }
                {...rowOpen('afterHours')}
              >
                {afterHoursOpen ? (
                  <>
                    <SubLabel>Still free</SubLabel>
                    {chips(
                      [...OUT_LATE_OPTIONS, { value: 'still_out', label: 'Still outside' }],
                      (v) => (v === 'still_out' ? plus && filters.stillOut : plus && filters.outLate === v),
                      (v) =>
                        plusOnly(() =>
                          v === 'still_out'
                            ? filters.patch({ stillOut: !filters.stillOut })
                            : filters.patch({ outLate: filters.outLate === v ? null : (v as typeof filters.outLate) }),
                        ),
                    )}
                    <SubLabel>Only people who are</SubLabel>
                    <View style={styles.chips}>
                      <OptionChip
                        label="Available now"
                        selected={plus && filters.afterHoursNow}
                        onPress={plusOnly(() => filters.patch({ afterHoursNow: !filters.afterHoursNow }))}
                      />
                      <OptionChip
                        label="Open to late-night plans"
                        selected={plus && filters.lateNightOpen}
                        onPress={plusOnly(() => filters.patch({ lateNightOpen: !filters.lateNightOpen }))}
                      />
                    </View>
                  </>
                ) : (
                  <AppText style={styles.teaser}>
                    Comes alive at 9 PM — find people free past 10, 11, or midnight, still outside, available
                    right now, or open to late-night plans.
                  </AppText>
                )}
              </FilterRow>
            </FilterGroup>

            <SectionTitle>Availability</SectionTitle>
            <FilterGroup premium locked={!plus}>
              <ToggleFilterRow
                icon={{ emoji: '⚡' }}
                title="Ready now"
                plus
                body="Confirmed they’re free in the last 30 min"
                value={plus && filters.readyNow}
                onChange={(v) => {
                  if (!plus) return locked();
                  tap();
                  filters.patch({ readyNow: v });
                }}
              />
              <ToggleFilterRow
                icon={{ emoji: '🆕' }}
                title="Last-minute"
                plus
                body="Only people who just went live"
                value={plus && filters.lastMinute}
                onChange={(v) => {
                  if (!plus) return locked();
                  tap();
                  filters.patch({ lastMinute: v });
                }}
              />
              {exactVibe}
            </FilterGroup>
          </>
        ) : (
          <>
            <SectionTitle>Basics</SectionTitle>
            <FilterGroup>
              <FilterRow
                icon={{ name: 'people' }}
                title="Age"
                summary={ageLabel}
                active={ageActive}
                {...rowOpen('age')}
              >
                <View style={styles.chips}>
                  {AGE_PRESETS.map((p) => {
                    const selected = filters.ageMin === p.min && filters.ageMax === p.max;
                    return (
                      <OptionChip
                        key={p.label}
                        label={p.label}
                        selected={selected}
                        onPress={free(() =>
                          filters.patch({ ageMin: selected ? null : p.min, ageMax: selected ? null : p.max }),
                        )}
                      />
                    );
                  })}
                </View>
                <RangeSlider
                  min={AGE_BOUNDS.min}
                  max={AGE_BOUNDS.max}
                  low={filters.ageMin ?? AGE_BOUNDS.min}
                  high={filters.ageMax ?? AGE_BOUNDS.max}
                  onChange={setAgeRange}
                  format={(v) => (v >= AGE_BOUNDS.max ? `${v}+` : String(v))}
                />
              </FilterRow>
              <ToggleFilterRow
                icon={{ name: 'shield-checkmark' }}
                title="Verified only"
                body="Photo-verified people. Always free."
                value={filters.verifiedOnly}
                onChange={(v) => {
                  tap();
                  filters.setVerifiedOnly(v);
                }}
              />
              <ToggleFilterRow
                icon={{ name: 'pulse' }}
                title="Recently active"
                body="Live tonight or on DateToday in the last day"
                value={filters.recentlyActive}
                onChange={(v) => {
                  tap();
                  filters.patch({ recentlyActive: v });
                }}
              />
              <ToggleFilterRow
                icon={{ name: 'videocam' }}
                title="Has a video intro"
                plus
                body="Only people who recorded a video"
                value={plus && filters.videoOnly}
                onChange={(v) => {
                  if (!plus) return locked();
                  tap();
                  filters.patch({ videoOnly: v });
                }}
              />
            </FilterGroup>

            <PremiumHeader
              title="Find your type ✨"
              subtitle="Get more specific with DateToday+"
              plus={plus}
              onUnlock={locked}
            />

            <SectionTitle>Intent</SectionTitle>
            <FilterGroup premium locked={!plus}>
              <FilterRow
                icon={{ name: 'compass' }}
                title="Relationship intent"
                plus
                summary={listSummary(intentLabels)}
                active={intentLabels.length > 0}
                {...rowOpen('intents')}
              >
                {chips(
                  INTENT_OPTIONS,
                  (v) => plus && filters.intents.includes(v as never),
                  (v) => plusOnly(() => filters.toggleIn('intents', v)),
                )}
              </FilterRow>
            </FilterGroup>

            <SectionTitle>Lifestyle</SectionTitle>
            <FilterGroup premium locked={!plus}>{LIFESTYLE_ROWS.map(plusListRow)}</FilterGroup>

            <SectionTitle>Personality</SectionTitle>
            <FilterGroup premium locked={!plus}>{PERSONALITY_ROWS.map(plusListRow)}</FilterGroup>

            <SectionTitle>Background</SectionTitle>
            <FilterGroup premium locked={!plus}>
              <FilterRow
                icon={{ name: 'resize' }}
                title="Height"
                plus
                summary={heightLabel}
                active={heightActive}
                {...rowOpen('height')}
              >
                <View style={styles.stepperRow}>
                  <Stepper
                    label="Min"
                    display={plus && filters.minHeightCm != null ? formatHeight(filters.minHeightCm) : 'Any'}
                    onMinus={plusOnly(() => setHeight('minHeightCm', -1))}
                    onPlus={plusOnly(() => setHeight('minHeightCm', 1))}
                  />
                  <Stepper
                    label="Max"
                    display={plus && filters.maxHeightCm != null ? formatHeight(filters.maxHeightCm) : 'Any'}
                    onMinus={plusOnly(() => setHeight('maxHeightCm', -1))}
                    onPlus={plusOnly(() => setHeight('maxHeightCm', 1))}
                  />
                </View>
              </FilterRow>
              {BACKGROUND_ROWS.map(plusListRow)}
            </FilterGroup>

            <SectionTitle>Interests</SectionTitle>
            <FilterGroup>
              <FilterRow
                icon={{ name: 'heart' }}
                title="Interests"
                summary={interestLabel}
                active={interestCount > 0 || filters.sharedInterestsOnly}
                {...rowOpen('interests')}
              >
                <View style={styles.inset}>
                  <ToggleFilterRow
                    icon={{ name: 'sparkles' }}
                    title="Shares my interests"
                    body={
                      myInterests?.length
                        ? 'At least one interest in common'
                        : 'Add interests to your profile to use this'
                    }
                    value={filters.sharedInterestsOnly}
                    onChange={(v) => {
                      if (v && !myInterests?.length) {
                        router.push('/settings/edit-profile');
                        return;
                      }
                      tap();
                      filters.patch({ sharedInterestsOnly: v });
                    }}
                  />
                </View>
                <SubLabel>{plus ? 'Into any of these' : 'Into any of these · specific ones ✨'}</SubLabel>
                <View style={styles.chips}>
                  {interestChoices.map((i) => {
                    const specific = !isBroadInterest(i);
                    if (specific && !plus) {
                      return <OptionChip key={i} label={`${i} ✨`} selected={false} onPress={locked} />;
                    }
                    return (
                      <OptionChip
                        key={i}
                        label={i}
                        selected={filters.interestFilter.includes(i)}
                        onPress={free(() => filters.toggleIn('interestFilter', i))}
                      />
                    );
                  })}
                </View>
                <Pressable onPress={() => setAllInterests((v) => !v)} hitSlop={6}>
                  <AppText style={styles.moreLink}>
                    {allInterests ? 'Show fewer' : plus ? 'See all interests' : 'See all interests ✨'}
                  </AppText>
                </Pressable>
              </FilterRow>
            </FilterGroup>

            <FilterGroup premium locked={!plus}>{exactVibe}</FilterGroup>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label={
            count == null
              ? 'Done'
              : count === 0
                ? 'No one matches yet — loosen a filter'
                : `Show ${count} ${count === 1 ? 'person' : 'people'}`
          }
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  flex: { flex: 1 },
  header: {
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  resetBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radii.pill,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  content: { gap: 12, paddingHorizontal: spacing.lg, paddingTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inset: {
    marginHorizontal: -14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  moreLink: { color: colors.brandBright, fontSize: 13, fontWeight: '700' },
  teaser: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  liveBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(167,139,250,0.35)',
  },
  liveBadgeText: { color: '#E9D5FF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  stepperRow: { flexDirection: 'row', gap: 10 },
  stepper: {
    flex: 1,
    gap: 6,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  stepperValue: { color: colors.text, fontSize: 17, fontWeight: '800' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    backgroundColor: 'rgba(9,9,11,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
