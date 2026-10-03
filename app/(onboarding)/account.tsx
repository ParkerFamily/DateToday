import { ONBOARD_PROGRESS, OnboardingChrome } from '@/components/onboarding/OnboardingChrome';
import { friendlyError, isEmailInUse } from '@/lib/errors';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { TextField } from '@/components/ui/TextField';
import { signUpWithEmail } from '@/features/auth/api';
import { needsEmailOtp } from '@/features/auth/emailOtp';
import { currentUserIsSocial, syncOnboardingFromFirebaseAuth } from '@/features/auth/social';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { ScaledSheet } from '@/lib/scale';

const EMAIL_VERIFY_HREF = '/(onboarding)/email-verify' as Href;
const GENDER_HREF = '/(onboarding)/gender' as Href;

export default function AccountScreen() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const userId = useSessionStore((s) => s.userId);
  const setAuth = useSessionStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const alreadySignedIn =
    Boolean(userId) ||
    draft.authProvider === 'google' ||
    draft.authProvider === 'apple' ||
    currentUserIsSocial();

  const afterAuthHref = () => (needsEmailOtp() ? EMAIL_VERIFY_HREF : GENDER_HREF);

  useEffect(() => {
    syncOnboardingFromFirebaseAuth();
  }, []);

  useEffect(() => {
    if (alreadySignedIn) {
      if (!draft.legalConsentAccepted) {
        router.replace('/(onboarding)/agreements');
        return;
      }
      router.replace(afterAuthHref());
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
      const created = await signUpWithEmail({
        email: draft.email.trim(),
        password: draft.password,
        dateOfBirth: draft.dateOfBirth,
        ageConfirmed: true,
      });
      setAuth(created.user.id, created.user.email ?? null);
      router.push(afterAuthHref());
    } catch (error) {
      if (isEmailInUse(error)) {
        Alert.alert('You already have an account', 'That email is already signed up. Log in instead.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log in', onPress: () => router.replace('/(auth)/login') },
        ]);
      } else {
        Alert.alert('Could not create account', friendlyError(error, 'Try again'));
      }
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
      showSkipSetup={false}
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

const styles = ScaledSheet.create({
  form: { gap: 14 },
});
