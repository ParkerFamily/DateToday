import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { colors, spacing } from '@/constants/theme';
import { LEGAL_VERSIONS } from '@/constants/legal';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { recordLegalConsent } from '@/features/consent/recordConsent';
import { currentUserIsSocial } from '@/features/auth/social';
import { isBackendConfigured } from '@/lib/env';

/**
 * Affirmative legal consent — required before account creation / continuing setup.
 * Checkboxes start unchecked (App Store / Play expectation).
 */
export default function AgreementsScreen() {
  const router = useRouter();
  const acceptLegalConsent = useOnboardingDraft((s) => s.acceptLegalConsent);
  const alreadyAccepted = useOnboardingDraft((s) => s.legalConsentAccepted);
  const authProvider = useOnboardingDraft((s) => s.authProvider);
  const userId = useSessionStore((s) => s.userId);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [guidelines, setGuidelines] = useState(false);
  const [age18, setAge18] = useState(false);
  const [saving, setSaving] = useState(false);

  const allChecked = terms && privacy && guidelines && age18;

  const skipAccount =
    Boolean(userId) ||
    authProvider === 'google' ||
    authProvider === 'apple' ||
    currentUserIsSocial();

  useEffect(() => {
    if (alreadyAccepted) {
      router.replace(skipAccount ? '/(onboarding)/gender' : '/(onboarding)/account');
    }
  }, [alreadyAccepted, router, skipAccount]);

  const onContinue = async () => {
    if (!allChecked) {
      Alert.alert(
        'Agreements required',
        'Please confirm Terms, Privacy, Community Guidelines, and that you are 18+.',
      );
      return;
    }
    try {
      setSaving(true);
      acceptLegalConsent();
      if (isBackendConfigured() && (userId || currentUserIsSocial())) {
        await recordLegalConsent('onboarding_agreements');
      }
      router.push(skipAccount ? '/(onboarding)/gender' : '/(onboarding)/account');
    } catch (error) {
      Alert.alert(
        'Could not save agreements',
        error instanceof Error ? error.message : 'Try again',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.agreements}
      title="Agreements"
      subtitle="Please review and confirm before continuing. Nothing is pre-checked."
      showSkipSetup={false}
      footer={
        <PrimaryCta
          label="I agree — Continue"
          showArrow={false}
          loading={saving}
          disabled={!allChecked}
          onPress={() => {
            void onContinue();
          }}
        />
      }
    >
      <View style={styles.list}>
        <ConsentCheck
          checked={age18}
          onToggle={() => setAge18((v) => !v)}
          label="I confirm I am at least 18 years old."
        />
        <ConsentCheck
          checked={terms}
          onToggle={() => setTerms((v) => !v)}
          label="I agree to the Terms of Service."
          linkLabel="Read Terms"
          onLink={() => router.push('/legal/terms')}
        />
        <ConsentCheck
          checked={privacy}
          onToggle={() => setPrivacy((v) => !v)}
          label="I acknowledge the Privacy Policy."
          linkLabel="Read Privacy Policy"
          onLink={() => router.push('/legal/privacy')}
        />
        <ConsentCheck
          checked={guidelines}
          onToggle={() => setGuidelines((v) => !v)}
          label="I agree to the Community Guidelines."
          linkLabel="Read Guidelines"
          onLink={() => router.push('/legal/guidelines')}
        />
      </View>
      <AppText style={styles.versions}>
        Versions: Terms {LEGAL_VERSIONS.terms} · Privacy {LEGAL_VERSIONS.privacy} · Guidelines{' '}
        {LEGAL_VERSIONS.communityGuidelines}
      </AppText>
    </OnboardingChrome>
  );
}

function ConsentCheck({
  checked,
  onToggle,
  label,
  linkLabel,
  onLink,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  linkLabel?: string;
  onLink?: () => void;
}) {
  return (
    <View style={styles.rowWrap}>
      <Pressable
        style={styles.row}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.box, checked && styles.boxOn]} />
        <AppText style={styles.label}>{label}</AppText>
      </Pressable>
      {linkLabel && onLink ? (
        <Pressable onPress={onLink} hitSlop={8}>
          <AppText style={styles.link}>{linkLabel}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  rowWrap: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 2,
  },
  boxOn: {
    backgroundColor: colors.brandBright,
    borderColor: colors.brandBright,
  },
  label: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  link: {
    color: colors.brandBright,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginLeft: 36,
  },
  versions: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
