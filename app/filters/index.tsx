import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { OptionChip } from '@/components/ui/OptionChip';
import { FOOD_CUISINES } from '@/constants/tonightVibe';
import { colors, radii, spacing } from '@/constants/theme';
import {
  allowedRadiusPresets,
  canUseAdvancedFilters,
} from '@/lib/entitlements';
import { useDiscoverFilters } from '@/store/discoverFilters';
import { useSessionStore } from '@/store/session';
import type { TonightActivity } from '@/types';

const VIBES: { value: TonightActivity; label: string }[] = [
  { value: 'drinks', label: 'Drinks' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'activity', label: 'Activity' },
];

const FREE_UNTIL = [
  { hour: 21, label: 'Until 9 PM+' },
  { hour: 22, label: 'Until 10 PM+' },
  { hour: 23, label: 'Until 11 PM+' },
];

const PLUS_PREVIEW = [
  { title: 'Your vibe', body: 'Food, fun, dating, casual — up to 2' },
  { title: 'Lifestyle', body: 'Drinking, smoking preferences' },
  { title: 'Height range', body: 'Set a precise range' },
  { title: 'Education', body: 'Filter by education level' },
  { title: 'Kids preference', body: 'Has kids / wants kids' },
  { title: 'Match all filters', body: 'Only show people who fit every rule' },
  { title: 'Saved presets', body: 'Reuse filter sets for different nights' },
  { title: 'Priority Pool', body: 'People with highly compatible tonight plans' },
] as const;

/**
 * Free: relevant pool (gender/age, radius ≤25, vibe, cuisine, available-until, verified).
 * Plus: precision / lifestyle — shown with ✦, not an instant wall.
 */
