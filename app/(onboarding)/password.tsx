import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { signUpWithEmail } from '@/features/auth/api';
import { claimSignupEmail } from '@/features/auth/emailSignup';
import { needsEmailOtp } from '@/features/auth/emailOtp';
import { passwordStrength, type StrengthLevel } from '@/features/auth/passwordStrength';
import { friendlyError, isEmailInUse } from '@/lib/errors';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { colors } from '@/constants/theme';
import { ScaledSheet, rs } from '@/lib/scale';

const ACCOUNT_HREF = '/(onboarding)/account' as Href;
const EMAIL_VERIFY_HREF = '/(onboarding)/email-verify' as Href;
const GENDER_HREF = '/(onboarding)/gender' as Href;

const LEVEL_COLOR: Record<StrengthLevel, string> = {
  0: colors.textSecondary,
  1: colors.danger,
  2: colors.warning,
  3: '#7DD87F',
  4: colors.live,
};

/** Step 3 of email signup: create the password, then the account. */
export default function PasswordScreen() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const setAuth = useSessionStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const email = draft.email.trim();

  useEffect(() => {
    if (!email || !draft.signupToken) router.replace(ACCOUNT_HREF);
  }, [email, draft.signupToken, router]);

  const personal = useMemo(
    () => [email.split('@')[0] ?? '', ...draft.displayName.split(/\s+/), ...draft.legalName.split(/\s+/)].filter(Boolean),
    [email, draft.displayName, draft.legalName],
  );
  const strength = passwordStrength(draft.password, personal);
  const started = draft.password.length > 0;

  const create = async () => {
    Keyboard.dismiss();
    if (!strength.acceptable) return;
    try {
      setLoading(true);
      draft.setAuthProvider('email');
      const created = await signUpWithEmail({
        email,
        password: draft.password,
        dateOfBirth: draft.dateOfBirth,
        ageConfirmed: true,
      });
      setAuth(created.user.id, created.user.email ?? null);
      const verified = await claimSignupEmail(draft.signupToken ?? '');
      if (verified) draft.setEmailVerified(true);
      draft.setSignupToken(null);
      router.replace(verified || !needsEmailOtp() ? GENDER_HREF : EMAIL_VERIFY_HREF);
    } catch (error) {
      if (isEmailInUse(error)) {
        Alert.alert('You already have an account', 'That email is already on DateToday. Log in instead.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log in', onPress: () => router.replace({ pathname: '/(auth)/login', params: { email } }) },
        ]);
      } else {
        Alert.alert('Couldn’t create account', friendlyError(error, 'Try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.password}
      title="Create a password."
      subtitle={`You’ll log in with ${email} and this password.`}
      showSkipSetup={false}
      footer={
        <PrimaryCta
          label="Create account"
          showArrow={false}
          loading={loading}
          disabled={!strength.acceptable}
          onPress={() => void create()}
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label="Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          passwordRules="minlength: 8; required: lower; required: upper; required: digit; allowed: special;"
          value={draft.password}
          onChangeText={draft.setPassword}
          onSubmitEditing={() => (strength.acceptable ? void create() : undefined)}
          autoFocus
        />

        <View style={styles.meterRow} accessibilityLabel={`Password strength: ${strength.label}`}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.meterSeg, started && strength.score >= i && { backgroundColor: LEVEL_COLOR[strength.score] }]}
            />
          ))}
        </View>
        <AppText style={[styles.level, { color: started ? LEVEL_COLOR[strength.score] : colors.textSecondary }]}>
          {started ? `Strength: ${strength.label}` : 'Use 8+ characters. Longer is stronger.'}
        </AppText>

        <View style={styles.checks}>
          {strength.checks.map((c) => (
            <View key={c.id} style={styles.check}>
              <Ionicons
                name={c.met ? 'checkmark-circle' : 'ellipse-outline'}
                size={rs(18)}
                color={c.met ? colors.live : colors.textSecondary}
              />
              <AppText style={[styles.checkText, c.met && styles.checkMet]}>
                {c.label}
                {c.id === 'length' ? '' : ' (recommended)'}
              </AppText>
            </View>
          ))}
        </View>

        {started && strength.hint ? <AppText style={styles.hint}>{strength.hint}</AppText> : null}
      </View>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
  form: { gap: 12 },
  meterRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  meterSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  level: { fontSize: 13, fontWeight: '700' },
  checks: { gap: 8, marginTop: 4 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { color: colors.textSecondary, fontSize: 14 },
  checkMet: { color: colors.text },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
});
