import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { SettingsHeader, SettingsGroup, SettingsRow } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { confirmPersonaOnServer } from '@/features/verification/persistVerification';
import { loadUserProfile } from '@/features/profile/saveOnboarding';
import { isBackendConfigured } from '@/lib/env';

export default function VerificationSettingsScreen() {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile);
  const setProfile = useSessionStore((s) => s.setProfile);
  const userId = useSessionStore((s) => s.userId);
  const [refreshing, setRefreshing] = useState(false);

  const status = profile?.verificationStatus ?? 'unverified';
  const verified = status === 'verified';
  const pending = status === 'pending' || status === 'manual_review';

  const reloadFromFirestore = useCallback(async () => {
    if (!isBackendConfigured() || !userId) return;
    try {
      const saved = await loadUserProfile(userId);
      if (saved?.profile) setProfile(saved.profile);
    } catch {
      /* ignore */
    }
  }, [setProfile, userId]);

  useFocusEffect(
    useCallback(() => {
      void reloadFromFirestore();
    }, [reloadFromFirestore]),
  );

  const refreshStatus = async () => {
    try {
      setRefreshing(true);
      const result = await confirmPersonaOnServer(null);
      if (result.status === 'verified') {
        Alert.alert('Verified', 'Your account is now VERIFIED.');
      } else if (result.status === 'pending' || result.status === 'manual_review') {
        Alert.alert(
          'Still pending',
          'Persona hasn’t approved yet. Finish the check, then tap Refresh again.',
        );
      } else if (result.status === 'failed') {
        Alert.alert('Not verified', 'Persona declined this check. You can start again.');
      } else {
        Alert.alert('Not verified', 'No completed Persona check found for this account yet.');
      }
      await reloadFromFirestore();
    } catch (error) {
      Alert.alert(
        'Couldn’t refresh',
        error instanceof Error
          ? error.message
          : 'Make sure you’re online. If this keeps failing, the confirm function may need deploy.',
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsHeader title="Verification" />

        <View style={styles.statusCard}>
          <VerificationTag status={status} />
          <AppText style={styles.statusTitle}>
            {verified
              ? 'You’re verified'
              : pending
                ? 'Verification in progress'
                : 'Not verified yet'}
          </AppText>
          <AppText variant="secondary" style={styles.statusBody}>
            {verified
              ? 'VERIFIED is saved on your account. Other people see the badge on your profile.'
              : pending
                ? 'We saved your Persona inquiry. Tap Refresh status after Persona finishes approving.'
                : 'NOT VERIFIED means you haven’t completed identity verification. Verified profiles get a trust badge in discovery.'}
          </AppText>
        </View>

        {!verified ? (
          <Button
            label="Start verification"
            onPress={() => router.push('/(onboarding)/verify?from=settings')}
            style={styles.cta}
          />
        ) : null}

        <Button
          label="Refresh status"
          variant={verified ? 'ghost' : 'secondary'}
          loading={refreshing}
          onPress={() => void refreshStatus()}
          style={styles.cta}
        />

        <SettingsGroup title="Learn more">
          <SettingsRow
            label="Identity Verification & Biometrics"
            detail="How we verify and what we store"
            last
            onPress={() => router.push('/legal/identity')}
          />
        </SettingsGroup>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  statusCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: 10,
    marginBottom: spacing.lg,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  statusBody: {
    lineHeight: 20,
  },
  cta: {
    marginBottom: spacing.md,
  },
});
