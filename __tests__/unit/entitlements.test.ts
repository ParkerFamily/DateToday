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
    plusPlanId: 'weekly',
    productId: 'com.parkerfamily.datetoday.plus.weekly',
    expiresAt: null,
    willRenew: false,
    managementURL: null,
    billingIssueDetected: false,
  };

  it('free plan can match and message; Liked You and advanced filters stay Plus', () => {
    expect(matchAllowance(DEFAULT_ENTITLEMENTS)).toBe('unlimited');
    expect(conversationAllowance(DEFAULT_ENTITLEMENTS)).toBe('unlimited');
    expect(maxRadiusMiles(DEFAULT_ENTITLEMENTS)).toBe(25);
    expect(canSeeAllReceivedPings(DEFAULT_ENTITLEMENTS)).toBe(false);
    expect(hasEntitlement(DEFAULT_ENTITLEMENTS, 'advanced_filters')).toBe(false);
  });

  it('active DateToday+ unlocks Liked You, radius, and Priority Pool', () => {
    expect(matchAllowance(plusActive)).toBe('unlimited');
    expect(conversationAllowance(plusActive)).toBe('unlimited');
    expect(maxRadiusMiles(plusActive)).toBe(50);
    expect(canSeeAllReceivedPings(plusActive)).toBe(true);
    expect(hasEntitlement(plusActive, 'priority_discovery')).toBe(true);
  });

  it('canceled plus does not grant entitlements', () => {
    expect(hasEntitlement(plusCanceled, 'advanced_filters')).toBe(false);
    expect(canSeeAllReceivedPings(plusCanceled)).toBe(false);
    expect(matchAllowance(plusCanceled)).toBe('unlimited');
    expect(conversationAllowance(plusCanceled)).toBe('unlimited');
  });
});
