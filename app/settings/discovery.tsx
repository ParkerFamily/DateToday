import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { OptionChip } from '@/components/ui/OptionChip';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { FOOD_CUISINES } from '@/constants/tonightVibe';
import { colors, radii, spacing } from '@/constants/theme';
import { allowedRadiusPresets, canUseAdvancedFilters } from '@/lib/entitlements';
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

export default function DiscoveryFiltersSettingsScreen() {
  const router = useRouter();
  const entitlements = useSessionStore((s) => s.entitlements);
  const preferences = useSessionStore((s) => s.preferences);
  const plus = canUseAdvancedFilters(entitlements);
  const radiiAllowed = allowedRadiusPresets(entitlements);
  const filters = useDiscoverFilters();
  const [plusHint, setPlusHint] = useState(false);

  const softLock = () => setPlusHint(true);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsHeader title="Discovery filters" />
        <AppText variant="secondary" style={styles.sub}>
          Fine-tune who shows up when you’re Live. Free stays relevant; Advanced Filters ✦ add
          precision.
        </AppText>

        {plusHint && !plus ? (
          <Pressable style={styles.hintBanner} onPress={() => router.push('/paywall')}>
            <AppText style={styles.hintTitle}>DateToday+ ✦</AppText>
            <AppText style={styles.hintBody}>
              See what precision unlocks — tap to upgrade when you’re ready.
            </AppText>
          </Pressable>
        ) : null}

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
                <OptionChip key={mi} label={`${mi} mi ✦`} selected={false} onPress={softLock} />
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
                filters.setFreeUntilHour(filters.freeUntilHour === t.hour ? null : t.hour)
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

        <Button
          label="Open full filters"
          variant="ghost"
          onPress={() => router.push('/filters')}
          style={styles.fullLink}
        />

        {!plus ? (
          <Button label="Unlock Advanced Filters ✦" onPress={() => router.push('/paywall')} />
        ) : (
          <Button label="Reset filters" variant="ghost" onPress={() => filters.reset()} />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: 12,
  },
  sub: {
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  hintBanner: {
    marginBottom: spacing.sm,
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
  section: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
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
  fullLink: {
    marginTop: spacing.sm,
  },
});
