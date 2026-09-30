import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { OptionChip } from '@/components/ui/OptionChip';
import { FOOD_CUISINES } from '@/constants/tonightVibe';
import {
  HOW_SOON_OPTIONS,
  isAfterHours,
  OUT_LATE_OPTIONS,
  SPONTANEOUS_OPTIONS,
} from '@/constants/afterHours';
import {
  ALL_INTERESTS,
  BROAD_INTERESTS,
  EXERCISE_OPTIONS,
  isBroadInterest,
  KIDS_OPTIONS,
} from '@/constants/interests';
import { colors, gradients, radii, spacing } from '@/constants/theme';
import {
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
import type { DatingIntention, DiscoveryCard, TonightActivity } from '@/types';

const VIBES: { value: TonightActivity; label: string }[] = [
  { value: 'drinks', label: 'Drinks' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'activity', label: 'Activity' },
];

const FREE_UNTIL = [
  { hour: 21, label: '9 PM+' },
  { hour: 22, label: '10 PM+' },
  { hour: 23, label: '11 PM+' },
];

const HEIGHT_IN = { min: 58, max: 84 } as const;
const inToCm = (inches: number) => Math.round(inches * 2.54);
const cmToIn = (cm: number) => Math.round(cm / 2.54);

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={colors.brandBright} />
        <AppText style={styles.sectionTitle}>{title}</AppText>
        {hint ? <AppText style={styles.sectionHint}>{hint}</AppText> : null}
      </View>
      {children}
    </View>
  );
}

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
          <Ionicons name="remove" size={18} color={colors.text} />
        </Pressable>
        <AppText style={styles.stepperValue}>{display}</AppText>
        <Pressable accessibilityLabel={`${label} higher`} onPress={onPlus} hitSlop={6} style={styles.stepBtn}>
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

function ToggleRow({
  title,
  body,
  value,
  onChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <AppText style={styles.toggleTitle}>{title}</AppText>
        <AppText style={styles.toggleBody}>{body}</AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor={colors.white}
      />
    </View>
  );
}

function PlusLock({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.unlockPill}>
      <LinearGradient colors={[...gradients.brand]} style={styles.unlockGrad}>
        <AppText style={styles.unlockText}>Unlock</AppText>
      </LinearGradient>
    </Pressable>
  );
}

