import React, { useEffect, useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TextField } from '@/components/ui/TextField';
import { friendlyError } from '@/lib/errors';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import {
  confirmEmailOtp,
  needsEmailOtp,
  sendEmailOtp,
} from '@/features/auth/emailOtp';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { colors, spacing } from '@/constants/theme';
import { ScaledSheet, rs } from '@/lib/scale';

const GENDER_HREF = '/(onboarding)/gender' as Href;

/**
 * Email OTP via Resend (Cloud Function) — replaces phone SMS verify.
 * Google/Apple accounts skip this (provider already verified the email).
 */
export default function EmailVerifyScreen() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const email =
    getFirebaseAuth().currentUser?.email || draft.email.trim() || '';
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState(draft.emailVerified);

  useEffect(() => {
    if (!needsEmailOtp() || draft.emailVerified) {
      router.replace(GENDER_HREF);
    }
  }, [draft.emailVerified, router]);

  const goNext = () => router.push(GENDER_HREF);

  const sendCode = async () => {
    Keyboard.dismiss();
    try {
      setSending(true);
      await sendEmailOtp();
      setSent(true);
      Alert.alert('Check your email', `We sent a 6-digit code to ${email}.`);
    } catch (error) {
      Alert.alert(
        'Couldn’t send code',
        friendlyError(error, 'Try again in a moment.'),
      );
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    Keyboard.dismiss();
    try {
      setConfirming(true);
      await confirmEmailOtp(code);
      setVerified(true);
      Alert.alert('Email verified ✓', 'You’re good to keep building your profile.', [
        { text: 'Continue', onPress: goNext },
      ]);
    } catch (error) {
      Alert.alert(
        'Couldn’t verify',
        friendlyError(error, 'Check the code and try again.'),
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS['email-verify']}
      title="Verify your email."
      subtitle={`We’ll email a one-time code to ${email || 'you'}. This isn’t how you sign in — it keeps DateToday real.`}
      showSkipSetup={false}
      footer={
        verified ? (
          <PrimaryCta label="Continue" showArrow onPress={goNext} />
        ) : sent ? (
          <Pressable onPress={() => void sendCode()} disabled={sending}>
            <AppText style={styles.resend}>Resend code</AppText>
          </Pressable>
        ) : null
      }
    >
      <View style={styles.form}>
        {verified ? (
          <View style={styles.verifiedBanner}>
            <Ionicons name="checkmark-circle" size={rs(22)} color={colors.live} />
            <AppText style={styles.verifiedText}>Email verified ✓</AppText>
          </View>
        ) : null}

        {!verified && !sent ? (
          <View style={styles.inlineCta}>
            <PrimaryCta
              label="Email me a code"
              showArrow={false}
              loading={sending}
              disabled={!email}
              onPress={() => void sendCode()}
            />
          </View>
        ) : null}

        {sent && !verified ? (
          <>
            <TextField
              label="6-digit code"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChangeText={setCode}
              editable={!confirming}
            />
            <View style={styles.inlineCta}>
              <PrimaryCta
                label="Verify code"
                showArrow={false}
                loading={confirming}
                disabled={code.replace(/\s/g, '').length < 6}
                onPress={() => void verify()}
              />
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <AppText style={styles.dismissKb}>Hide keyboard</AppText>
              </Pressable>
            </View>
          </>
        ) : null}

        <AppText style={styles.note}>
          Codes expire in 10 minutes. Check spam if you don’t see it.
        </AppText>
      </View>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
  form: { gap: 14 },
  inlineCta: { gap: 10, marginTop: 4 },
  note: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  dismissKb: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 4,
  },
  resend: {
    color: colors.brandBright,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 8,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(34,229,139,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,229,139,0.35)',
  },
  verifiedText: {
    flex: 1,
    color: colors.live,
    fontWeight: '700',
    fontSize: 14,
  },
});
