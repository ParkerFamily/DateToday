import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  LegalNote,
  LegalP,
  LegalScreen,
  LegalSection,
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsUI';
import { Button } from '@/components/ui/Button';
import { LEGAL_VERSIONS } from '@/constants/legal';
import { spacing } from '@/constants/theme';
import { ScaledSheet } from '@/lib/scale';

export default function CommunityGuidelinesScreen() {
  const router = useRouter();

  return (
    <LegalScreen
      title="Community Guidelines"
      subtitle={`Version ${LEGAL_VERSIONS.communityGuidelines}. Plain-language rules for Dating, Friend Date, and every plan on DateToday.`}
    >
      <LegalSection title="Respect other people">
        <LegalP>
          Treat people like humans you might meet in person. Be kind in chats and plans. Respect someone’s
          boundaries, time, and “no.”
        </LegalP>
      </LegalSection>

      <LegalSection title="No harassment or threats">
        <LegalP>
          No harassment, stalking, threats, intimidation, or violence — in the app or around meetings arranged
          through DateToday. Unwanted repeated contact after someone passes, unmatches, blocks, or stops
          talking is not okay.
        </LegalP>
      </LegalSection>

      <LegalSection title="No hate or discrimination">
        <LegalP>
          No hate speech or discrimination based on identity, orientation, race, religion, disability, gender,
          or similar.
        </LegalP>
      </LegalSection>

      <LegalSection title="No unwanted sexual behavior">
        <LegalP>
          No sexual harassment, sexual pressure, or non-consensual sexual content. Keep photos and prompt videos
          appropriate for an app you would open in public.
        </LegalP>
      </LegalSection>

      <LegalSection title="Be real — no fake identities">
        <LegalP>
          Use your own photos and videos. No impersonation, catfishing, stolen media, or fake profiles. Optional
          verification can help others trust who you are, but it is not a background check.
        </LegalP>
      </LegalSection>

      <LegalSection title="No scams or fraud">
        <LegalP>
          No scams, solicitation, crypto or investment pitches, affiliate spam, commercial promotion, coercion,
          or attempts to move people off-platform for fraud.
        </LegalP>
      </LegalSection>

      <LegalSection title="Respect a no">
        <LegalP>
          If someone passes, unmatches, blocks, cancels a plan, or ends communication, stop. Do not pressure
          anyone to meet, share personal details, or continue talking.
        </LegalP>
      </LegalSection>

      <LegalSection title="Protect privacy">
        <LegalP>
          Do not share another person’s private information, photos, or messages without their permission. Do not
          dox or expose someone’s home, work, or other precise location.
        </LegalP>
      </LegalSection>

      <LegalSection title="18+ only">
        <LegalP>
          Minors are not allowed — as users or in content. Report suspected underage accounts immediately.
        </LegalP>
      </LegalSection>

      <LegalSection title="Dating and Friend Date">
        <LegalP>
          The same conduct and safety rules apply to Dating, Friend Date, and other plans. Platonic intent does
          not make harassment, pressure, or unsafe behavior okay.
        </LegalP>
      </LegalSection>

      <LegalSection title="Meetups">
        <LegalP>
          Meet only when both people agree. Prefer public places for first meetups, tell a friend, arrange your
          own transportation, and leave if you feel unsafe. See Safety Tips for more.
        </LegalP>
      </LegalSection>

      <LegalSection title="What happens if you break the rules">
        <LegalP>
          Serious or repeated violations can lead to content removal, feature limits, suspension, or permanent
          removal from DateToday. We may escalate faster when safety risk is clear. We review reports when we
          can, but we do not promise a specific outcome for every report.
        </LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm appeal process and review SLAs with counsel/ops before publishing.
        </LegalNote>
      </LegalSection>

      <LegalSection title="Reporting and blocking">
        <LegalP>
          Block anyone you do not want to see again. Report harassment, scams, underage accounts, and other
          safety concerns in the Safety Center. Reports are confidential to the reporter. False or abusive
          reports may themselves lead to enforcement.
        </LegalP>
      </LegalSection>

      <View style={styles.actions}>
        <Button label="Report a problem" onPress={() => router.push('/safety/report')} />
        <Button label="Blocked users" variant="secondary" onPress={() => router.push('/settings/blocked')} />
      </View>

      <SettingsGroup title="Related">
        <SettingsRow label="Safety Tips" onPress={() => router.push('/safety/tips')} />
        <SettingsRow label="Terms of Service" onPress={() => router.push('/legal/terms')} />
        <SettingsRow label="Safety Center" last onPress={() => router.push('/safety')} />
      </SettingsGroup>
    </LegalScreen>
  );
}

const styles = ScaledSheet.create({
  actions: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
});
