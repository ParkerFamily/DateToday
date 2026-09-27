import {
  DEFAULT_ENTITLEMENTS,
  canSeeAllReceivedPings,
  conversationAllowance,
  hasEntitlement,
  matchAllowance,
  maxRadiusMiles,
  type EntitlementState,
} from '@/lib/entitlements';

describe('entitlements', () => {
  const plusActive: EntitlementState = {
    plan: 'plus',
    subscriptionStatus: 'active',
    freeMatchesPerDay: 1,
    freeConversationsPerDay: 1,
    plusPlanId: 'monthly',
    productId: 'com.parkerfamily.datetoday.plus.monthly',
    expiresAt: '2026-10-01T00:00:00.000Z',
    willRenew: true,
    managementURL: null,
    billingIssueDetected: false,
  };

  const plusCanceled: EntitlementState = {
    plan: 'plus',
    subscriptionStatus: 'canceled',
    freeMatchesPerDay: 1,
    freeConversationsPerDay: 1,
    plusPlanId: 'weekly',
    productId: 'com.parkerfamily.datetoday.plus.weekly',
    expiresAt: null,
    willRenew: false,
    managementURL: null,
    billingIssueDetected: false,
  };

  it('free plan allows one match and one conversation a day', () => {
    expect(matchAllowance(DEFAULT_ENTITLEMENTS)).toBe(1);
    expect(conversationAllowance(DEFAULT_ENTITLEMENTS)).toBe(1);
    expect(maxRadiusMiles(DEFAULT_ENTITLEMENTS)).toBe(25);
    expect(canSeeAllReceivedPings(DEFAULT_ENTITLEMENTS)).toBe(false);
    expect(hasEntitlement(DEFAULT_ENTITLEMENTS, 'unlimited_matches')).toBe(false);
  });

  it('active DateToday+ unlocks unlimited matches + messages', () => {
    expect(matchAllowance(plusActive)).toBe('unlimited');
    expect(conversationAllowance(plusActive)).toBe('unlimited');
    expect(maxRadiusMiles(plusActive)).toBe(50);
    expect(canSeeAllReceivedPings(plusActive)).toBe(true);
    expect(hasEntitlement(plusActive, 'priority_discovery')).toBe(true);
  });

  it('canceled plus does not grant entitlements', () => {
    expect(hasEntitlement(plusCanceled, 'unlimited_matches')).toBe(false);
    expect(matchAllowance(plusCanceled)).toBe(1);
    expect(conversationAllowance(plusCanceled)).toBe(1);
  });
});
