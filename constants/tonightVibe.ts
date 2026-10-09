import type { TonightActivity } from '@/types';

/** Optional dinner detail — not a dating preference; part of Tonight's plan */
export type FoodCuisine =
  | 'italian'
  | 'mexican'
  | 'sushi'
  | 'steakhouse'
  | 'american'
  | 'seafood'
  | 'anything';

export const FOOD_CUISINES: { value: FoodCuisine; label: string }[] = [
  { value: 'italian', label: 'Italian' },
  { value: 'mexican', label: 'Mexican' },
  { value: 'sushi', label: 'Sushi' },
  { value: 'steakhouse', label: 'Steakhouse' },
  { value: 'american', label: 'Wings / American' },
  { value: 'seafood', label: 'Seafood' },
  { value: 'anything', label: 'Anything' },
];

export function foodLabel(cuisine: FoodCuisine): string {
  return FOOD_CUISINES.find((c) => c.value === cuisine)?.label ?? cuisine;
}

/** Free stays genuinely useful. Plus is precision / lifestyle — not safety. */
export const FREE_RADIUS_MILES = [5, 10, 25] as const;
export const PLUS_RADIUS_MILES = [5, 10, 15, 25, 50] as const;
export const FREE_DEFAULT_RADIUS = 10;
export const FREE_MAX_RADIUS = 25;

/** Paywall Free vs Premium comparison (likes-led). Other Plus gates stay in entitlements. */
export type TierFeature = { label: string; included: boolean };

export const FREE_TIER_FEATURES: readonly TierFeature[] = [
  { label: 'See all mutual matches', included: true },
  { label: 'Message your matches', included: true },
  { label: 'Limited daily likes sent', included: true },
  { label: 'See who liked you first', included: false },
] as const;

export const PREMIUM_TIER_FEATURES: readonly TierFeature[] = [
  { label: 'See everyone who liked you', included: true },
  { label: 'Unlimited likes sent', included: true },
  { label: 'All other premium features', included: true },
] as const;

/** @deprecated Prefer FREE_TIER_FEATURES / PREMIUM_TIER_FEATURES for the paywall. */
export const FREE_FILTER_FEATURES = FREE_TIER_FEATURES.filter((f) => f.included).map((f) => f.label);

/** @deprecated Prefer PREMIUM_TIER_FEATURES for the paywall. */
export const PLUS_FILTER_FEATURES = PREMIUM_TIER_FEATURES.map((f) => f.label);

/** @deprecated emoji map kept for any residual display helpers */
export const ACTIVITY_EMOJI: Record<TonightActivity | string, string> = {
  drinks: '',
  dinner: '',
  coffee: '',
  activity: '',
};

export function foodEmoji(_cuisine: FoodCuisine): string {
  return '';
}
