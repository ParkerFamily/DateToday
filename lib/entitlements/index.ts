import type { EntitlementKey, SubscriptionStatus } from '@/types';
import { FREE_MAX_RADIUS } from '@/constants/tonightVibe';
import { commerceConfig } from '@/constants/config';

const PLUS_ENTITLEMENTS: EntitlementKey[] = [
  'unlimited_matches',
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
  /** Free new matches per day. */
  freeMatchesPerDay: number;
  /** Free distinct people you can message per day. */
  freeConversationsPerDay: number;
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
  freeMatchesPerDay: commerceConfig.freeMatchesPerDay,
  freeConversationsPerDay: commerceConfig.freeConversationsPerDay,
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

/** Where an active DateToday+ comes from: App Store / Play (RevenueCat) or DateToday's web checkout. */
export type PlusSource = 'store' | 'web';

/** Firestore webSubscriptions/{uid}, written only by the Stripe webhook. */
export interface WebSubscriptionDoc {
  plus?: boolean;
  status?: string;
  plan?: string | null;
  expiresAt?: number | null;
  willRenew?: boolean;
  billingIssue?: boolean;
}

/** Same grace the server allows for a late renewal webhook. */
const WEB_RENEWAL_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

export function entitlementsFromWebSubscription(
  doc: WebSubscriptionDoc | null | undefined,
  now = Date.now(),
): EntitlementState | null {
  if (!doc) return null;
  const notExpired = doc.expiresAt == null || doc.expiresAt + WEB_RENEWAL_GRACE_MS > now;
  const plus = doc.plus === true && notExpired;
  const status: SubscriptionStatus = plus
    ? doc.status === 'trialing' || doc.status === 'past_due'
      ? doc.status
      : 'active'
    : doc.status === 'canceled' || doc.plus
      ? 'canceled'
      : 'inactive';
  return {
    ...DEFAULT_ENTITLEMENTS,
    plan: plus ? 'plus' : 'free',
    subscriptionStatus: status,
    plusPlanId: doc.plan === 'weekly' || doc.plan === 'monthly' ? doc.plan : null,
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
    willRenew: plus && doc.willRenew === true,
    billingIssueDetected: doc.billingIssue === true,
  };
}

/**
 * The one answer to "does this member have DateToday+?". An active store subscription wins;
 * otherwise an active web subscription; otherwise the store state as before.
 */
export function resolveEntitlements(
  store: EntitlementState,
  web: EntitlementState | null,
): { entitlements: EntitlementState; plusSource: PlusSource | null } {
  if (isPlusActive(store)) return { entitlements: store, plusSource: 'store' };
  if (web && isPlusActive(web)) return { entitlements: web, plusSource: 'web' };
  return { entitlements: store, plusSource: null };
}

export function hasDateTodayPlus(state: EntitlementState): boolean {
  return isPlusActive(state);
}

export function hasEntitlement(
  state: EntitlementState,
  key: EntitlementKey,
): boolean {
  if (!isPlusActive(state)) return false;
  return PLUS_ENTITLEMENTS.includes(key);
}

/** New matches per day: unlimited for Plus. */
export function matchAllowance(state: EntitlementState): number | 'unlimited' {
  return hasEntitlement(state, 'unlimited_matches')
    ? 'unlimited'
    : state.freeMatchesPerDay ?? commerceConfig.freeMatchesPerDay;
}

/** Distinct people you can message per day: unlimited for Plus. */
export function conversationAllowance(state: EntitlementState): number | 'unlimited' {
  return hasEntitlement(state, 'unlimited_messages')
    ? 'unlimited'
    : state.freeConversationsPerDay ?? commerceConfig.freeConversationsPerDay;
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
