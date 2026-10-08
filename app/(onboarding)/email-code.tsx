import React, { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { confirmEmailSignup, startEmailSignup } from '@/features/auth/emailSignup';
import { friendlyError } from '@/lib/errors';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { colors, spacing } from '@/constants/theme';
import { ScaledSheet } from '@/lib/scale';

const ACCOUNT_HREF = '/(onboarding)/account' as Href;
const PASSWORD_HREF = '/(onboarding)/password' as Href;
const RESEND_SECONDS = 30;

/** Step 2 of email signup: confirm the address with the code we just sent. */
export default function EmailCodeScreen() {
  const router = useRouter();
  const email = useOnboardingDraft((s) => s.email.trim());
  const setSignupToken = useOnboardingDraft((s) => s.setSignupToken);
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const submitted = useRef('');

  useEffect(() => {
    if (!email) router.replace(ACCOUNT_HREF);
  }, [email, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (value = code) => {
    const digits = value.replace(/\s/g, '');
    if (digits.length !== 6 || confirming) return;
    submitted.current = digits;
    Keyboard.dismiss();
    try {
      setConfirming(true);
      const token = await confirmEmailSignup(email, digits);
      setSignupToken(token);
      router.replace(PASSWORD_HREF);
    } catch (error) {
      Alert.alert('Couldn’t confirm', friendlyError(error, 'Check the code and try again.'));
    } finally {
      setConfirming(false);
    }
  };

  const onChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && digits !== submitted.current) void verify(digits);
  };

  const resend = async () => {
    try {
      setSending(true);
      const result = await startEmailSignup(email);
      if (result.exists) {
        router.replace({ pathname: '/(auth)/login', params: { email: result.email || email } });
        return;
      }
      setCooldown(RESEND_SECONDS);
      setCode('');
      submitted.current = '';
      Alert.alert('New code sent', `Check ${email}. It can take a minute — look in spam too.`);
    } catch (error) {
      Alert.alert('Couldn’t send code', friendlyError(error, 'Try again in a moment.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS['email-code']}
      title="Check your email."
      subtitle={`Enter the 6-digit code we sent to ${email}.`}
      showSkipSetup={false}
      footer={
        <PrimaryCta
          label="Confirm email"
          showArrow={false}
          loading={confirming}
          disabled={code.length < 6}
          onPress={() => void verify()}
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label="6-digit code"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChangeText={onChange}
          editable={!confirming}
          autoFocus
        />
        <View style={styles.links}>
          <Pressable onPress={() => void resend()} disabled={sending || cooldown > 0} hitSlop={8}>
            <AppText style={[styles.link, (sending || cooldown > 0) && styles.linkDisabled]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : sending ? 'Sending…' : 'Resend code'}
            </AppText>
          </Pressable>
          <Pressable onPress={() => router.replace(ACCOUNT_HREF)} hitSlop={8}>
            <AppText style={styles.linkMuted}>Change email</AppText>
          </Pressable>
        </View>
        <AppText style={styles.note}>Codes expire in 10 minutes. Check spam if you don’t see it.</AppText>
      </View>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
  form: { gap: 14 },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.brandBright, fontWeight: '700', fontSize: 14 },
  linkDisabled: { color: colors.textSecondary },
  linkMuted: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
});
