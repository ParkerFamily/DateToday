import React from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  LegalNote,
  LegalP,
  LegalScreen,
  LegalSection,
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsUI';
import { LEGAL_URLS, LEGAL_VERSIONS, SUPPORT } from '@/constants/legal';

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <LegalScreen
      title="Terms of Service"
      subtitle={`Version ${LEGAL_VERSIONS.terms}. By using DateToday you agree to these terms.`}
    >
      <LegalSection title="1. Eligibility">
        <LegalP>
          You must be at least 18 years old to create an account or use DateToday. We may ask you to confirm
          your age and optionally verify identity through Persona.
        </LegalP>
      </LegalSection>

      <LegalSection title="2. The service">
        <LegalP>
          DateToday is a dating product focused on going live tonight, discovering people nearby, pinging,
          matching, and planning dates. Features may change. Some premium features (DateToday+ / Tonight Boost)
          are shown in-app but payments are not fully wired yet.
        </LegalP>
      </LegalSection>

      <LegalSection title="3. Accounts">
        <LegalP>
          You are responsible for your login credentials and for activity on your account. Sign-in uses Firebase
          Authentication (email/password, Google, and/or Apple when enabled). Keep your email accurate for
          account recovery and security notices.
        </LegalP>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <LegalP>
          Follow the Community Guidelines. No harassment, impersonation, minors, scams, threats, hate speech,
          non-consensual sexual content, or illegal activity. We may remove content, limit features, or suspend
          accounts that violate these terms or create safety risk.
        </LegalP>
      </LegalSection>

      <LegalSection title="5. User content">
        <LegalP>
          You retain rights to photos, videos, and text you upload. You grant DateToday a limited license to
          host, display, and process that content so the product can work (profiles, discovery, messaging when
          enabled). Do not upload content you do not have rights to share.
        </LegalP>
      </LegalSection>

      <LegalSection title="6. Safety & meetings">
        <LegalP>
          DateToday helps people meet in real life. You are solely responsible for offline interactions. Use
          Dating Safety Tips, meet in public places, tell a friend, and trust your instincts. We do not conduct
          background checks on every user.
        </LegalP>
      </LegalSection>

      <LegalSection title="7. Verification">
        <LegalP>
          Optional identity/age verification is provided by Persona. Biometric and ID data are processed by
          Persona under their privacy policy — not intended to be stored as raw ID images in DateToday Firebase
          Storage. See Identity Verification & Biometrics.
        </LegalP>
      </LegalSection>

      <LegalSection title="8. Subscriptions & purchases">
        <LegalP>
          When App Store / Play / Stripe billing is enabled, purchases are processed by those platforms. Manage
          or cancel subscriptions in your store account settings. Deleting your DateToday account does not
          automatically cancel a store subscription.
        </LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm refund, auto-renewal, and trial language once IAP is live.
        </LegalNote>
      </LegalSection>

      <LegalSection title="9. Disclaimers">
        <LegalP>
          The service is provided “as is” to the extent allowed by law. We do not guarantee matches, dates,
          continuous availability, or that every profile is accurate or verified.
        </LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm warranty disclaimer and limitation of liability language with counsel.
        </LegalNote>
      </LegalSection>

      <LegalSection title="10. Termination">
        <LegalP>
          You may delete your account in Settings. We may suspend or terminate accounts that violate these terms,
          Community Guidelines, or applicable law. Some records (for example safety reports) may be retained as
          described in the Privacy Policy.
        </LegalP>
      </LegalSection>

      <LegalSection title="11. Governing law & disputes">
        <LegalNote>{`[LEGAL REVIEW REQUIRED] Legal entity: ${SUPPORT.legalEntity}. Governing law / venue: ${SUPPORT.governingLaw}. Arbitration agreement and class-action waiver language must be drafted by counsel before external publication — do not invent a venue or arbitrator here.`}</LegalNote>
      </LegalSection>

      <LegalSection title="12. Contact">
        <LegalP>{`Questions: ${SUPPORT.email}. Mailing address: ${SUPPORT.mailingAddress}.`}</LegalP>
      </LegalSection>

      <SettingsGroup title="Related">
        <SettingsRow label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
        <SettingsRow
          label="Community Guidelines"
          onPress={() => router.push('/legal/guidelines')}
        />
        <SettingsRow
          label="Open hosted terms URL"
          last
          onPress={() => void Linking.openURL(LEGAL_URLS.termsOfService)}
        />
      </SettingsGroup>
    </LegalScreen>
  );
}
