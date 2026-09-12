/**
 * DateToday+ commerce + free allowances.
 * One core meter: Ping time (Go Live = enter tonight’s pool).
 */
export const commerceConfig = {
  /** Free Ping / Go Live minutes per calendar day (local). */
  freePingMinutesPerDay: 30,

  /** Soft upsell when this many minutes remain on a free Ping. */
  freePingWarningMinutes: 5,

  /** Free outgoing messages per calendar day. */
  freeOutgoingMessagesPerDay: 10,

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
