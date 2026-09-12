import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { colors } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { syncOnboardingFromFirebaseAuth } from '@/features/auth/social';

export default function NameScreen() {
  const router = useRouter();
  const name = useOnboardingDraft((s) => s.displayName);
  const setDisplayName = useOnboardingDraft((s) => s.setDisplayName);
  const authProvider = useOnboardingDraft((s) => s.authProvider);
  const inputRef = useRef<TextInput>(null);
  const ready = name.trim().length >= 2;
  const fromSocial = authProvider === 'google' || authProvider === 'apple';

  useEffect(() => {
    // Prefill once if empty — never re-run over user edits.
    const draft = useOnboardingDraft.getState();
    if (!draft.displayName.trim()) {
      syncOnboardingFromFirebaseAuth();
    }
  }, []);

  useEffect(() => {
    if (name.trim().length >= 2) return;
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [name]);

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.name}
      title="What's your name?"
      subtitle="This must match your government ID for verification."
      onBack="landing"
      footer={
        <PrimaryCta
          label="Continue"
          showArrow={false}
          disabled={!ready}
          onPress={() => router.push('/(onboarding)/birthday')}
        />
      }
    >
      <TextInput
        ref={inputRef}
        value={name}
        onChangeText={setDisplayName}
        placeholder="Full legal name"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="words"
        autoCorrect={false}
        style={styles.input}
      />
      <View style={styles.noteWrap}>
        <Text style={styles.note}>
          {fromSocial
            ? 'We filled this from your account — confirm it matches your ID exactly.'
            : 'Use the same name that appears on your government ID.'}
        </Text>
      </View>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: 24,
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -1,
  },
  noteWrap: {
    marginTop: 20,
    paddingHorizontal: 12,
  },
  note: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
});
