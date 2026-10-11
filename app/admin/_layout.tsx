import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { MONO } from '@/components/admin/ConsoleUI';
import { colors, spacing } from '@/constants/theme';
import { isOwnerAdmin } from '@/features/admin/api';
import { useSessionStore } from '@/store/session';

export default function AdminLayout() {
  const router = useRouter();
  const userId = useSessionStore((s) => s.userId);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void isOwnerAdmin().then((ok) => live && setAllowed(ok));
    return () => {
      live = false;
    };
  }, [userId]);

  if (allowed === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.live} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
          <AppText style={{ fontFamily: MONO, color: colors.danger }}>{'> access_denied'}</AppText>
          <AppText variant="hero">Owner access only</AppText>
          <Button label="Back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
        </View>
      </Screen>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
