import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TextField } from '@/components/ui/TextField';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { signUpWithEmail } from '@/features/auth/api';
import { currentUserIsSocial, syncOnboardingFromFirebaseAuth } from '@/features/auth/social';

export default function AccountScreen() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const userId = useSessionStore((s) => s.userId);
  const [loading, setLoading] = useState(false);
  const alreadySignedIn =
    Boolean(userId) ||
    draft.authProvider === 'google' ||
    draft.authProvider === 'apple' ||
    currentUserIsSocial();

  useEffect(() => {
    syncOnboardingFromFirebaseAuth();
  }, []);

  // Google/Apple (or any existing session) never needs email/password.
  useEffect(() => {
    if (alreadySignedIn) {
      if (!draft.legalConsentAccepted) {
        router.replace('/(onboarding)/agreements');
        return;
      }
      router.replace('/(onboarding)/gender');
    }
  }, [alreadySignedIn, draft.legalConsentAccepted, router]);

  const ready = draft.email.includes('@') && draft.password.length >= 8;

  const next = async () => {
    if (!draft.legalConsentAccepted) {
      Alert.alert('Agreements required', 'Please accept Terms & Privacy first.', [
        { text: 'Review', onPress: () => router.replace('/(onboarding)/agreements') },
      ]);
      return;
    }
    try {
      setLoading(true);
      draft.setAuthProvider('email');
      await signUpWithEmail({
        email: draft.email.trim(),
        password: draft.password,
        dateOfBirth: draft.dateOfBirth,
        ageConfirmed: true,
      });
      router.push('/(onboarding)/gender');
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Try again');
    } finally {
      setLoading(false);
    }
  };

  if (alreadySignedIn) {
    return null;
  }

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.account}
      title={`Hey ${draft.displayName || 'there'}.`}
      subtitle="Save your profile so you can come back."
      onBack="landing"
      footer={
        <PrimaryCta
          label="Continue"
          showArrow={false}
          loading={loading}
          disabled={!ready}
          onPress={next}
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={draft.email}
          onChangeText={draft.setEmail}
        />
        <TextField
          label="Password"
          secureTextEntry
          value={draft.password}
          onChangeText={draft.setPassword}
        />
      </View>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
});
