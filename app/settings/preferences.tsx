import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { OptionChip } from '@/components/ui/OptionChip';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { datingVibes, interestOptions } from '@/constants/copy';
import { colors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';
import type { DatingIntention, DatingPreferences, InterestOption, RadiusMiles } from '@/types';

const DISTANCE: RadiusMiles[] = [5, 10, 25, 50];
const MAX_VIBES = 2;

export default function DatingPreferencesScreen() {
  const router = useRouter();
  const preferences = useSessionStore((s) => s.preferences);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const profile = useSessionStore((s) => s.profile);
  const setProfile = useSessionStore((s) => s.setProfile);
  const draft = useOnboardingDraft();

  const [interestedIn, setInterestedIn] = useState<InterestOption>(
    preferences?.interestedIn ?? draft.interestedIn ?? 'everyone',
  );
  const [vibes, setVibes] = useState<DatingIntention[]>(
    preferences?.intentions?.length
      ? preferences.intentions
      : draft.vibes.length
        ? draft.vibes
        : profile?.datingIntention
          ? [profile.datingIntention]
          : [],
  );
  const [minAge, setMinAge] = useState(preferences?.minAge ?? draft.minAge ?? 18);
  const [maxAge, setMaxAge] = useState(preferences?.maxAge ?? draft.maxAge ?? 35);
  const [maxDistanceMiles, setMaxDistanceMiles] = useState<RadiusMiles>(
    (preferences?.maxDistanceMiles as RadiusMiles) ?? draft.radiusMiles ?? 10,
  );
  const [saving, setSaving] = useState(false);

  const toggleVibe = (value: DatingIntention) => {
    setVibes((current) => {
      if (current.includes(value)) return current.filter((v) => v !== value);
      if (current.length >= MAX_VIBES) return current;
      return [...current, value];
    });
  };

  const bumpAge = (which: 'min' | 'max', delta: number) => {
    if (which === 'min') {
      setMinAge((v) => Math.min(Math.max(18, v + delta), maxAge));
    } else {
      setMaxAge((v) => Math.max(Math.min(99, v + delta), minAge));
    }
  };

  const save = async () => {
    if (vibes.length < 1) {
      Alert.alert('Your vibe', 'Pick at least one vibe (up to 2).');
      return;
    }
    if (minAge > maxAge) {
      Alert.alert('Age range', 'Min age must be less than or equal to max age.');
      return;
    }

    setSaving(true);
    try {
      const uid =
        useSessionStore.getState().userId ||
        (isBackendConfigured() ? getFirebaseAuth().currentUser?.uid : null) ||
        preferences?.userId ||
        'local';

      const next: DatingPreferences = {
        userId: uid,
        interestedIn,
        minAge,
        maxAge,
        maxDistanceMiles,
        intentions: vibes,
      };
      setPreferences(next);

      if (profile) {
        setProfile({
          ...profile,
          datingIntention: vibes[0] ?? profile.datingIntention,
          updatedAt: new Date().toISOString(),
          profileCompletion: {
            ...profile.profileCompletion,
            preference: true,
            vibes: true,
          },
        });
      }

      draft.setInterestedIn(interestedIn);
      useOnboardingDraft.setState({ vibes });
      draft.setAgeRange(minAge, maxAge);
      draft.setRadiusMiles(maxDistanceMiles);

      if (isBackendConfigured() && uid !== 'local') {
        await setDoc(
          doc(getDb(), 'users', uid),
          {
            interestedIn,
            minAge,
            maxAge,
            maxDistanceMiles,
            vibes,
            datingIntention: vibes[0] ?? null,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      Alert.alert('Saved', 'Dating preferences updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsHeader title="Dating preferences" />

        <AppText variant="label" style={styles.label}>
          Interested in
        </AppText>
        <View style={styles.chips}>
          {interestOptions.map((opt) => (
            <OptionChip
              key={opt.value}
              label={opt.label}
              selected={interestedIn === opt.value}
              onPress={() => setInterestedIn(opt.value)}
            />
          ))}
        </View>

        <AppText variant="label" style={styles.label}>
          Your vibe (up to 2)
        </AppText>
        <View style={styles.chips}>
          {datingVibes.map((opt) => (
            <OptionChip
              key={opt.value}
              label={opt.label}
              selected={vibes.includes(opt.value)}
              onPress={() => toggleVibe(opt.value)}
            />
          ))}
        </View>

        <AppText variant="label" style={styles.label}>
          Age range
        </AppText>
        <View style={styles.ageRow}>
          <Stepper label="Min" value={minAge} onDec={() => bumpAge('min', -1)} onInc={() => bumpAge('min', 1)} />
          <AppText style={styles.ageSep}>–</AppText>
          <Stepper label="Max" value={maxAge} onDec={() => bumpAge('max', -1)} onInc={() => bumpAge('max', 1)} />
        </View>

        <AppText variant="label" style={styles.label}>
          Max distance
        </AppText>
        <View style={styles.chips}>
          {DISTANCE.map((mi) => (
            <OptionChip
              key={mi}
              label={`${mi} mi`}
              selected={maxDistanceMiles === mi}
              onPress={() => setMaxDistanceMiles(mi)}
            />
          ))}
        </View>

        <Button label="Save" onPress={() => void save()} loading={saving} style={styles.save} />
      </ScrollView>
    </Screen>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <AppText variant="secondary" style={styles.stepperLabel}>
        {label}
      </AppText>
      <View style={styles.stepperControls}>
        <Pressable onPress={onDec} style={styles.stepBtn} accessibilityRole="button">
          <AppText style={styles.stepBtnText}>−</AppText>
        </Pressable>
        <AppText style={styles.stepValue}>{value}</AppText>
        <Pressable onPress={onInc} style={styles.stepBtn} accessibilityRole="button">
          <AppText style={styles.stepBtnText}>+</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  label: {
    marginTop: spacing.md,
    marginLeft: 4,
    marginBottom: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ageSep: {
    color: colors.textSecondary,
    fontSize: 22,
    fontWeight: '700',
  },
  stepper: {
    flex: 1,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    gap: 8,
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 26,
  },
  stepValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  save: {
    marginTop: spacing.lg,
  },
});
