import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { SkipVideosButton } from '@/components/onboarding/SkipVideosButton';
import { ABOUT_YOU_PROMPTS } from '@/constants/videoPrompts';
import { colors, radii, spacing } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';

/**
 * Show us your vibe — pick 1 curated ABOUT YOU prompt.
 * Users never type their own.
 */
export default function VideoPickScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const aboutPromptId = useOnboardingDraft((s) => s.aboutPromptId);
  const setAboutPromptId = useOnboardingDraft((s) => s.setAboutPromptId);
  const [selected, setSelected] = useState<string | null>(aboutPromptId);

  const continueNext = () => {
    if (!selected) return;
    setAboutPromptId(selected);
    const q = fromSettings ? '&from=settings' : '';
    router.push(`/(onboarding)/video-record?slot=about${q}`);
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS['video-pick']}
      title="Show us your vibe."
      subtitle="Pick 1 · Recorded live · No uploads"
      footer={
        <>
          <PrimaryCta
            label="Continue"
            showArrow={false}
            disabled={!selected}
            onPress={continueNext}
          />
          <SkipVideosButton />
        </>
      }
    >
      <View style={styles.sectionHead}>
        <Ionicons name="videocam" size={14} color={colors.brandBright} />
        <AppText style={styles.sectionLabel}>ABOUT YOU</AppText>
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {ABOUT_YOU_PROMPTS.map((p) => {
          const on = selected === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setSelected(p.id)}
              style={[styles.row, on && styles.rowOn]}
            >
              <AppText style={[styles.rowText, on && styles.rowTextOn]}>“{p.text}”</AppText>
              {on ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.brandBright} />
              ) : (
                <View style={styles.radio} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.brandBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 10,
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radii.card,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124,58,237,0.18)',
  },
  rowText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  rowTextOn: {
    color: colors.text,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
});
