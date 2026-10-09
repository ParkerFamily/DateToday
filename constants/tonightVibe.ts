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

/** Paywall Free column — locked rows stay visible so Premium’s hook is obvious. */
export const FREE_FILTER_FEATURES = [
  { label: 'See all mutual matches', locked: false },
  { label: 'Message your matches', locked: false },
  { label: 'Send likes', locked: false },
  { label: 'See who liked you first', locked: true },
] as const;

/** Paywall Premium column — Liked You is the headline; filters/Travel/etc. roll up. */
export const PLUS_FILTER_FEATURES = [
  'See everyone who liked you',
  'Advanced filters & After Hours',
  'Travel Mode, Priority Pool & more',
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
