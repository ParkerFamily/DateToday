import React, { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { PromptRecorder } from '@/components/video/PromptRecorder';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { DevSkipVideosButton } from '@/components/onboarding/DevSkipVideosButton';
import { getPromptById, TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';
import { persistPromptVideosToAccount } from '@/features/profile/persistMedia';
import { useOnboardingDraft } from '@/store/onboardingDraft';

/**
 * FaceTime-style in-app recording for required profile prompts.
 * slot=about → chosen About You prompt
 * slot=tonight → mandatory signature "What's the move?"
 */
export default function VideoRecordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slot?: string; from?: string }>();
  const slot = params.slot === 'tonight' ? 'tonight' : 'about';
  const fromSettings = params.from === 'settings';
  const fromQ = fromSettings ? '&from=settings' : '';

  const aboutPromptId = useOnboardingDraft((s) => s.aboutPromptId);
  const aboutVideoUri = useOnboardingDraft((s) => s.aboutVideoUri);
  const tonightVideoUri = useOnboardingDraft((s) => s.tonightVideoUri);
  const setAboutVideoUri = useOnboardingDraft((s) => s.setAboutVideoUri);
  const setTonightVideoUri = useOnboardingDraft((s) => s.setTonightVideoUri);

  const aboutPrompt = aboutPromptId ? getPromptById(aboutPromptId) : undefined;
  const needsPick = slot === 'about' && !aboutPrompt;

  const prompt = slot === 'tonight' ? TONIGHT_SIGNATURE_PROMPT : aboutPrompt;
  const existingUri = slot === 'tonight' ? tonightVideoUri : aboutVideoUri;
  const progress =
    slot === 'tonight' ? ONBOARD_PROGRESS['video-tonight'] : ONBOARD_PROGRESS['video-about'];
  const title = slot === 'tonight' ? 'One more — the signature.' : 'Record your answer.';
  const eyebrow = slot === 'tonight' ? 'TONIGHT · EVERYONE ANSWERS' : 'ABOUT YOU';

  const subtitle = useMemo(
    () =>
      slot === 'tonight'
        ? `${TONIGHT_SIGNATURE_PROMPT.text} · 8–20 sec`
        : 'Live in DateToday · Keep it / Try again',
    [slot],
  );

  const onKeep = (uri: string) => {
    if (slot === 'about') {
      setAboutVideoUri(uri);
      router.push(`/(onboarding)/video-record?slot=tonight${fromQ}`);
      return;
    }
    setTonightVideoUri(uri);
    if (fromSettings) {
      void (async () => {
        try {
          await persistPromptVideosToAccount();
        } catch {
          Alert.alert('Saved locally', 'Videos are on device — cloud upload can retry later.');
        }
        router.replace('/settings/media');
      })();
      return;
    }
    router.push('/(onboarding)/verify');
  };

  if (needsPick || !prompt) {
    return (
      <Redirect
        href={fromSettings ? '/(onboarding)/video-pick?from=settings' : '/(onboarding)/video-pick'}
      />
    );
  }

  return (
    <OnboardingChrome
      progress={progress}
      title={title}
      subtitle={subtitle}
      footer={<DevSkipVideosButton />}
    >
      <View style={styles.wrap}>
        <PromptRecorder
          promptText={prompt.text}
          eyebrow={eyebrow}
          existingUri={existingUri}
          onKeep={onKeep}
          onClear={() => {
            if (slot === 'tonight') setTonightVideoUri(null);
            else setAboutVideoUri(null);
          }}
        />
      </View>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
});
