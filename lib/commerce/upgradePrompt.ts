import type { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

type Router = ReturnType<typeof useRouter>;

export type UpgradeReason = 'likes_out' | 'filters' | 'likes' | 'travel' | 'priority';

export const UPGRADE_COPY: Record<UpgradeReason | 'default', { title: string; body: string }> = {
  likes_out: {
    title: 'You’ve used your free Likes ✦',
    body: 'Keep liking with DateToday+. Liking back people who like you is always free.',
  },
  filters: {
    title: 'Find exactly your type ✦',
    body: 'Age, intent, height, lifestyle and more — Advanced Filters come with DateToday+.',
  },
  likes: {
    title: 'See everyone who likes you ✦',
    body: 'See every person who liked you and match instantly with DateToday+.',
  },
  travel: {
    title: 'Travel Mode ✦',
    body: 'See who’s out tonight in the city you’re headed to. Plan your night before you land with DateToday+.',
  },
  priority: {
    title: 'Stand out with a Priority Like',
    body: 'Send a short note and show them you’re serious about meeting.',
  },
  default: {
    title: 'Like without limits ✦',
    body: 'Unlimited Likes, see everyone who liked you, and Advanced Filters — so you can actually go out tonight.',
  },
};

/** Free limit reached: go straight to the paywall with copy explaining why. */
export function openUpgrade(router: Router, reason: UpgradeReason) {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  router.push({ pathname: '/paywall', params: { reason } });
}
