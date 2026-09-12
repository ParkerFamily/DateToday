import React from 'react';
import {
  LegalNote,
  LegalP,
  LegalScreen,
  LegalSection,
} from '@/components/settings/SettingsUI';

export default function DatingSafetyTipsScreen() {
  return (
    <LegalScreen
      title="Dating Safety Tips"
      subtitle="Meet thoughtfully. Trust your instincts. Your safety comes first."
    >
      <LegalSection title="Before you meet">
        <LegalP>
          Chat in-app first. Video prompts help, but they are not a guarantee. Tell a friend where you are going
          and when you expect to be back. Prefer public places for first dates — cafés, busy bars, well-lit
          neighborhoods.
        </LegalP>
      </LegalSection>

      <LegalSection title="Getting there">
        <LegalP>
          Arrange your own transportation. Keep valuables limited. Share live location with a trusted contact if
          that feels right for you. Do not feel pressured to drink, leave early, or go somewhere private.
        </LegalP>
      </LegalSection>

      <LegalSection title="During the date">
        <LegalP>
          Stay aware of exits and your belongings. If something feels off, leave — you do not owe anyone an
          explanation. Never leave drinks unattended.
        </LegalP>
      </LegalSection>

      <LegalSection title="After">
        <LegalP>
          Block and report anyone who harasses you, pressures you, or makes you feel unsafe. False reports hurt
          the community — use reporting honestly.
        </LegalP>
      </LegalSection>

      <LegalSection title="Emergency">
        <LegalP>
          If you are in immediate danger, call local emergency services. In the United States, dial 911.
        </LegalP>
        <LegalNote>
          Emergency numbers differ by country. Outside the US, use your local emergency number. DateToday is not
          an emergency service.
        </LegalNote>
      </LegalSection>
    </LegalScreen>
  );
}
