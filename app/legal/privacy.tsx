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
import { DATA_INVENTORY, THIRD_PARTY_SERVICES } from '@/constants/privacyInventory';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <LegalScreen
      title="Privacy Policy"
      subtitle={`Version ${LEGAL_VERSIONS.privacy}. This describes what DateToday collects today — Firebase is the primary backend.`}
    >
      <LegalSection title="Who we are">
        <LegalP>{`DateToday helps people go live, discover nearby matches for tonight, and plan real dates. Contact: ${SUPPORT.email}.`}</LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm legal entity name and mailing address before publishing externally.
        </LegalNote>
      </LegalSection>

      <LegalSection title="What we collect">
        <LegalP>
          Categories below reflect the current product. Location coordinates are not written to Firestore today.
          Analytics events are console-only in development — no third-party analytics SDK is shipped. DateToday+
          and Tonight Boost purchases are processed by Apple / Google via RevenueCat.
        </LegalP>
      </LegalSection>

      {DATA_INVENTORY.map((category) => (
        <LegalSection key={category.id} title={category.title}>
          {category.items.map((item) => (
            <LegalP key={item.name}>
              {`${item.name} (${item.necessity}): ${item.what} Why: ${item.why} Stored: ${item.whereStored} Shared: ${item.sharedWith} Retention: ${item.retention} Deletion: ${item.deletion}`}
            </LegalP>
          ))}
        </LegalSection>
      ))}

      <LegalSection title="How to delete your data">
        <LegalP>
          In the app: Settings → Account & security → Delete account. That removes your Firebase Auth user,
          Firestore profile/user docs, Storage media under your user folder, and your blocks when deletion
          succeeds. Reports you filed may be retained for safety.
        </LegalP>
        <LegalP>{`You can also email ${SUPPORT.email} or visit ${LEGAL_URLS.accountDeletion} once hosted. Deleting the app does not delete your account. Store subscriptions are not canceled automatically — manage them in Apple or Google subscription settings.`}</LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm retention periods for safety reports, deleted_users audit rows, and
          payment records before publishing.
        </LegalNote>
      </LegalSection>

      <LegalSection title="Third parties (summary)">
        <LegalP>
          We use Firebase / Google Cloud for auth, database, and storage; Apple and Google for sign-in (and
          billing when enabled); Persona for optional ID/selfie verification; Expo for runtime and push when
          configured; Stripe is planned/stubbed only.
        </LegalP>
      </LegalSection>

      <SettingsGroup title="Related">
        <SettingsRow
          label="Third-party services"
          onPress={() => router.push('/legal/third-parties')}
        />
        <SettingsRow
          label="Identity verification notice"
          onPress={() => router.push('/legal/identity')}
        />
        <SettingsRow
          label="Delete account"
          danger
          onPress={() => router.push('/settings/delete-account')}
        />
        <SettingsRow
          label="Open hosted privacy URL"
          last
          onPress={() => void Linking.openURL(LEGAL_URLS.privacyPolicy)}
        />
      </SettingsGroup>

      <LegalNote>{`Full processor list: ${THIRD_PARTY_SERVICES.map((s) => s.name).join(', ')}.`}</LegalNote>
    </LegalScreen>
  );
}
