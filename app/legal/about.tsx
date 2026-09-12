import React from 'react';
import { StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  LegalP,
  LegalScreen,
  LegalSection,
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsUI';
import { AppText } from '@/components/ui/AppText';
import { SUPPORT } from '@/constants/legal';
import { colors, spacing } from '@/constants/theme';

export default function AboutScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <LegalScreen title="About DateToday" subtitle="Same-day dating for tonight — go live, match, meet.">
      <LegalSection title="What we build">
        <LegalP>
          DateToday is built for people who want to go out tonight: short prompt videos, live availability,
          nearby discovery, pings, and date planning — not endless endless swiping.
        </LegalP>
      </LegalSection>

      <LegalSection title="Stack (today)">
        <LegalP>
          Mobile app on Expo / React Native. Primary backend: Firebase Auth, Firestore, and Storage. Optional
          identity checks: Persona. Analytics: development console logging only. Subscriptions and boosts: UI
          present; store IAP / Stripe not fully wired.
        </LegalP>
      </LegalSection>

      <LegalSection title="Support">
        <LegalP>{`Email ${SUPPORT.email} if something breaks or you need help with your account.`}</LegalP>
      </LegalSection>

      <SettingsGroup title="Legal">
        <SettingsRow label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
        <SettingsRow label="Terms of Service" onPress={() => router.push('/legal/terms')} />
        <SettingsRow
          label="Community Guidelines"
          last
          onPress={() => router.push('/legal/guidelines')}
        />
      </SettingsGroup>

      <AppText variant="secondary" style={styles.version}>
        Version {version}
      </AppText>
    </LegalScreen>
  );
}

const styles = StyleSheet.create({
  version: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
