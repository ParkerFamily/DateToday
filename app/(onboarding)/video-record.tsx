import { ONBOARD_PROGRESS, OnboardingChrome } from '@/components/onboarding/OnboardingChrome';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { SkipVideosButton } from '@/components/onboarding/SkipVideosButton';
import { PromptRecorder } from '@/components/video/PromptRecorder';
import { getPromptById, TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';
import { persistPromptVideoSlot } from '@/features/profile/persistMedia';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

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
  const title = slot === 'tonight' ? 'Video 2 of 2 — the signature.' : 'Video 1 of 2 — your answer.';
  const eyebrow = slot === 'tonight' ? 'TONIGHT · EVERYONE ANSWERS' : 'ABOUT YOU';
  const [saving, setSaving] = useState(false);
  const keepLabel = saving
    ? 'Saving…'
    : fromSettings
      ? 'Keep it · save to profile'
      : slot === 'about'
        ? 'Keep it · next video'
        : 'Keep it · finish';

  const subtitle = useMemo(
    () =>
      slot === 'tonight'
        ? `Different question: ${TONIGHT_SIGNATURE_PROMPT.text} · 8–20 sec`
        : 'Record, then tap Keep it. One more short video after this.',
    [slot],
  );

  const saveFromSettings = async (uri: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await persistPromptVideoSlot(slot, uri);
      router.dismissTo('/settings/media');
    } catch (error) {
      Alert.alert(
        'Video didn’t save',
        `${error instanceof Error ? error.message : 'Check your connection and try again.'}\n\nYour recording is still here, so you won’t need to record it again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try again', onPress: () => void saveFromSettings(uri) },
        ],
      );
    } finally {
      setSaving(false);
    }
  };

  const onKeep = (uri: string) => {
    if (fromSettings) {
      void saveFromSettings(uri);
      return;
    }
    if (slot === 'about') {
      setAboutVideoUri(uri);
      router.push(`/(onboarding)/video-record?slot=tonight${fromQ}`);
      return;
    }
    setTonightVideoUri(uri);
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
      footer={<SkipVideosButton />}
    >
      <View style={styles.wrap}>
        {slot === 'tonight' && aboutVideoUri ? (
          <View style={styles.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.live} />
            <AppText style={styles.savedText}>About You video saved</AppText>
          </View>
        ) : null}
        <PromptRecorder
          key={slot}
          promptText={prompt.text}
          eyebrow={eyebrow}
          existingUri={existingUri}
          keepLabel={keepLabel}
          busy={saving}
          onKeep={onKeep}
          onClear={() => {
            // From Settings the saved video stays on the profile until a new one is kept.
            if (fromSettings) return;
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
    gap: 10,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  savedText: {
    color: colors.live,
    fontSize: 14,
    fontWeight: '700',
  },
});
