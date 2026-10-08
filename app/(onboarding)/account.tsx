import { ONBOARD_PROGRESS, OnboardingChrome } from '@/components/onboarding/OnboardingChrome';
import { friendlyError } from '@/lib/errors';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/AppText';
import { needsEmailOtp } from '@/features/auth/emailOtp';
import { startEmailSignup } from '@/features/auth/emailSignup';
import { PROVIDER_LABEL, type SignInMethod } from '@/features/auth/linking';
import { currentUserIsSocial, syncOnboardingFromFirebaseAuth } from '@/features/auth/social';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { colors } from '@/constants/theme';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Keyboard, View } from 'react-native';
import { ScaledSheet } from '@/lib/scale';

const EMAIL_VERIFY_HREF = '/(onboarding)/email-verify' as Href;
const EMAIL_CODE_HREF = '/(onboarding)/email-code' as Href;
const PASSWORD_HREF = '/(onboarding)/password' as Href;
const GENDER_HREF = '/(onboarding)/gender' as Href;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function existingAccountMessage(methods: SignInMethod[], typed: string, accountEmail: string) {
  const lead =
    accountEmail.toLowerCase() === typed.toLowerCase()
      ? 'That email is already on DateToday.'
      : `That inbox already has an account as ${accountEmail}.`;
  const social = methods
    .filter((m) => m !== 'password')
    .map((m) => PROVIDER_LABEL[m === 'apple.com' ? 'apple' : 'google']);
  if (!methods.includes('password') && social.length) {
    return `${lead} It signs in with ${social.join(' or ')} — log in with ${social[0]} to pick up where you left off.`;
  }
  return `${lead} Log in with your password instead, or reset it if you forgot.`;
}

/** Step 1 of email signup: just the email. The code and password come next. */
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

  useEffect(() => {
    if (alreadySignedIn) {
      if (!draft.legalConsentAccepted) {
        router.replace('/(onboarding)/agreements');
        return;
      }
      router.replace(needsEmailOtp() ? EMAIL_VERIFY_HREF : GENDER_HREF);
    }
  }, [alreadySignedIn, draft.legalConsentAccepted, router]);

  const email = draft.email.trim();
  const valid = EMAIL_RE.test(email);

  const next = async () => {
    Keyboard.dismiss();
    if (!draft.legalConsentAccepted) {
      Alert.alert('Agreements required', 'Please accept Terms & Privacy first.', [
        { text: 'Review', onPress: () => router.replace('/(onboarding)/agreements') },
      ]);
      return;
    }
    if (draft.signupToken) {
      router.push(PASSWORD_HREF);
      return;
    }
    try {
      setLoading(true);
      draft.setAuthProvider('email');
      const result = await startEmailSignup(email);
      if (result.exists) {
        const accountEmail = result.email || email;
        Alert.alert('You already have an account', existingAccountMessage(result.methods, email, accountEmail), [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log in',
            onPress: () => router.replace({ pathname: '/(auth)/login', params: { email: accountEmail } }),
          },
        ]);
        return;
      }
      router.push(EMAIL_CODE_HREF);
    } catch (error) {
      Alert.alert('Couldn’t send code', friendlyError(error, 'Try again in a moment.'));
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
      title={`What’s your email${draft.displayName ? `, ${draft.displayName}` : ''}?`}
      subtitle="We’ll send a code to confirm it’s you. You’ll use it to log in."
      onBack="landing"
      showSkipSetup={false}
      footer={
        <PrimaryCta
          label="Continue"
          showArrow={false}
          loading={loading}
          disabled={!valid}
          onPress={() => void next()}
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label="Email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
          value={draft.email}
          onChangeText={draft.setEmail}
          onSubmitEditing={() => (valid ? void next() : undefined)}
        />
        <AppText style={styles.note}>We never show your email on your profile.</AppText>
      </View>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
  form: { gap: 10 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
});
