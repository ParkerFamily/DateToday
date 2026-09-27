import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { friendlyError } from '@/lib/errors';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { OptionGrid } from '@/components/ui/OptionChip';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';
import type { ReportReason } from '@/types';
import { reportUser } from '@/features/safety/api';
import { BLOCK_EXPLAINER, leaveAfterBlock } from '@/features/safety/blockFlow';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'fake_profile', label: 'Fake profile' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'scam_fraud', label: 'Scam / fraud' },
  { value: 'underage', label: 'Underage' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'threatening', label: 'Threatening behavior' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate_offline', label: 'Inappropriate offline behavior' },
  { value: 'scam_spam', label: 'Scam / spam' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'no_show', label: 'No-show' },
  { value: 'other', label: 'Other' },
];

const APP_PROBLEM_ID = 'app_problem';
const MIN_PROBLEM_DETAILS = 20;

export default function ReportScreen() {
  const router = useRouter();
  const { userId, name, block } = useLocalSearchParams<{
    userId?: string;
    name?: string;
    block?: string;
  }>();
  const blockFirst = block === '1';
  const [reason, setReason] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const resolvedUserId = typeof userId === 'string' && userId.length > 0 ? userId : undefined;
  const displayName = typeof name === 'string' ? name : null;

  const submit = async (alsoBlock: boolean) => {
    const selected = reason[0] as ReportReason | undefined;
    if (!selected) {
      Alert.alert('Pick a reason', 'Tell us what went wrong.');
      return;
    }

    let reportedId = resolvedUserId;
    if (!reportedId) {
      const trimmed = details.trim();
      if (trimmed.length < MIN_PROBLEM_DETAILS) {
        Alert.alert(
          'More detail needed',
          `To report a general problem without a user, add at least ${MIN_PROBLEM_DETAILS} characters of detail — or open Report from someone’s profile.`,
        );
        return;
      }
      reportedId = APP_PROBLEM_ID;
    }

    if (alsoBlock && reportedId === APP_PROBLEM_ID) {
      Alert.alert('Nothing to block', 'Open Report from a profile to report and block someone.');
      return;
    }

    try {
      setLoading(true);
      await reportUser({
        reportedId,
        reason: selected,
        details,
        alsoBlock: alsoBlock && reportedId !== APP_PROBLEM_ID,
        displayName,
      });
      Alert.alert(
        'Thanks',
        alsoBlock
          ? 'Report submitted. They’re blocked, your chat is deleted, and you’ll never see each other again.'
          : 'Our team will review this report.',
        [{ text: 'OK', onPress: () => (alsoBlock ? leaveAfterBlock(router) : router.back()) }],
      );
    } catch (error) {
      Alert.alert('Could not submit', friendlyError(error, 'Try again'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsHeader title={blockFirst ? 'Report & block' : 'Report'} />
        <AppText variant="secondary">
          {resolvedUserId
            ? 'Reports are confidential. False reports may affect your account.'
            : 'Reporting a general problem? Add enough detail (20+ characters), or open Report from a profile.'}
        </AppText>
        {resolvedUserId ? <AppText variant="caption">{BLOCK_EXPLAINER}</AppText> : null}

        <AppText variant="label">Reason</AppText>
        <OptionGrid
          options={REASONS}
          values={reason}
          multi={false}
          onToggle={(value) => setReason([value])}
        />

        <TextField
          label={resolvedUserId ? 'Details (optional)' : 'Details (required for app problems)'}
          value={details}
          onChangeText={setDetails}
          placeholder="What happened?"
          multiline
          style={styles.details}
        />

        <View style={styles.actions}>
          {blockFirst ? (
            <>
              <Button
                label="Report & block"
                variant="danger"
                loading={loading}
                onPress={() => void submit(true)}
              />
              <Button
                label="Report without blocking"
                variant="secondary"
                loading={loading}
                onPress={() => void submit(false)}
              />
            </>
          ) : (
            <>
              <Button label="Submit report" loading={loading} onPress={() => void submit(false)} />
              {resolvedUserId ? (
                <Button
                  label="Report & block"
                  variant="danger"
                  loading={loading}
                  onPress={() => void submit(true)}
                />
              ) : null}
            </>
          )}
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  details: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
