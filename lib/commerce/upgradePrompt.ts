import type { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

type Router = ReturnType<typeof useRouter>;

export type UpgradeReason = 'match' | 'message' | 'filters';

export const UPGRADE_COPY: Record<UpgradeReason | 'default', { title: string; body: string }> = {
  match: {
    title: 'You’ve got today’s free match ✦',
    body: 'Free includes 1 match a day. Keep matching tonight — unlimited with DateToday+.',
  },
  message: {
    title: 'Talk to everyone you match ✦',
    body: 'Free includes chatting with 1 person a day. Message all your matches with DateToday+.',
  },
  filters: {
    title: 'Find exactly your type ✦',
    body: 'Age, intent, height, lifestyle and more — Advanced Filters come with DateToday+.',
  },
  default: {
    title: 'More matches. More conversation. ✦',
    body: 'Unlimited matches and messages — so you can actually go out tonight.',
  },
};

/** Free limit reached: go straight to the paywall with copy explaining why. */
export function openUpgrade(router: Router, reason: UpgradeReason) {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  router.push({ pathname: '/paywall', params: { reason } });
}
