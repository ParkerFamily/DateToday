import React from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import {
  LegalNote,
  LegalP,
  LegalScreen,
  LegalSection,
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsUI';
import { LEGAL_URLS, LEGAL_VERSIONS } from '@/constants/legal';

export default function IdentityVerificationScreen() {
  const router = useRouter();

  const openPersonaPrivacy = () => {
    void WebBrowser.openBrowserAsync(LEGAL_URLS.personaPrivacy);
  };

  return (
    <LegalScreen
      title="Identity Verification & Biometrics"
      subtitle={`Version ${LEGAL_VERSIONS.identityVerificationNotice}. Optional verification via Persona.`}
    >
      <LegalSection title="What this is">
        <LegalP>
          DateToday offers optional identity and age verification so others can see a trusted VERIFIED status.
          Verification is powered by Persona, not by DateToday storing your government ID images in Firebase
          Storage.
        </LegalP>
      </LegalSection>

      <LegalSection title="What Persona processes">
        <LegalP>
          Depending on the flow, Persona may process government ID images, a selfie or short video, date of birth,
          and biometric comparison signals to confirm you match your ID and are 18+.
        </LegalP>
      </LegalSection>

      <LegalSection title="What DateToday stores">
        <LegalP>
          We store verification status, inquiry identifiers, and related timestamps on your private Firestore user
          document. Public profiles may show a verified badge after trusted confirmation — not your raw ID scan.
        </LegalP>
      </LegalSection>

      <LegalSection title="Biometrics">
        <LegalP>
          Biometric comparison happens in Persona’s systems for verification. DateToday does not implement its own
          face-matching database. Device biometrics you use to unlock your phone are controlled by your OS, not by
          this notice.
        </LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm biometric disclosure language for App Store / regional consent
          requirements.
        </LegalNote>
      </LegalSection>

      <LegalSection title="Retention & deletion">
        <LegalP>
          Inquiry references are removed with account deletion on DateToday’s side. Persona may retain data under
          their own policy and dashboard settings — use the shortest practical retention in Persona.
        </LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED — align retention with Persona settings and counsel].
        </LegalNote>
      </LegalSection>

      <SettingsGroup title="Policies">
        <SettingsRow label="DateToday Privacy Policy" onPress={() => router.push('/legal/privacy')} />
        <SettingsRow label="Persona Privacy Policy" last onPress={openPersonaPrivacy} />
      </SettingsGroup>
    </LegalScreen>
  );
}
