import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';

/**
 * Skip video prompts for now — enter later from Profile / Photos & videos.
 * Go Live stays locked until both videos are recorded.
 */
export function skipVideosForNow(router: ReturnType<typeof useRouter>) {
  const draft = useOnboardingDraft.getState();
  draft.setAboutVideoUri(null);
  draft.setTonightVideoUri(null);
  router.replace('/(onboarding)/verify');
}

export function SkipVideosButton() {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip videos for now"
      onPress={() => skipVideosForNow(router)}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Text style={styles.label}>Skip for now</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pressed: { opacity: 0.65 },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
