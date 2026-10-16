import React from 'react';
import { useRouter } from 'expo-router';
import {
  LegalNote,
  LegalP,
  LegalScreen,
  LegalSection,
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsUI';

export default function SafetyTipsScreen() {
  const router = useRouter();

  return (
    <LegalScreen
      title="Safety Tips"
      subtitle="Practical tips for Dating, Friend Date, and any meetup arranged through DateToday. Your safety comes first."
    >
      <LegalSection title="Same rules for every mode">
        <LegalP>
          These tips apply to dating, Friend Dates, group hangouts, and other plans. Platonic intent does not
          make pressure, harassment, or unsafe behavior okay.
        </LegalP>
      </LegalSection>

      <LegalSection title="Before you meet">
        <LegalP>
          Chat in-app first. Video prompts and optional verification help, but they are not a guarantee of
          identity, character, or safety — and they are not a background check. Tell a friend where you are going
          and when you expect to be back. Prefer public places for first meetups — cafés, busy bars, well-lit
          neighborhoods.
        </LegalP>
      </LegalSection>

      <LegalSection title="Getting there">
        <LegalP>
          Arrange your own transportation. Keep valuables limited. Share live location with a trusted contact if
          that feels right for you. Do not feel pressured to drink, leave early, or go somewhere private.
        </LegalP>
      </LegalSection>

      <LegalSection title="During the meetup">
        <LegalP>
          Stay aware of exits and your belongings. If something feels off, leave — you do not owe anyone an
          explanation. Never leave drinks unattended. Do not pressure someone to stay, continue, or change plans.
        </LegalP>
      </LegalSection>

      <LegalSection title="Location & personal details">
        <LegalP>
          DateToday uses location for nearby discovery, Live Tonight, Travel Mode, and venue suggestions. It is
          designed not to show your exact private location to other users unless you choose to share it. Be
          careful before sharing your home or work address, or other precise personal details, especially early
          on.
        </LegalP>
      </LegalSection>

      <LegalSection title="Respect a no">
        <LegalP>
          If someone passes, unmatches, blocks, cancels, or stops responding, stop contacting them. Do not
          pressure anyone to meet.
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
          DateToday is not an emergency service. If you believe you are in immediate danger or experiencing an
          emergency, contact local emergency services. In the United States, dial 911.
        </LegalP>
        <LegalNote>
          Emergency numbers differ by country. Outside the US, use your local emergency number.
        </LegalNote>
      </LegalSection>

      <SettingsGroup title="Related">
        <SettingsRow label="Community Guidelines" onPress={() => router.push('/legal/guidelines')} />
        <SettingsRow label="Report a problem" onPress={() => router.push('/safety/report')} />
        <SettingsRow label="Safety Center" last onPress={() => router.push('/safety')} />
      </SettingsGroup>
    </LegalScreen>
  );
}
