/**
 * DateToday+ commerce + free allowances.
 * Going live is free and untimed; the free meter is people, not minutes.
 */
export const commerceConfig = {
  /** Free new matches per calendar day (local). */
  freeMatchesPerDay: 10,

  /** Free distinct people you can message per calendar day (local). */
  freeConversationsPerDay: 1,

  /** RevenueCat entitlement for DateToday+ */
  plusEntitlementId: 'datetoday_pro',

  /** Subscription offering + package identifiers */
  plusOfferingId: 'default',
  plusWeeklyPackageId: '$rc_weekly',
  plusMonthlyPackageId: '$rc_monthly',

  /** App Store product IDs */
  plusWeeklyProductId: 'com.parkerfamily.datetoday.plus.weekly',
  plusMonthlyProductId: 'com.parkerfamily.datetoday.plus.monthly',

  /** Fallback UI when RevenueCat / StoreKit price string is missing */
  plusWeeklyFallbackPrice: '$9.99',
  plusWeeklyFallbackPeriod: 'week',
  plusMonthlyFallbackPrice: '$19.99',
  plusMonthlyFallbackPeriod: 'month',

  /** Tonight Boost (consumable — NOT datetoday_pro) */
  boostOfferingId: 'tonight_boost',
  boostPackageId: 'tonight_boost',
  boostProductId: 'com.parkerfamily.datetoday.tonightboost',
  boostFallbackPrice: '$4.99',
} as const;

/** @deprecated Use constants/videoPrompts — curated bank only */
export { VIDEO_PROMPT_BANK as videoPrompts } from '@/constants/videoPrompts';

export const genderOptions = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
] as const;
