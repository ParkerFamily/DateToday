import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { colors, radii } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import type { InterestOption } from '@/types';

const OPTIONS: { value: InterestOption; label: string }[] = [
  { value: 'women', label: 'WOMEN' },
  { value: 'men', label: 'MEN' },
  { value: 'everyone', label: 'EVERYONE' },
];

export default function InterestedInScreen() {
  const router = useRouter();
  const interestedIn = useOnboardingDraft((s) => s.interestedIn);
  const setInterestedIn = useOnboardingDraft((s) => s.setInterestedIn);

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS['interested-in']}
      title="Who are you looking for?"
      footer={
        <PrimaryCta
          label="Continue"
          showArrow={false}
          disabled={!interestedIn}
          onPress={() => router.push('/(onboarding)/intention')}
        />
      }
    >
      <View style={styles.list}>
        {OPTIONS.map((opt) => {
          const on = interestedIn === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setInterestedIn(opt.value);
              }}
              style={[styles.opt, on && styles.optOn]}
            >
              <AppText style={[styles.label, on && styles.labelOn]}>{opt.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  opt: {
    minHeight: 84,
    borderRadius: radii.surface,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optOn: {
    borderColor: colors.brandBright,
    backgroundColor: colors.brand,
  },
  label: { color: colors.textSecondary, fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  labelOn: { color: colors.text },
});