export default function FiltersScreen() {
  const router = useRouter();
  const entitlements = useSessionStore((s) => s.entitlements);
  const preferences = useSessionStore((s) => s.preferences);
  const plus = canUseAdvancedFilters(entitlements);
  const radiiAllowed = allowedRadiusPresets(entitlements);
  const filters = useDiscoverFilters();
  const [plusHint, setPlusHint] = useState(false);

  const softLock = () => setPlusHint(true);

  return (
    <Screen>
      <View style={styles.top}>
        <AppText style={styles.title}>Fine-tune your pool</AppText>
        <CloseButton onPress={() => router.back()} />
      </View>
      <AppText style={styles.sub}>
        Free stays relevant. Advanced Filters ✦ add precision — not safety gates.
      </AppText>

      {plusHint && !plus ? (
        <Pressable style={styles.hintBanner} onPress={() => router.push('/paywall')}>
          <AppText style={styles.hintTitle}>DateToday+ ✦</AppText>
          <AppText style={styles.hintBody}>
            See what precision unlocks — tap to upgrade when you’re ready.
          </AppText>
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText style={styles.section}>BASICS</AppText>
        <AppText style={styles.row}>
          Into:{' '}
          <AppText style={styles.strong}>
            {preferences?.interestedIn ?? 'Set in preferences'}
          </AppText>
        </AppText>
        <AppText style={styles.row}>
          Age:{' '}
          <AppText style={styles.strong}>
            {preferences ? `${preferences.minAge}–${preferences.maxAge}` : 'Set in preferences'}
          </AppText>
        </AppText>
        <Button
          label="Edit dating preferences"
          variant="secondary"
          onPress={() => router.push('/settings/preferences')}
        />

        <AppText style={styles.section}>DISTANCE</AppText>
        <View style={styles.chips}>
          {radiiAllowed.map((mi) => (
            <OptionChip
              key={mi}
              label={`${mi} mi`}
              selected={filters.maxDistanceMiles === mi}
              onPress={() => filters.setMaxDistanceMiles(mi)}
            />
          ))}
          {!plus
            ? [15, 50].map((mi) => (
                <OptionChip
                  key={mi}
                  label={`${mi} mi ✦`}
                  selected={false}
                  onPress={softLock}
                />
              ))
            : null}
        </View>

        <AppText style={styles.section}>AVAILABLE UNTIL</AppText>
        <View style={styles.chips}>
          {FREE_UNTIL.map((t) => (
            <OptionChip
              key={t.hour}
              label={t.label}
              selected={filters.freeUntilHour === t.hour}
              onPress={() =>
                filters.setFreeUntilHour(
                  filters.freeUntilHour === t.hour ? null : t.hour,
                )
              }
            />
          ))}
        </View>

        <AppText style={styles.section}>TONIGHT’S PLAN</AppText>
        <View style={styles.chips}>
          {VIBES.map((v) => (
            <OptionChip
              key={v.value}
              label={v.label}
              selected={filters.vibeFilter.includes(v.value)}
              onPress={() => filters.toggleVibeFilter(v.value)}
            />
          ))}
        </View>

        <AppText style={styles.label}>Dinner preference</AppText>
        <View style={styles.chips}>
          {FOOD_CUISINES.map((c) => {
            const selected = filters.foodFilter.includes(c.value);
            return (
              <OptionChip
                key={c.value}
                label={
                  !plus && filters.foodFilter.length >= 1 && !selected
                    ? `${c.label} ✦`
                    : c.label
                }
                selected={selected}
                onPress={() => {
                  if (!plus && filters.foodFilter.length >= 1 && !selected) {
                    softLock();
                    return;
                  }
                  filters.toggleFoodFilter(c.value);
                }}
              />
            );
          })}
        </View>

        <Pressable
          style={styles.lockRow}
          onPress={() => filters.setVerifiedOnly(!filters.verifiedOnly)}
        >
          <View>
            <AppText style={styles.lockTitle}>Verified only</AppText>
            <AppText style={styles.lockBody}>Trust & safety — always free</AppText>
          </View>
          <AppText style={styles.lockValue}>{filters.verifiedOnly ? 'ON' : 'OFF'}</AppText>
        </Pressable>

        <AppText style={styles.section}>ADVANCED FILTERS ✦</AppText>
        <AppText style={styles.plusLead}>
          Age refinements, lifestyle, vibe + more. Browse freely — subscribe when you want
          them applied.
        </AppText>

        {PLUS_PREVIEW.map((item) => (
          <Pressable
            key={item.title}
            style={[styles.lockRow, !plus && styles.lockDim]}
            onPress={() => {
              if (!plus) softLock();
              else if (item.title === 'Match all filters') {
                filters.setMatchAllFilters(!filters.matchAllFilters);
              }
            }}
          >
            <View style={styles.lockCopy}>
              <AppText style={styles.lockTitle}>
                {item.title}
                {!plus ? ' ✦' : ''}
              </AppText>
              <AppText style={styles.lockBody}>{item.body}</AppText>
            </View>
            {plus && item.title === 'Match all filters' ? (
              <AppText style={styles.lockValue}>
                {filters.matchAllFilters ? 'ON' : 'OFF'}
              </AppText>
            ) : (
              <AppText style={styles.lockValue}>{plus ? '›' : '✦'}</AppText>
            )}
          </Pressable>
        ))}

        {!plus ? (
          <Button
            label="Unlock Advanced Filters ✦"
            onPress={() => router.push('/paywall')}
            style={styles.cta}
          />
        ) : (
          <Button label="Reset filters" variant="ghost" onPress={() => filters.reset()} />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    flex: 1,
    paddingRight: 12,
  },
  sub: {
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  hintBanner: {
    marginBottom: spacing.md,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: 'rgba(124,58,237,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    gap: 4,
  },
  hintTitle: {
    color: colors.brandBright,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  hintBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  content: {
    gap: 12,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  plusLead: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
  },
  row: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  strong: {
    color: colors.text,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  lockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  lockDim: {
    opacity: 0.9,
  },
  lockCopy: {
    flex: 1,
  },
  lockTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  lockBody: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  lockValue: {
    color: colors.brandBright,
    fontWeight: '800',
  },
  cta: {
    marginTop: spacing.md,
  },
});
