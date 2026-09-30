import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { friendlyError } from '@/lib/errors';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { env, personaClientConfigured } from '@/lib/env';
import { LEGAL_URLS } from '@/constants/legal';
import { startPersonaVerification } from '@/features/verification/persona';
import {
  checkPersonaAfterClose,
  finalizePersonaVerification,
} from '@/features/verification/persistVerification';
import type { VerificationStatus } from '@/types';
import { firstName, useOnboardingDraft } from '@/store/onboardingDraft';
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

  const shake = useSharedValue(0);
  const [consentNudge, setConsentNudge] = useState(false);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const onVerify = () => {
    if (biometricConsent) {
      void startVerification();
      return;
    }
    setConsentNudge(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withRepeat(withTiming(10, { duration: 90 }), 4, true),
      withTiming(0, { duration: 50 }),
    );
  };

  const toggleConsent = () => {
    void Haptics.selectionAsync();
    setConsentNudge(false);
    setBiometricConsent((v) => !v);
  };

  const startVerification = async () => {
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
        firstName(profile?.legalName || draft.legalName || profile?.displayName || draft.displayName) ||
        undefined;

      const result = await startPersonaVerification({
        referenceId,
        nameFirst,
        birthdate: profile?.dateOfBirth || draft.dateOfBirth || undefined,
      });

      let finalStatus: VerificationStatus | null;
      if ('canceled' in result) {
        // Android often closes the browser tab instead of following the redirect.
        finalStatus = result.inquiryId ? await checkPersonaAfterClose(result.inquiryId) : null;
        if (!finalStatus || finalStatus === 'unverified' || finalStatus === 'pending') return;
      } else {
        finalStatus = await finalizePersonaVerification({
          status: result.status,
          inquiryId: result.inquiryId || '',
          rawStatus: result.rawStatus,
        });
      }

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
        friendlyError(error, 'Try again in a moment.'),
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
          {!isVerified ? (
            <Animated.View style={shakeStyle}>
              <Pressable
                style={[
                  styles.consentCard,
                  biometricConsent && styles.consentCardOn,
                  consentNudge && styles.consentCardNudge,
                ]}
                onPress={toggleConsent}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: biometricConsent }}
                hitSlop={6}
              >
                <View style={[styles.box, biometricConsent && styles.boxOn]}>
                  {biometricConsent ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
                </View>
                <View style={styles.consentCopy}>
                  <AppText style={styles.consentTitle}>
                    {biometricConsent ? 'You agreed' : 'Tap to agree (required)'}
                  </AppText>
                  <AppText style={styles.consentText}>
                    Persona may process my ID and a biometric selfie to verify me.
                  </AppText>
                </View>
              </Pressable>
            </Animated.View>
          ) : null}
          {consentNudge && !biometricConsent ? (
            <AppText style={styles.nudgeText}>Check the box above to start verification.</AppText>
          ) : null}
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
            DateToday only keeps your verification result — never your ID images.
          </AppText>
        </View>

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
  consentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  consentCardOn: {
    borderColor: colors.live,
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
  },
  consentCardNudge: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  box: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: colors.live,
    borderColor: colors.live,
  },
  consentCopy: {
    flex: 1,
    gap: 2,
  },
  consentTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  consentText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  nudgeText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
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
