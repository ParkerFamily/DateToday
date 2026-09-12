import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { ABOUT_YOU_PROMPTS } from '@/constants/videoPrompts';
import { colors } from '@/constants/theme';
import { env } from '@/lib/env';
import { useOnboardingDraft } from '@/store/onboardingDraft';

const DEV_SKIP_URI = 'datetoday://dev-skip-video';

/** Marks video steps complete and jumps to verify — testing only. */
export function skipVideosForTesting(router: ReturnType<typeof useRouter>) {
  const draft = useOnboardingDraft.getState();
  if (!draft.aboutPromptId) {
    draft.setAboutPromptId(ABOUT_YOU_PROMPTS[0]?.id ?? 'about-vibing');
  }
  draft.setAboutVideoUri(DEV_SKIP_URI);
  draft.setTonightVideoUri(DEV_SKIP_URI);
  router.replace('/(onboarding)/verify');
}

export function DevSkipVideosButton() {
  const router = useRouter();
  if (!env.previewContentEnabled) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Skip videos for testing"
      onPress={() => skipVideosForTesting(router)}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Text style={styles.label}>Skip videos (dev)</Text>
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
