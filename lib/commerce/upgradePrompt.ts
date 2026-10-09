import type { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

type Router = ReturnType<typeof useRouter>;

export type UpgradeReason = 'filters' | 'likes' | 'travel';

export const UPGRADE_COPY: Record<UpgradeReason | 'default', { title: string; body: string }> = {
  filters: {
    title: 'Find exactly your type ✦',
    body: 'Age, intent, height, lifestyle and more — Advanced Filters come with DateToday+.',
  },
  likes: {
    title: 'See everyone who likes you ✦',
    body: 'Free shows 1 like at a time. See every like and match instantly with Premium.',
  },
  travel: {
    title: 'Travel Mode ✦',
    body: 'See who’s out tonight in the city you’re headed to. Plan your night before you land with DateToday+.',
  },
  default: {
    title: 'See who likes you. Fine-tune discovery. ✦',
    body: 'Liked You, Advanced Filters, Travel Mode, and Priority Pool — so you can actually go out tonight.',
  },
};

/** Free limit reached: go straight to the paywall with copy explaining why. */
export function openUpgrade(router: Router, reason: UpgradeReason) {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  router.push({ pathname: '/paywall', params: { reason } });
}
