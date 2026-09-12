import React from 'react';
import { StyleSheet, View } from 'react-native';
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

export default function CommunityGuidelinesScreen() {
  const router = useRouter();

  return (
    <LegalScreen
      title="Community Guidelines"
      subtitle={`Version ${LEGAL_VERSIONS.communityGuidelines}. DateToday is for real adults planning real dates.`}
    >
      <LegalSection title="Be respectful">
        <LegalP>
          Treat people like humans you’ll meet tonight. No harassment, insults, stalking, unwanted sexual
          pressure, or hate speech based on identity, orientation, race, religion, disability, or similar.
        </LegalP>
      </LegalSection>

      <LegalSection title="Be real">
        <LegalP>
          Use your own photos and videos. No impersonation, catfishing, stolen media, or fake profiles. Optional
          Persona verification helps others trust who you are.
        </LegalP>
      </LegalSection>

      <LegalSection title="18+ only">
        <LegalP>
          Minors are not allowed — as users or in content. Report suspected underage accounts immediately.
        </LegalP>
      </LegalSection>

      <LegalSection title="No scams or spam">
        <LegalP>
          No solicitation, crypto/investment pitches, affiliate spam, commercial promotion, or attempts to move
          people off-platform for fraud.
        </LegalP>
      </LegalSection>

      <LegalSection title="Consent & content">
        <LegalP>
          Keep photos and prompt videos appropriate for a dating app you would open in public. No explicit sexual
          content, threats, or non-consensual imagery. Offline: only meet when both people agree.
        </LegalP>
      </LegalSection>

      <LegalSection title="Safety on dates">
        <LegalP>
          Meet in public, tell a friend, arrange your own transportation, and leave if you feel unsafe. See Dating
          Safety Tips for more.
        </LegalP>
      </LegalSection>

      <LegalSection title="Enforcement ladder">
        <LegalP>
          1) Warning or content removal for lower-severity issues. 2) Temporary limits (discovery/chat pause or
          feature locks). 3) Suspension. 4) Permanent ban for severe or repeated violations (underage, threats,
          scams, violence). We may escalate faster when safety risk is clear.
        </LegalP>
        <LegalNote>
          [LEGAL REVIEW REQUIRED] Confirm appeal process and review SLAs with counsel/ops before publishing.
        </LegalNote>
      </LegalSection>

      <LegalSection title="Reporting">
        <LegalP>
          Reports are confidential to the reporter. False or abusive reports may themselves lead to enforcement.
          Block anyone you do not want to see again.
        </LegalP>
      </LegalSection>

      <View style={styles.actions}>
        <Button label="Report a problem" onPress={() => router.push('/safety/report')} />
        <Button
          label="Blocked users"
          variant="secondary"
          onPress={() => router.push('/settings/blocked')}
        />
      </View>

      <SettingsGroup title="Related">
        <SettingsRow label="Dating Safety Tips" onPress={() => router.push('/safety/tips')} />
        <SettingsRow label="Safety Center" last onPress={() => router.push('/safety')} />
      </SettingsGroup>
    </LegalScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
});
