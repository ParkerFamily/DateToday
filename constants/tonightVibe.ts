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

export const FREE_FILTER_FEATURES = [
  '30 min Ping / Go Live per day',
  'Browse while Pinged',
  'Matches & Make a Plan',
  '10 outgoing messages / day',
  'Basic age, gender & radius',
] as const;

export const PLUS_FILTER_FEATURES = [
  'Unlimited Ping / Go Live',
  'Unlimited messages',
  'Advanced filters & saved presets',
  'See everyone who liked you',
  'Priority Pool',
] as const;

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
