import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { env, personaClientConfigured } from '@/lib/env';
import { LEGAL_URLS } from '@/constants/legal';
import { startPersonaVerification } from '@/features/verification/persona';
import { finalizePersonaVerification } from '@/features/verification/persistVerification';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { colors, spacing } from '@/constants/theme';

/**
 * Persona identity verification — optional.
 * Client saves inquiry as pending; Cloud Function confirms VERIFIED via Persona API.
 */
export default function VerifyScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const draft = useOnboardingDraft();
  const userId = useSessionStore((s) => s.userId);
  const profile = useSessionStore((s) => s.profile);
  const [loading, setLoading] = useState(false);
  const [biometricConsent, setBiometricConsent] = useState(false);

  const personaReady = personaClientConfigured();
  const status = profile?.verificationStatus ?? draft.verificationStatus;
  const isVerified = status === 'verified';

  const goNext = () => {
    if (fromSettings) {
      router.replace('/settings/verification');
      return;
    }
    router.push('/(onboarding)/youre-in');
  };

  const onVerify = async () => {
    if (!biometricConsent) {
      Alert.alert(
        'Consent required',
        'Confirm you understand Persona may process your ID and biometric selfie before continuing.',
      );
      return;
    }
    try {
      setLoading(true);

      if (!personaReady) {
        Alert.alert(
          'Persona not configured',
          'Missing EXPO_PUBLIC_PERSONA_TEMPLATE_ID (itmpl_…). Restart Expo after updating .env.',
        );
        return;
      }

      const referenceId =
        userId ||
        draft.email.trim() ||
        useSessionStore.getState().email ||
        `local-${draft.displayName || 'user'}`;
      const nameFirst =
        (profile?.displayName || draft.displayName).trim().split(/\s+/)[0] || undefined;

      const result = await startPersonaVerification({
        referenceId,
        nameFirst,
        birthdate: profile?.dateOfBirth || draft.dateOfBirth || undefined,
      });

      if ('canceled' in result) {
        return;
      }

      const finalStatus = await finalizePersonaVerification({
        status: result.status,
        inquiryId: result.inquiryId || '',
        rawStatus: result.rawStatus,
      });

      if (finalStatus === 'verified') {
        Alert.alert('You’re verified', 'Your DateToday account now shows VERIFIED.', [
          { text: 'Continue', onPress: goNext },
        ]);
        return;
      }

      if (finalStatus === 'failed') {
        Alert.alert(
          'Verification didn’t pass',
          'You can try again from Settings → Verification.',
          [{ text: 'OK', onPress: goNext }],
        );
        return;
      }

      Alert.alert(
        'Submitted',
        'Persona received your check. Tap Refresh status in Settings if the badge doesn’t update in a minute.',
        [{ text: 'Continue', onPress: goNext }],
      );
    } catch (error) {
      Alert.alert(
        'Couldn’t start verification',
        error instanceof Error ? error.message : 'Try again in a moment.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.verify}
      title="Verify you’re real."
      subtitle="Optional — but every profile shows VERIFIED or NOT VERIFIED."
      showSkipSetup={false}
      footer={
        <View style={styles.footer}>
          <PrimaryCta
            label={isVerified ? 'Continue' : 'Verify with Persona'}
            showArrow={!isVerified}
            loading={loading}
            onPress={isVerified ? goNext : onVerify}
          />
          {!isVerified ? (
            <Button
              label="Continue without verifying"
              variant="ghost"
              onPress={goNext}
            />
          ) : null}
          {__DEV__ && !isVerified ? (
            <Button
              label="Mark pending (dev — not verified)"
              variant="ghost"
              onPress={() => {
                draft.setVerification({
                  status: 'pending',
                  inquiryId: `sandbox-pending-${Date.now()}`,
                });
                Alert.alert('Dev pending', 'Client cannot grant VERIFIED. Use Refresh after Persona.');
              }}
            />
          ) : null}
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.previewRow}>
          <AppText style={styles.previewLabel}>How you’ll look</AppText>
          <VerificationTag status={status} />
        </View>

        <View style={styles.card}>
          <AppText style={styles.cardTitle}>Why we verify</AppText>
          <AppText style={styles.line}>· Confirm you meet DateToday’s 18+ requirement</AppText>
          <AppText style={styles.line}>· Reduce fake accounts and impersonation</AppText>
          <AppText style={styles.line}>· Improve trust before meeting in person</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.cardTitle}>What Persona may process</AppText>
          <AppText style={styles.line}>· Government ID images</AppText>
          <AppText style={styles.line}>· Selfie / video and facial match signals</AppText>
          <AppText style={styles.line}>· Date of birth and verification outcome</AppText>
          <AppText style={styles.line}>
            DateToday stores inquiry id + status metadata — not raw ID images in Firebase.
          </AppText>
        </View>

        <Pressable
          style={styles.consentRow}
          onPress={() => setBiometricConsent((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: biometricConsent }}
        >
          <View style={[styles.box, biometricConsent && styles.boxOn]} />
          <AppText style={styles.consentText}>
            I understand Persona may process my ID and biometric selfie for verification, and I
            agree to continue.
          </AppText>
        </Pressable>

        <Pressable onPress={() => router.push('/legal/identity')}>
          <AppText style={styles.link}>Identity Verification & Biometrics notice</AppText>
        </Pressable>
        <Pressable onPress={() => router.push('/legal/privacy')}>
          <AppText style={styles.link}>DateToday Privacy Policy</AppText>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(LEGAL_URLS.personaPrivacy)}>
          <AppText style={styles.link}>Persona Privacy Policy</AppText>
        </Pressable>

        <AppText style={styles.hint}>
          {personaReady
            ? 'Verification opens Persona. VERIFIED is saved to your account after DateToday confirms the result.'
            : 'Add EXPO_PUBLIC_PERSONA_TEMPLATE_ID to .env, then restart Expo.'}
        </AppText>
      </View>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  previewRow: {
    alignItems: 'center',
    gap: 10,
  },
  previewLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  card: {
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  line: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  consentRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 2,
  },
  boxOn: {
    backgroundColor: colors.brandBright,
    borderColor: colors.brandBright,
  },
  consentText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    color: colors.brandBright,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  footer: {
    gap: 8,
  },
});
