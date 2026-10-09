import { DEFAULT_ENTITLEMENTS, type EntitlementState } from '@/lib/entitlements';
import {
  canMatchToday,
  canMessageMatch,
  matchesCreatedToday,
} from '@/lib/usage/dailyLimits';

const plus: EntitlementState = { ...DEFAULT_ENTITLEMENTS, plan: 'plus', subscriptionStatus: 'active' };

describe('daily limits', () => {
  const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);

  it('counts only matches created today', () => {
    expect(matchesCreatedToday([{ createdAt: new Date() }, { createdAt: yesterday }, { createdAt: null }])).toBe(1);
  });

  it('allows matching for free and plus', () => {
    expect(canMatchToday(DEFAULT_ENTITLEMENTS, [{ createdAt: new Date() }]).ok).toBe(true);
    expect(canMatchToday(plus, [{ createdAt: new Date() }, { createdAt: new Date() }]).ok).toBe(true);
  });

  it('allows messaging every match for free and plus', async () => {
    expect((await canMessageMatch(DEFAULT_ENTITLEMENTS, 'a')).ok).toBe(true);
    expect((await canMessageMatch(DEFAULT_ENTITLEMENTS, 'b')).ok).toBe(true);
    expect((await canMessageMatch(plus, 'c')).ok).toBe(true);
  });
});
