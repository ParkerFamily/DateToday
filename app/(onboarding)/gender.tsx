import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { colors, radii } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';

const OPTIONS = [
  { value: 'woman' as const, label: 'WOMAN' },
  { value: 'man' as const, label: 'MAN' },
  { value: 'nonbinary' as const, label: 'NON-BINARY' },
];

export default function GenderScreen() {
  const router = useRouter();
  const gender = useOnboardingDraft((s) => s.gender);
  const setGender = useOnboardingDraft((s) => s.setGender);

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.gender}
      title="How do you identify?"
      footer={
        <PrimaryCta
          label="Continue"
          showArrow={false}
          disabled={!gender}
          onPress={() => router.push('/(onboarding)/interested-in')}
        />
      }
    >
      <View style={styles.list}>
        {OPTIONS.map((opt) => {
          const on = gender === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                void Haptics.selectionAsync();
                setGender(opt.value);
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
  list: { gap: 12 },
  opt: {
    minHeight: 68,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124,58,237,0.28)',
  },
  label: { color: colors.textSecondary, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  labelOn: { color: colors.text },
});
