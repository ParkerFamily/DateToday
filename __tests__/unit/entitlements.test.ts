import {
  DEFAULT_ENTITLEMENTS,
  canSeeAllReceivedPings,
  hasEntitlement,
  messageAllowance,
  pingMinutesAllowance,
  maxRadiusMiles,
  type EntitlementState,
} from '@/lib/entitlements';

describe('entitlements', () => {
  const plusActive: EntitlementState = {
    plan: 'plus',
    subscriptionStatus: 'active',
    freePingMinutesPerDay: 30,
    freeOutgoingMessagesPerDay: 10,
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
    freePingMinutesPerDay: 30,
    freeOutgoingMessagesPerDay: 10,
    plusPlanId: 'weekly',
    productId: 'com.parkerfamily.datetoday.plus.weekly',
    expiresAt: null,
    willRenew: false,
    managementURL: null,
    billingIssueDetected: false,
  };

  it('free plan meters Ping time and messages', () => {
    expect(pingMinutesAllowance(DEFAULT_ENTITLEMENTS)).toBe(30);
    expect(messageAllowance(DEFAULT_ENTITLEMENTS)).toBe(10);
    expect(maxRadiusMiles(DEFAULT_ENTITLEMENTS)).toBe(25);
    expect(canSeeAllReceivedPings(DEFAULT_ENTITLEMENTS)).toBe(false);
    expect(hasEntitlement(DEFAULT_ENTITLEMENTS, 'unlimited_pings')).toBe(false);
  });

  it('active DateToday+ unlocks unlimited Ping + messages', () => {
    expect(pingMinutesAllowance(plusActive)).toBe('unlimited');
    expect(messageAllowance(plusActive)).toBe('unlimited');
    expect(maxRadiusMiles(plusActive)).toBe(50);
    expect(canSeeAllReceivedPings(plusActive)).toBe(true);
    expect(hasEntitlement(plusActive, 'priority_discovery')).toBe(true);
  });

  it('canceled plus does not grant entitlements', () => {
    expect(hasEntitlement(plusCanceled, 'unlimited_pings')).toBe(false);
    expect(pingMinutesAllowance(plusCanceled)).toBe(30);
    expect(messageAllowance(plusCanceled)).toBe(10);
  });
});
