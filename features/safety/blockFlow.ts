import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';
import { friendlyError } from '@/lib/errors';
import { blockUser } from '@/features/safety/api';

type Router = ReturnType<typeof useRouter>;

export const BLOCK_EXPLAINER =
  'You’ll both disappear from each other’s app for good. Your conversation is deleted, hearts are removed, and you can never match again. They won’t be notified.';

/** After a block the chat/profile is gone, so return to Dates instead of a dead screen. */
export function leaveAfterBlock(router: Router) {
  router.dismissTo('/(tabs)/dates');
}

/** One entry point for "Block & report" from chat and profiles. */
export function confirmBlockAndReport(router: Router, target: { uid: string; name: string }) {
  if (!target.uid) return;
  Alert.alert(`Block ${target.name}?`, BLOCK_EXPLAINER, [
    {
      text: 'Report & block',
      style: 'destructive',
      onPress: () =>
        router.push({
          pathname: '/safety/report',
          params: { userId: target.uid, name: target.name, block: '1' },
        }),
    },
    {
      text: 'Block only',
      style: 'destructive',
      onPress: () => {
        void (async () => {
          try {
            await blockUser(target.uid, 'block', target.name);
            Alert.alert('Blocked', `${target.name} is gone for good.`, [
              { text: 'OK', onPress: () => leaveAfterBlock(router) },
            ]);
          } catch (error) {
            Alert.alert('Couldn’t block', friendlyError(error, 'Try again.'));
          }
        })();
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
