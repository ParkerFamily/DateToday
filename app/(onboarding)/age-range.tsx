import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { RangeSlider } from '@/components/ui/RangeSlider';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { colors } from '@/constants/theme';
import { ANY_MAX_AGE, ANY_MIN_AGE, sliderToAgeRange } from '@/features/profile/ageRange';
import { AGE_BOUNDS } from '@/store/discoverFilters';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { ScaledSheet } from '@/lib/scale';

export default function AgeRangeScreen() {
  const router = useRouter();
  const minAge = useOnboardingDraft((s) => s.minAge);
  const maxAge = useOnboardingDraft((s) => s.maxAge);
  const setAgeRange = useOnboardingDraft((s) => s.setAgeRange);
  const anyAge = minAge <= ANY_MIN_AGE && maxAge >= ANY_MAX_AGE;
  const label = anyAge ? 'Any age' : maxAge >= ANY_MAX_AGE ? `${minAge}+` : `${minAge}–${maxAge}`;

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS['age-range']}
      title="What ages?"
      subtitle="We show you people in this range first. You can change it anytime."
      footer={
        <PrimaryCta
          label="Continue"
          showArrow={false}
          onPress={() => router.push('/(onboarding)/intention')}
        />
      }
    >
      <AppText style={styles.big}>{label}</AppText>
      <View style={styles.slider}>
        <RangeSlider
          min={AGE_BOUNDS.min}
          max={AGE_BOUNDS.max}
          low={Math.min(minAge, AGE_BOUNDS.max)}
          high={Math.min(maxAge, AGE_BOUNDS.max)}
          onChange={(low, high) => {
            const range = sliderToAgeRange(low, high);
            setAgeRange(range.minAge, range.maxAge);
          }}
          format={(v) => (v >= AGE_BOUNDS.max ? `${v}+` : String(v))}
        />
      </View>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
  big: {
    marginTop: 12,
    textAlign: 'center',
    color: colors.text,
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  slider: { marginTop: 28 },
});
