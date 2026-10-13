import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Screen } from '@/components/ui/Screen';
import { friendlyError } from '@/lib/errors';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { OptionChip } from '@/components/ui/OptionChip';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { ETHNICITY_OPTIONS, ethnicityLabel } from '@/constants/ethnicity';
import { colors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useDiscoverFilters } from '@/store/discoverFilters';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';
import { canUseStrictEthnicityFilter } from '@/lib/entitlements';
import { upgradePrompt } from '@/lib/commerce/upgradePrompt';
import { ScaledSheet } from '@/lib/scale';

export default function EthnicityPreferencesScreen() {
  const router = useRouter();
  const preferences = useSessionStore((s) => s.preferences);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const entitlements = useSessionStore((s) => s.entitlements);
  const draft = useOnboardingDraft();
  const filters = useDiscoverFilters();

  const [mode, setMode] = useState<'open' | 'preferences'>(
    preferences?.preferredEthnicities?.length ? 'preferences' : 'open',
  );
  const [preferredEthnicities, setPreferredEthnicities] = useState<string[]>(
    preferences?.preferredEthnicities ?? draft.preferredEthnicities ?? [],
  );
  const [strictFilter, setStrictFilter] = useState(
    preferences?.strictEthnicityFilter ?? false,
  );
  const [saving, setSaving] = useState(false);

  const canUseStrict = canUseStrictEthnicityFilter(entitlements);

  const toggleEthnicity = (value: string) => {
    setPreferredEthnicities((current) =>
      current.includes(value)
        ? current.filter((e) => e !== value)
        : [...current, value]
    );
  };

  const handleStrictFilterToggle = () => {
    if (!canUseStrict) {
      upgradePrompt({
        feature: 'Strict ethnicity filtering',
        message: 'Only show profiles matching your selected ethnicities.\n\nUpgrade to DateToday+ to unlock this filter.',
        entitlements,
      });
      return;
    }
    setStrictFilter(!strictFilter);
  };

  const save = async () => {
    if (mode === 'preferences' && preferredEthnicities.length === 0) {
      Alert.alert('Ethnicity preferences', 'Select at least one ethnicity or choose "I\'m open to everyone".');
      return;
    }

    setSaving(true);
    try {
      const uid =
        useSessionStore.getState().userId ||
        (isBackendConfigured() ? getFirebaseAuth().currentUser?.uid : null) ||
        preferences?.userId ||
        'local';

      const finalEthnicities = mode === 'open' ? [] : preferredEthnicities;
      const finalStrict = mode === 'open' ? false : strictFilter && canUseStrict;

      const next = {
        ...preferences,
        userId: uid,
        preferredEthnicities: finalEthnicities,
        strictEthnicityFilter: finalStrict,
      };
      setPreferences(next);

      draft.setPreferredEthnicities(finalEthnicities);

      // Update discovery filters
      filters.patch({
        ethnicityPreference: finalEthnicities,
        strictEthnicityFilter: finalStrict,
      });

      if (isBackendConfigured() && uid !== 'local') {
        await setDoc(
          doc(getDb(), 'users', uid),
          {
            preferredEthnicities: finalEthnicities,
            strictEthnicityFilter: finalStrict,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      Alert.alert('Saved', 'Ethnicity preferences updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', friendlyError(e, 'Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsHeader title="Ethnicity preferences" />

        <AppText style={styles.intro}>
          Choose how ethnicity affects your discovery experience.
        </AppText>

        <View style={styles.radioGroup}>
          <Pressable
            onPress={() => setMode('open')}
            style={[styles.radioOption, mode === 'open' && styles.radioOptionOn]}
          >
            <View style={[styles.radio, mode === 'open' && styles.radioOn]}>
              {mode === 'open' ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.radioText}>
              <AppText style={styles.radioLabel}>I'm open to everyone</AppText>
              <AppText style={styles.radioSub}>No ethnicity-based prioritization</AppText>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setMode('preferences')}
            style={[styles.radioOption, mode === 'preferences' && styles.radioOptionOn]}
          >
            <View style={[styles.radio, mode === 'preferences' && styles.radioOn]}>
              {mode === 'preferences' ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.radioText}>
              <AppText style={styles.radioLabel}>I have preferences</AppText>
              <AppText style={styles.radioSub}>Select ethnicities you prefer</AppText>
            </View>
          </Pressable>
        </View>

        {mode === 'preferences' ? (
          <>
            <AppText variant="label" style={styles.label}>
              Select ethnicities you prefer (you can choose multiple)
            </AppText>
            <View style={styles.chips}>
              {ETHNICITY_OPTIONS.map((opt) => (
                <OptionChip
                  key={opt.value}
                  label={opt.label}
                  selected={preferredEthnicities.includes(opt.value)}
                  onPress={() => toggleEthnicity(opt.value)}
                />
              ))}
            </View>

            {preferredEthnicities.length > 0 ? (
              <>
                <View style={styles.divider} />
                <AppText style={styles.sectionNote}>
                  Free users: Your selected ethnicities will be prioritized in discovery, but you'll still see other profiles.
                </AppText>

                <Pressable
                  onPress={handleStrictFilterToggle}
                  style={styles.strictRow}
                >
                  <View style={styles.strictText}>
                    <View style={styles.strictLabelRow}>
                      <AppText style={styles.strictLabel}>
                        Only show selected ethnicities
                      </AppText>
                      {!canUseStrict ? (
                        <View style={styles.plusBadge}>
                          <AppText style={styles.plusBadgeText}>PLUS</AppText>
                        </View>
                      ) : null}
                    </View>
                    <AppText style={styles.strictSub}>
                      Strict filtering — people who haven't disclosed their ethnicity won't appear
                    </AppText>
                  </View>
                  <View style={[styles.checkbox, strictFilter && canUseStrict && styles.checkboxOn]}>
                    {strictFilter && canUseStrict ? (
                      <AppText style={styles.checkMark}>✓</AppText>
                    ) : null}
                  </View>
                </Pressable>

                <AppText style={styles.note}>
                  Note: Ethnicity information is self-reported and optional. We never infer ethnicity from photos or other data.
                </AppText>
              </>
            ) : null}
          </>
        ) : null}

        <Button label="Save" onPress={() => void save()} loading={saving} style={styles.save} />
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  radioGroup: {
    gap: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  radioOptionOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioOn: {
    borderColor: colors.brandBright,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandBright,
  },
  radioText: {
    flex: 1,
    gap: 4,
  },
  radioLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  radioSub: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    marginLeft: 4,
    marginBottom: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  sectionNote: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  strictRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  strictText: {
    flex: 1,
    gap: 4,
  },
  strictLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  strictLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  strictSub: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  plusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.brandBright,
  },
  plusBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: {
    borderColor: colors.brandBright,
    backgroundColor: colors.brandBright,
  },
  checkMark: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  note: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  save: {
    marginTop: spacing.lg,
  },
});
