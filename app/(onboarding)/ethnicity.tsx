import React, { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { ETHNICITY_OPTIONS } from '@/constants/ethnicity';
import { colors, radii, spacing } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { ScaledSheet } from '@/lib/scale';

export default function EthnicityScreen() {
  const router = useRouter();
  const ethnicities = useOnboardingDraft((s) => s.ethnicities);
  const showEthnicity = useOnboardingDraft((s) => s.showEthnicity);
  const setEthnicities = useOnboardingDraft((s) => s.setEthnicities);
  const setShowEthnicity = useOnboardingDraft((s) => s.setShowEthnicity);

  const toggleEthnicity = useCallback(
    (value: string) => {
      void Haptics.selectionAsync();
      setEthnicities(
        ethnicities.includes(value)
          ? ethnicities.filter((e) => e !== value)
          : [...ethnicities, value]
      );
    },
    [ethnicities, setEthnicities],
  );

  const next = () => router.push('/(onboarding)/distance');
  const skip = () => {
    setEthnicities([]);
    setShowEthnicity(false);
    next();
  };

  return (
    <OnboardingChrome
      compact
      progress={ONBOARD_PROGRESS.interests + 0.5}
      title="How do you describe your race or ethnicity?"
      subtitle="This is optional and helps personalize your experience. You can select multiple."
      footer={
        <View style={styles.footer}>
          {ethnicities.length > 0 ? (
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setShowEthnicity(!showEthnicity);
              }}
              style={styles.visibilityRow}
            >
              <View style={[styles.checkbox, showEthnicity && styles.checkboxOn]}>
                {showEthnicity ? <AppText style={styles.checkMark}>✓</AppText> : null}
              </View>
              <AppText style={styles.visibilityLabel}>Show my race or ethnicity on my profile</AppText>
            </Pressable>
          ) : null}
          <PrimaryCta label="Continue" showArrow={false} onPress={next} />
          <Button label="Skip this question" variant="ghost" onPress={skip} />
        </View>
      }
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {ETHNICITY_OPTIONS.map((opt) => {
          const selected = ethnicities.includes(opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => toggleEthnicity(opt.value)}
              style={[styles.opt, selected && styles.optOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
            >
              <AppText style={[styles.label, selected && styles.labelOn]}>{opt.label}</AppText>
              <View style={[styles.check, selected && styles.checkOn]}>
                {selected ? <AppText style={styles.checkMark}>✓</AppText> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
  scroll: { flex: 1 },
  list: {
    gap: 8,
    paddingBottom: 8,
  },
  footer: {
    gap: 8,
  },
  opt: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    minHeight: 48,
  },
  optOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124,58,237,0.25)',
  },
  label: {
    flex: 1,
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 15,
  },
  labelOn: { color: colors.text },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    borderColor: colors.brandBright,
    backgroundColor: colors.brandBright,
  },
  checkMark: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
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
  },
  checkboxOn: {
    borderColor: colors.brandBright,
    backgroundColor: colors.brandBright,
  },
  visibilityLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
