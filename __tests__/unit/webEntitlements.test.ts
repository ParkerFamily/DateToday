import {
  DEFAULT_ENTITLEMENTS,
  canUseAdvancedFilters,
  entitlementsFromWebSubscription,
  resolveEntitlements,
  type EntitlementState,
} from '@/lib/entitlements';

const NOW = Date.UTC(2026, 9, 8);
const DAY = 86_400_000;

const storePlus: EntitlementState = {
  ...DEFAULT_ENTITLEMENTS,
  plan: 'plus',
  subscriptionStatus: 'active',
  plusPlanId: 'weekly',
  willRenew: true,
};

describe('web (Stripe) DateToday+', () => {
  it('maps an active web subscription onto the same Plus features', () => {
    const web = entitlementsFromWebSubscription(
      { plus: true, status: 'active', plan: 'monthly', expiresAt: NOW + 20 * DAY, willRenew: true },
      NOW,
    );
    expect(web?.plan).toBe('plus');
    expect(web?.plusPlanId).toBe('monthly');
    expect(canUseAdvancedFilters(web!)).toBe(true);
  });

  it('drops Plus once the paid period is well past, even if a webhook was missed', () => {
    const web = entitlementsFromWebSubscription({ plus: true, status: 'active', expiresAt: NOW - 3 * DAY }, NOW);
    expect(web?.plan).toBe('free');
    expect(web?.subscriptionStatus).toBe('canceled');
  });

  it('keeps Plus through a billing problem, flagged', () => {
    const web = entitlementsFromWebSubscription(
      { plus: true, status: 'past_due', expiresAt: NOW + DAY, billingIssue: true },
      NOW,
    );
    expect(web?.plan).toBe('plus');
    expect(web?.subscriptionStatus).toBe('past_due');
    expect(web?.billingIssueDetected).toBe(true);
  });

  it('without a web subscription the store state passes through untouched', () => {
    const free = { ...DEFAULT_ENTITLEMENTS };
    expect(resolveEntitlements(free, null)).toEqual({ entitlements: free, plusSource: null });
    expect(resolveEntitlements(free, null).entitlements).toBe(free);
    expect(resolveEntitlements(storePlus, null)).toEqual({ entitlements: storePlus, plusSource: 'store' });
  });

  it('either approved source unlocks Plus; the store wins when both are active', () => {
    const web = entitlementsFromWebSubscription({ plus: true, status: 'active', expiresAt: NOW + DAY }, NOW)!;
    expect(resolveEntitlements(DEFAULT_ENTITLEMENTS, web)).toEqual({ entitlements: web, plusSource: 'web' });
    expect(resolveEntitlements(storePlus, web).plusSource).toBe('store');
    const lapsed = entitlementsFromWebSubscription({ plus: false, status: 'canceled' }, NOW)!;
    expect(resolveEntitlements(DEFAULT_ENTITLEMENTS, lapsed).plusSource).toBeNull();
  });
});
