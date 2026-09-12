import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';

export default function AccountInformationScreen() {
  const router = useRouter();
  const email = useSessionStore((s) => s.email);
  const sessionUserId = useSessionStore((s) => s.userId);

  const { displayEmail, providerIds, uid } = useMemo(() => {
    if (!isBackendConfigured()) {
      return { displayEmail: email, providerIds: [] as string[], uid: sessionUserId };
    }
    const user = getFirebaseAuth().currentUser;
    return {
      displayEmail: user?.email ?? email,
      providerIds: user?.providerData.map((p) => p.providerId) ?? [],
      uid: user?.uid ?? sessionUserId,
    };
  }, [email, sessionUserId]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Account information" />
        <AppText variant="secondary" style={styles.sub}>
          Sign-in details for your DateToday account.
        </AppText>

        <SettingsGroup title="Signed in as">
          <SettingsRow
            label="Email"
            detail={displayEmail ?? 'Not available'}
            onPress={() => undefined}
          />
          <SettingsRow
            label="User ID"
            detail={uid ?? '—'}
            onPress={() => undefined}
          />
          <SettingsRow
            label="Sign-in methods"
            detail={
              providerIds.length
                ? providerIds
                    .map((p) =>
                      p === 'password'
                        ? 'Email'
                        : p === 'google.com'
                          ? 'Google'
                          : p === 'apple.com'
                            ? 'Apple'
                            : p,
                    )
                    .join(', ')
                : 'Unknown'
            }
            last
            onPress={() => undefined}
          />
        </SettingsGroup>

        <SettingsGroup title="Security">
          <SettingsRow
            label="Delete account"
            danger
            last
            onPress={() => router.push('/settings/delete-account')}
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
  sub: {
    marginBottom: spacing.lg,
  },
});
