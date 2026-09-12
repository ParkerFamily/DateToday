import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { persistAgeConfirmation } from '@/features/profile/persistAge';
import { isAtLeast18 } from '@/utils/time';

/** Dedicated age / 18+ confirmation — not the onboarding wheel flow. */
export default function AgeSettingsScreen() {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile);
  const draft = useOnboardingDraft();
  const [dob, setDob] = useState(profile?.dateOfBirth || draft.dateOfBirth || '');
  const [saving, setSaving] = useState(false);

  const valid = useMemo(() => /^\d{4}-\d{2}-\d{2}$/.test(dob) && isAtLeast18(dob), [dob]);

  const save = async () => {
    if (!valid) {
      Alert.alert('Date of birth', 'Use YYYY-MM-DD and confirm you are 18+.');
      return;
    }
    try {
      setSaving(true);
      draft.setDateOfBirth(dob);
      await persistAgeConfirmation(dob);
      Alert.alert('Saved', 'Age confirmed.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert('Couldn’t save', error instanceof Error ? error.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Confirm 18+" />
        <AppText variant="secondary" style={styles.sub}>
          DateToday is 18+. Your date of birth stays private — only used for eligibility.
        </AppText>
        <TextField
          label="Date of birth (YYYY-MM-DD)"
          value={dob}
          onChangeText={setDob}
          placeholder="1998-07-03"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <View style={styles.footer}>
          <Button label="Save" loading={saving} disabled={!valid} onPress={() => void save()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sub: {
    marginBottom: spacing.sm,
  },
  footer: {
    marginTop: spacing.md,
  },
});
