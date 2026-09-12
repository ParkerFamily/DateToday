import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { datingVibes } from '@/constants/copy';
import { colors, radii } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import type { DatingIntention } from '@/types';

const MAX_VIBES = 2;

export default function IntentionScreen() {
  const router = useRouter();
  const vibes = useOnboardingDraft((s) => s.vibes);
  const toggleVibe = useOnboardingDraft((s) => s.toggleVibe);

  const onToggle = useCallback(
    (value: DatingIntention) => {
      const selected = vibes.includes(value);
      if (!selected && vibes.length >= MAX_VIBES) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      void Haptics.selectionAsync();
      toggleVibe(value);
    },
    [vibes, toggleVibe],
  );

  const hint =
    vibes.length === 0
      ? 'Select 1 or 2 vibes'
      : vibes.length === 1
        ? '1 of 2 — add another if you want'
        : '2 of 2 selected';

  return (
    <OnboardingChrome
      compact
      progress={ONBOARD_PROGRESS.intention}
      title="What are you open to right now?"
      subtitle="Pick up to 2 — your vibe, not a relationship checklist."
      footer={
        <View style={styles.footerBlock}>
          <Text style={styles.hint}>{hint}</Text>
          <PrimaryCta
            label="Continue"
            showArrow={false}
            disabled={vibes.length === 0}
            onPress={() => router.push('/(onboarding)/distance')}
          />
        </View>
      }
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {datingVibes.map((opt) => {
          const on = vibes.includes(opt.value);
          const lockedOut = !on && vibes.length >= MAX_VIBES;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onToggle(opt.value)}
              style={[
                styles.opt,
                opt.subtitle ? styles.optTall : styles.optShort,
                on && styles.optOn,
                lockedOut && styles.optDim,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: lockedOut }}
            >
              <View style={styles.optCopy}>
                <AppText style={[styles.label, on && styles.labelOn]}>{opt.label}</AppText>
                {opt.subtitle ? (
                  <Text style={[styles.sub, on && styles.subOn]}>{opt.subtitle}</Text>
                ) : null}
              </View>
              <View style={[styles.check, on && styles.checkOn]}>
                {on ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  list: {
    gap: 8,
    paddingBottom: 4,
  },
  footerBlock: {
    gap: 10,
  },
  opt: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  optShort: {
    minHeight: 48,
    paddingVertical: 12,
  },
  optTall: {
    paddingVertical: 12,
  },
  optOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124,58,237,0.25)',
  },
  optDim: { opacity: 0.45 },
  optCopy: { flex: 1, gap: 3 },
  label: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  labelOn: { color: colors.text },
  sub: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    opacity: 0.88,
  },
  subOn: { color: 'rgba(255,255,255,0.72)' },
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
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '800' },
  hint: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
