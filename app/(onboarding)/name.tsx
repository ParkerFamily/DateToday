import React, { useEffect, useRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { colors } from '@/constants/theme';
import { firstName, useOnboardingDraft } from '@/store/onboardingDraft';
import { syncOnboardingFromFirebaseAuth } from '@/features/auth/social';
import { ScaledSheet } from '@/lib/scale';

export default function NameScreen() {
  const router = useRouter();
  const legalName = useOnboardingDraft((s) => s.legalName);
  const displayName = useOnboardingDraft((s) => s.displayName);
  const setLegalName = useOnboardingDraft((s) => s.setLegalName);
  const setDisplayName = useOnboardingDraft((s) => s.setDisplayName);
  const authProvider = useOnboardingDraft((s) => s.authProvider);
  const legalRef = useRef<TextInput>(null);
  const displayRef = useRef<TextInput>(null);
  /** Display name follows the first name until the user edits it themselves. */
  const displayTouched = useRef(false);
  const ready = legalName.trim().length >= 2 && displayName.trim().length >= 2;
  const fromSocial = authProvider === 'google' || authProvider === 'apple';

  useEffect(() => {
    // Prefill once if empty — never re-run over user edits.
    const draft = useOnboardingDraft.getState();
    if (!draft.legalName.trim()) syncOnboardingFromFirebaseAuth();
    const after = useOnboardingDraft.getState();
    if (after.displayName.trim() && after.displayName.trim() !== firstName(after.legalName)) {
      displayTouched.current = true;
    }
  }, []);

  useEffect(() => {
    if (useOnboardingDraft.getState().legalName.trim().length >= 2) return;
    const t = setTimeout(() => legalRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const onLegalChange = (text: string) => {
    setLegalName(text);
    if (!displayTouched.current) setDisplayName(firstName(text));
  };

  const onDisplayChange = (text: string) => {
    displayTouched.current = true;
    setDisplayName(text);
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.name}
      title="What's your name?"
      subtitle="Your legal name stays private and is only used to verify your ID."
      onBack="landing"
      footer={
        <PrimaryCta
          label="Continue"
          showArrow={false}
          disabled={!ready}
          onPress={() => {
            setLegalName(legalName.trim());
            setDisplayName(displayName.trim());
            router.push('/(onboarding)/birthday');
          }}
        />
      }
    >
      <Text style={styles.label}>Legal name</Text>
      <TextInput
        ref={legalRef}
        value={legalName}
        onChangeText={onLegalChange}
        placeholder="Full name on your ID"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => displayRef.current?.focus()}
        maxLength={80}
        style={styles.input}
      />
      <Text style={styles.note}>
        {fromSocial
          ? 'We filled this from your account — make sure it matches your ID exactly. You can’t change it later.'
          : 'Must match your government ID exactly. You can’t change it later.'}
      </Text>

      <Text style={[styles.label, styles.labelSpaced]}>Display name</Text>
      <TextInput
        ref={displayRef}
        value={displayName}
        onChangeText={onDisplayChange}
        placeholder="What people see"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="nickname"
        returnKeyType="done"
        maxLength={40}
        style={styles.input}
      />
      <Text style={styles.note}>This is what matches see. You can change it anytime.</Text>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
  label: {
    marginTop: 24,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  labelSpaced: {
    marginTop: 32,
  },
  input: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  note: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
