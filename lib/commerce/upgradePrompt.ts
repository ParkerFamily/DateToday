import type { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { analytics } from '@/lib/analytics';

type Router = ReturnType<typeof useRouter>;

export type UpgradeReason =
  | 'likes_out'
  | 'likes_low'
  | 'filters'
  | 'likes'
  | 'travel'
  | 'priority'
  | 'friend_date'
  | 'after_hours';

export const UPGRADE_COPY: Record<UpgradeReason | 'default', { title: string; body: string }> = {
  likes_out: {
    title: 'You’ve used your free Likes ✦',
    body: 'Keep liking with DateToday+. Liking back people who like you is always free.',
  },
  likes_low: {
    title: 'Never run out of Likes ✦',
    body: 'Unlimited Likes with DateToday+, so you don’t run dry mid-night. Liking back is always free.',
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
  friend_date: {
    title: 'Unlock more Friend Dates',
    body: 'See more people, use advanced filters, and make more platonic plans with DateToday+.',
  },
  after_hours: {
    title: 'After Hours ✦',
    body: 'See who’s in After Hours, still out and up for a late plan near you, with DateToday+.',
  },
  default: {
    title: 'Like without limits ✦',
    body: 'Unlimited Likes, see everyone who liked you, and Advanced Filters — so you can actually go out tonight.',
  },
};

/** Free limit reached: go straight to the paywall with copy explaining why. */
export function openUpgrade(router: Router, reason: UpgradeReason) {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  if (reason === 'friend_date') analytics.track('friend_date_paywall_viewed');
  router.push({ pathname: '/paywall', params: { reason } });
}
