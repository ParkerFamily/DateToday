import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { colors } from '@/constants/theme';
import { savePendingInvite } from '@/features/referrals/api';
import { hasEnteredApp } from '@/utils/accountEntry';
import { useSessionStore } from '@/store/session';

/** datetoday://invite/CODE: keep the code, then open Invite Friends (or the app, before sign-up). */
export default function InviteLink() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const entered = useSessionStore((s) => hasEnteredApp(s.profile));

  useEffect(() => {
    void savePendingInvite(String(code ?? '')).finally(() =>
      router.replace((entered ? '/settings/invite' : '/') as Href),
    );
  }, [code, entered, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.brandBright} />
    </View>
  );
}
