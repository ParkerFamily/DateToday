import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { InterestCount, InterestPicker } from '@/components/profile/InterestPicker';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { ScaledSheet } from '@/lib/scale';

export default function InterestsScreen() {
  const router = useRouter();
  const interests = useOnboardingDraft((s) => s.interests);
  const setInterests = useOnboardingDraft((s) => s.setInterests);
  const next = () => router.push('/(onboarding)/distance');

  return (
    <OnboardingChrome
      compact
      progress={ONBOARD_PROGRESS.interests}
      title="What are you into?"
      subtitle="We’ll show you who shares your interests so it’s easy to tell if you click."
      footer={
        <View style={styles.footer}>
          <InterestCount count={interests.length} />
          <PrimaryCta label="Continue" showArrow={false} disabled={interests.length === 0} onPress={next} />
          {interests.length === 0 ? <Button label="Skip for now" variant="ghost" onPress={next} /> : null}
        </View>
      }
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <InterestPicker value={interests} onChange={setInterests} />
      </ScrollView>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
  scroll: { flex: 1 },
  list: { paddingBottom: 8 },
  footer: { gap: 8 },
});
