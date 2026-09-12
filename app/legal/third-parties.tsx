import React from 'react';
import * as WebBrowser from 'expo-web-browser';
import {
  LegalP,
  LegalScreen,
  LegalSection,
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsUI';
import { LEGAL_VERSIONS } from '@/constants/legal';
import { THIRD_PARTY_SERVICES } from '@/constants/privacyInventory';

export default function ThirdPartiesScreen() {
  return (
    <LegalScreen
      title="Third-party services"
      subtitle={`Aligned with Privacy Policy ${LEGAL_VERSIONS.privacy}. Processors DateToday relies on today.`}
    >
      <LegalSection title="Overview">
        <LegalP>
          Firebase is the primary backend. Persona handles optional verification. Analytics in the current build
          are console-only. Plus/boost payments and Stripe checkout are not fully wired.
        </LegalP>
      </LegalSection>

      {THIRD_PARTY_SERVICES.map((service) => (
        <LegalSection key={service.name} title={service.name}>
          <LegalP>Purpose: {service.purpose}</LegalP>
          <LegalP>Data: {service.data}</LegalP>
        </LegalSection>
      ))}

      <SettingsGroup title="Privacy policies">
        {THIRD_PARTY_SERVICES.map((service, index) => (
          <SettingsRow
            key={service.name}
            label={`${service.name} privacy`}
            last={index === THIRD_PARTY_SERVICES.length - 1}
            onPress={() => void WebBrowser.openBrowserAsync(service.policy)}
          />
        ))}
      </SettingsGroup>
    </LegalScreen>
  );
}