/** Step a nullable bound: "Any" sits just outside the range on both ends. */
function stepBound(value: number | null, dir: 1 | -1, min: number, max: number, start: number) {
  if (value == null) return dir === 1 ? start : null;
  const next = value + dir;
  if (next < min || next > max) return null;
  return next;
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

  const setAge = (which: 'ageMin' | 'ageMax', dir: 1 | -1) => {
    tap();
    const start = which === 'ageMin' ? 21 : 35;
    const next = stepBound(filters[which], dir, AGE_BOUNDS.min, AGE_BOUNDS.max, start);
    const patch: Partial<typeof filters> = { [which]: next };
    if (next != null) {
      if (which === 'ageMin' && filters.ageMax != null && next > filters.ageMax) patch.ageMax = next;
      if (which === 'ageMax' && filters.ageMin != null && next < filters.ageMin) patch.ageMin = next;
    }
    filters.patch(patch);
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

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <AppText style={styles.title}>Filters</AppText>
          <AppText style={styles.sub}>
            {labels.length ? `${labels.length} on · applies instantly` : 'Pick who you want to see tonight'}
          </AppText>
        </View>
        {labels.length ? (
          <Pressable onPress={() => filters.reset()} hitSlop={8} style={styles.resetBtn}>
            <AppText style={styles.resetText}>Reset</AppText>
          </Pressable>
        ) : null}
        <CloseButton onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Section icon="location" title="Distance" hint={plus ? undefined : '15 & 50 mi ✦'}>
          <View style={styles.chips}>
            {radiiAllowed.map((mi) => (
              <OptionChip
                key={mi}
                label={`${mi} mi`}
                selected={filters.maxDistanceMiles === mi}
                onPress={() => {
                  tap();
                  filters.setMaxDistanceMiles(mi);
                }}
              />
            ))}
            {!plus
              ? [15, 50].map((mi) => (
                  <OptionChip key={mi} label={`${mi} mi ✦`} selected={false} onPress={locked} />
                ))
              : null}
          </View>
        </Section>

        <Section icon="timer" title="How soon?" hint="Free">
          <View style={styles.chips}>
            {HOW_SOON_OPTIONS.map((o) => (
              <OptionChip
                key={o.value}
                label={o.label}
                selected={filters.howSoon === o.value}
                onPress={() => {
                  tap();
                  filters.patch({ howSoon: filters.howSoon === o.value ? null : o.value });
                }}
              />
            ))}
          </View>
        </Section>

        <Section icon="flash" title="Tonight’s plan">
          <View style={styles.chips}>
            {VIBES.map((v) => (
              <OptionChip
                key={v.value}
                label={v.label}
                selected={filters.vibeFilter.includes(v.value)}
                onPress={() => {
                  tap();
                  filters.toggleVibeFilter(v.value);
                }}
              />
            ))}
          </View>
          <AppText style={styles.subLabel}>
            Dinner preference{plus ? '' : ' · pick 1 (more with ✦)'}
          </AppText>
          <View style={styles.chips}>
            {FOOD_CUISINES.map((c) => (
              <OptionChip
                key={c.value}
                label={c.label}
                selected={filters.foodFilter.includes(c.value)}
                onPress={() => {
                  tap();
                  filters.toggleFoodFilter(c.value, plus);
                }}
              />
            ))}
          </View>
        </Section>

        <Section icon="time" title="Free until at least">
          <View style={styles.chips}>
            {FREE_UNTIL.map((t) => (
              <OptionChip
                key={t.hour}
                label={t.label}
                selected={filters.freeUntilHour === t.hour}
                onPress={() => {
                  tap();
                  filters.setFreeUntilHour(filters.freeUntilHour === t.hour ? null : t.hour);
                }}
              />
            ))}
          </View>
        </Section>

        <View style={styles.section}>
          <ToggleRow
            title="Verified only"
            body="Photo-verified people. Always free."
            value={filters.verifiedOnly}
            onChange={(v) => {
              tap();
              filters.setVerifiedOnly(v);
            }}
          />
        </View>

        <Section icon="people" title="Age">
          <View style={styles.stepperRow}>
            <Stepper
              label="From"
              display={filters.ageMin == null ? 'Any' : String(filters.ageMin)}
              onMinus={() => setAge('ageMin', -1)}
              onPlus={() => setAge('ageMin', 1)}
            />
            <Stepper
              label="To"
              display={filters.ageMax == null ? 'Any' : String(filters.ageMax)}
              onMinus={() => setAge('ageMax', -1)}
              onPlus={() => setAge('ageMax', 1)}
            />
          </View>
        </Section>

        <Section
          icon="heart"
          title="Interests"
          hint={filters.interestFilter.length ? `${filters.interestFilter.length} picked` : plus ? undefined : 'Specific ✦'}
        >
          <ToggleRow
            title="Shares my interests"
            body={
              myInterests?.length
                ? 'Only people with at least one interest in common'
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
          <AppText style={styles.subLabel}>Into any of these</AppText>
          <View style={styles.chips}>
            {interestChoices.map((i) => {
              const specific = !isBroadInterest(i);
              if (specific && !plus) {
                return <OptionChip key={i} label={`${i} ✦`} selected={false} onPress={locked} />;
              }
              return (
                <OptionChip
                  key={i}
                  label={i}
                  selected={filters.interestFilter.includes(i)}
                  onPress={() => {
                    tap();
                    filters.toggleIn('interestFilter', i);
                  }}
                />
              );
            })}
          </View>
          <Pressable onPress={() => setAllInterests((v) => !v)} hitSlop={6}>
            <AppText style={styles.moreLink}>
              {allInterests ? 'Show fewer' : plus ? 'See all interests' : 'See all interests ✦'}
            </AppText>
          </Pressable>
        </Section>

        <View style={[styles.plusCard, styles.nightCard, !plus && styles.plusCardLocked]}>
          <LinearGradient
            colors={['rgba(30,27,75,0.95)', 'rgba(88,28,135,0.35)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.plusHead}
          >
            <Ionicons name="moon" size={18} color="#C4B5FD" />
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <AppText style={styles.plusTitle}>After Hours</AppText>
                <View style={[styles.badge, afterHoursOpen && styles.badgeLive]}>
                  <AppText style={styles.badgeText}>{afterHoursOpen ? 'OPEN NOW' : 'OPENS 9 PM'}</AppText>
                </View>
              </View>
              <AppText style={styles.plusBody}>Show people still open to plans after 10 PM.</AppText>
            </View>
            {!plus ? <PlusLock onPress={locked} /> : null}
          </LinearGradient>

          {afterHoursOpen ? (
            <View style={styles.plusInner}>
              <AppText style={styles.subLabel}>Still free</AppText>
              <View style={styles.chips}>
                {OUT_LATE_OPTIONS.map((o) => (
                  <OptionChip
                    key={o.value}
                    label={o.label}
                    selected={plus && filters.outLate === o.value}
                    onPress={plusOnly(() =>
                      filters.patch({ outLate: filters.outLate === o.value ? null : o.value }),
                    )}
                  />
                ))}
              </View>
              <AppText style={styles.subLabel}>Only people who are</AppText>
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
            </View>
          ) : (
            <View style={styles.plusInner}>
              <AppText style={styles.nightTeaser}>
                Comes alive at 9 PM — find people free past 10, 11, or midnight, available right now, or
                open to late-night plans.
              </AppText>
            </View>
          )}
        </View>

        <View style={[styles.plusCard, !plus && styles.plusCardLocked]}>
          <LinearGradient
            colors={['rgba(234,88,12,0.28)', 'rgba(251,191,36,0.06)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.plusHead}
          >
            <Ionicons name="flash" size={18} color="#FDBA74" />
            <View style={styles.flex}>
              <AppText style={styles.plusTitle}>Spontaneous</AppText>
              <AppText style={styles.plusBody}>People ready to make something happen right now.</AppText>
            </View>
            {!plus ? <PlusLock onPress={locked} /> : null}
          </LinearGradient>
          <View style={styles.plusInner}>
            <View style={styles.chips}>
              {SPONTANEOUS_OPTIONS.map((o) => (
                <OptionChip
                  key={o.value}
                  label={o.label}
                  selected={plus && filters.spontaneous.includes(o.value)}
                  onPress={plusOnly(() => filters.toggleIn('spontaneous', o.value))}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.plusCard, !plus && styles.plusCardLocked]}>
          <LinearGradient
            colors={['rgba(124,58,237,0.35)', 'rgba(192,132,252,0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.plusHead}
          >
            <Ionicons name="sparkles" size={18} color={colors.brandBright} />
            <View style={styles.flex}>
              <AppText style={styles.plusTitle}>Advanced Filters</AppText>
              <AppText style={styles.plusBody}>
                {plus ? 'Included with your DateToday+' : 'Find exactly your type with DateToday+'}
              </AppText>
            </View>
            {!plus ? <PlusLock onPress={locked} /> : null}
          </LinearGradient>

          <View style={styles.plusInner}>
            <AppText style={styles.subLabel}>Looking for</AppText>
            <View style={styles.chips}>
              {INTENT_OPTIONS.map((o) => (
                <OptionChip
                  key={o.value}
                  label={o.label}
                  selected={plus && filters.intents.includes(o.value as DatingIntention)}
                  onPress={plusOnly(() => filters.toggleIn('intents', o.value))}
                />
              ))}
            </View>

            <AppText style={styles.subLabel}>Height</AppText>
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

            <AppText style={styles.subLabel}>Drinks</AppText>
            <View style={styles.chips}>
              {LIFESTYLE_OPTIONS.map((o) => (
                <OptionChip
                  key={o}
                  label={o}
                  selected={plus && filters.drinking.includes(o)}
                  onPress={plusOnly(() => filters.toggleIn('drinking', o))}
                />
              ))}
            </View>

            <AppText style={styles.subLabel}>Smokes</AppText>
            <View style={styles.chips}>
              {LIFESTYLE_OPTIONS.map((o) => (
                <OptionChip
                  key={o}
                  label={o}
                  selected={plus && filters.smoking.includes(o)}
                  onPress={plusOnly(() => filters.toggleIn('smoking', o))}
                />
              ))}
            </View>

            <AppText style={styles.subLabel}>Works out</AppText>
            <View style={styles.chips}>
              {EXERCISE_OPTIONS.map((o) => (
                <OptionChip
                  key={o}
                  label={o}
                  selected={plus && filters.exercise.includes(o)}
                  onPress={plusOnly(() => filters.toggleIn('exercise', o))}
                />
              ))}
            </View>

            <AppText style={styles.subLabel}>Kids</AppText>
            <View style={styles.chips}>
              {KIDS_OPTIONS.map((o) => (
                <OptionChip
                  key={o}
                  label={o}
                  selected={plus && filters.kids.includes(o)}
                  onPress={plusOnly(() => filters.toggleIn('kids', o))}
                />
              ))}
            </View>

            <ToggleRow
              title="Has a video intro"
              body="Only people who recorded a video"
              value={plus && filters.videoOnly}
              onChange={(v) => (plus ? filters.patch({ videoOnly: v }) : locked())}
            />
            <ToggleRow
              title="Match every filter"
              body="Strict: hide anyone missing info you filter on"
              value={plus && filters.matchAllFilters}
              onChange={(v) => (plus ? filters.setMatchAllFilters(v) : locked())}
            />
          </View>
        </View>
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
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
  content: { gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  section: {
    gap: 12,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  sectionHint: { color: colors.brandBright, fontSize: 12, fontWeight: '700' },
  subLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  moreLink: { color: colors.brandBright, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  stepperValue: { color: colors.text, fontSize: 17, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  toggleBody: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  plusCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.55)',
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  plusCardLocked: { borderStyle: 'dashed' },
  nightCard: { borderColor: 'rgba(196,181,253,0.45)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  badgeLive: { backgroundColor: 'rgba(167,139,250,0.35)' },
  badgeText: { color: '#E9D5FF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  nightTeaser: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  plusHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  plusTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  plusBody: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  unlockPill: { borderRadius: radii.pill, overflow: 'hidden' },
  unlockGrad: { paddingHorizontal: 14, height: 32, justifyContent: 'center' },
  unlockText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  plusInner: { gap: 12, padding: 14, paddingTop: 4 },
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
