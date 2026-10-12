import { useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { errorCode, revealLike } from '@/features/matches/api';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { friendlyError } from '@/lib/errors';
import { refreshLikes, usePendingLikes } from '@/store/matches';

/**
 * Tapping a hidden like: free members spend their one Like Reveal on it (after confirming),
 * everyone else goes to DateToday+.
 */
export function useLikeReveal() {
  const router = useRouter();
  const likes = usePendingLikes();
  const [revealing, setRevealing] = useState(false);
  const available = Boolean(likes && !likes.plus && likes.revealAvailable);
  const left = available ? Math.max(1, likes?.revealsLeft ?? 1) : 0;

  const reveal = async (token: string) => {
    setRevealing(true);
    try {
      const like = await revealLike(token);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshLikes();
      router.push({ pathname: '/profile/[userId]', params: { userId: like.uid, name: like.displayName } });
    } catch (error) {
      const code = errorCode(error);
      if (code === 'reveal_used') {
        void refreshLikes();
        openUpgrade(router, 'likes');
        return;
      }
      if (code === 'reveal_gone') {
        void refreshLikes();
        Alert.alert('That like is gone', 'They’re no longer in your likes. Pick another one.');
        return;
      }
      Alert.alert('Couldn’t reveal', friendlyError(error, 'Try again.'));
    } finally {
      setRevealing(false);
    }
  };

  const onLockedPress = (tile: { token?: string }) => {
    if (revealing) return;
    const token = tile.token;
    if (!available || !token) {
      openUpgrade(router, 'likes');
      return;
    }
    void Haptics.selectionAsync();
    Alert.alert(
      'Use your free Like Reveal?',
      left > 1
        ? `You have ${left}. See who this is and like them back.`
        : 'See who this is and like them back. The rest stay hidden until DateToday+.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Reveal', onPress: () => void reveal(token) },
      ],
    );
  };

  return { revealAvailable: available, revealsLeft: left, revealing, onLockedPress };
}
