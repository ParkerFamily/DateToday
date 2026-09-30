import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';
import { useSessionStore } from '@/store/session';
import { isLiveSessionActive } from '@/utils/time';

type Router = ReturnType<typeof useRouter>;

/**
 * Plans are for tonight, so only people who are live can start one. Anyone can still match, chat,
 * and accept or decline a plan they were sent.
 */
export function canStartPlan(router: Router): boolean {
  const session = useSessionStore.getState().liveSession;
  if (session && isLiveSessionActive(session, new Date())) return true;
  Alert.alert(
    'Go live to make a plan',
    "Plans are for tonight. Go live to appear higher and let people know you're actually free tonight. You can keep chatting either way.",
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Go live', onPress: () => router.navigate('/(tabs)/live') },
    ],
  );
  return false;
}
