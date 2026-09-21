import type { EntitlementKey, SubscriptionStatus } from '@/types';
import { FREE_MAX_RADIUS } from '@/constants/tonightVibe';
import { commerceConfig } from '@/constants/config';

const PLUS_ENTITLEMENTS: EntitlementKey[] = [
  'unlimited_pings',
  'unlimited_messages',
  'advanced_filters',
  'see_all_received_pings',
  'extended_radius',
  'priority_discovery',
  'saved_filters',
  'read_receipts',
];

export type PlusPlanId = 'weekly' | 'monthly';

export interface EntitlementState {
  plan: 'free' | 'plus';
  subscriptionStatus: SubscriptionStatus;
  /** Free daily Ping allowance in minutes. */
  freePingMinutesPerDay: number;
  /** Free outgoing messages per day. */
  freeOutgoingMessagesPerDay: number;
  /** Active Plus cadence when known. */
  plusPlanId: PlusPlanId | null;
  /** Store product id unlocking DateToday+. */
  productId: string | null;
  /** ISO expiration / renewal boundary from RevenueCat. */
  expiresAt: string | null;
  /** False when user canceled but still in paid period. */
  willRenew: boolean;
  /** Store manage-subscriptions deep link when available. */
  managementURL: string | null;
  /** Billing issue detected by the store / RevenueCat. */
  billingIssueDetected: boolean;
}

export const DEFAULT_ENTITLEMENTS: EntitlementState = {
  plan: 'free',
  subscriptionStatus: 'inactive',
  freePingMinutesPerDay: commerceConfig.freePingMinutesPerDay,
  freeOutgoingMessagesPerDay: commerceConfig.freeOutgoingMessagesPerDay,
  plusPlanId: null,
  productId: null,
  expiresAt: null,
  willRenew: false,
  managementURL: null,
  billingIssueDetected: false,
};

export function isPlusActive(state: EntitlementState): boolean {
  return (
    state.plan === 'plus' &&
    (state.subscriptionStatus === 'active' ||
      state.subscriptionStatus === 'trialing' ||
      state.subscriptionStatus === 'past_due')
  );
}

export function hasEntitlement(
  state: EntitlementState,
  key: EntitlementKey,
): boolean {
  if (!isPlusActive(state)) return false;
  return PLUS_ENTITLEMENTS.includes(key);
}

/** Unlimited Ping time for Plus; otherwise daily free minutes. */
export function pingMinutesAllowance(state: EntitlementState): number | 'unlimited' {
  return hasEntitlement(state, 'unlimited_pings')
    ? 'unlimited'
    : state.freePingMinutesPerDay;
}

export function messageAllowance(state: EntitlementState): number | 'unlimited' {
  return hasEntitlement(state, 'unlimited_messages')
    ? 'unlimited'
    : state.freeOutgoingMessagesPerDay;
}

/** @deprecated Prefer pingMinutesAllowance — kept for older call sites. */
export function maxOutgoingPings(state: EntitlementState): number | 'unlimited' {
  return pingMinutesAllowance(state);
}

/** Free band ends at 25 mi; Plus unlocks exact / up to 50. */
export function maxRadiusMiles(state: EntitlementState): number {
  return hasEntitlement(state, 'extended_radius') ? 50 : FREE_MAX_RADIUS;
}

export function canUseAdvancedFilters(state: EntitlementState): boolean {
  return hasEntitlement(state, 'advanced_filters');
}

export function canSeeAllReceivedPings(state: EntitlementState): boolean {
  return hasEntitlement(state, 'see_all_received_pings');
}

export function canUseSavedFilters(state: EntitlementState): boolean {
  return hasEntitlement(state, 'saved_filters') || hasEntitlement(state, 'advanced_filters');
}

export function canUsePriorityPool(state: EntitlementState): boolean {
  return hasEntitlement(state, 'priority_discovery');
}

/** Free: 5 / 10 / 25. Plus: adds 15 & 50 (exact control). */
export function allowedRadiusPresets(state: EntitlementState): number[] {
  return hasEntitlement(state, 'extended_radius')
    ? [5, 10, 15, 25, 50]
    : [5, 10, 25];
}

/** Verified-only is trust/safety — always free. */
export function canUseVerifiedOnly(_state: EntitlementState): boolean {
  return true;
}

/** Human status line for Settings / paywall. */
export function plusStatusLabel(state: EntitlementState): string {
  if (!isPlusActive(state)) return 'Free';
  const plan =
    state.plusPlanId === 'weekly'
      ? 'Weekly'
      : state.plusPlanId === 'monthly'
        ? 'Monthly'
        : 'Plus';
  if (state.billingIssueDetected || state.subscriptionStatus === 'past_due') {
    return `${plan} · Billing issue`;
  }
  if (!state.willRenew && state.expiresAt) {
    return `${plan} · Ends ${formatShortDate(state.expiresAt)}`;
  }
  if (state.willRenew && state.expiresAt) {
    return `${plan} · Renews ${formatShortDate(state.expiresAt)}`;
  }
  return `${plan} · Active`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
