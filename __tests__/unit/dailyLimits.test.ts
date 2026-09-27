jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      clear: () => {
        store = {};
      },
    },
  };
});

import { DEFAULT_ENTITLEMENTS, type EntitlementState } from '@/lib/entitlements';
import {
  canMatchToday,
  canMessageMatch,
  matchesCreatedToday,
  recordMessagedMatch,
} from '@/lib/usage/dailyLimits';

const plus: EntitlementState = { ...DEFAULT_ENTITLEMENTS, plan: 'plus', subscriptionStatus: 'active' };

describe('free daily limits', () => {
  const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);

  it('counts only matches created today', () => {
    expect(matchesCreatedToday([{ createdAt: new Date() }, { createdAt: yesterday }, { createdAt: null }])).toBe(1);
  });

  it('allows one new match a day on free', () => {
    expect(canMatchToday(DEFAULT_ENTITLEMENTS, [{ createdAt: yesterday }]).ok).toBe(true);
    expect(canMatchToday(DEFAULT_ENTITLEMENTS, [{ createdAt: new Date() }]).ok).toBe(false);
    expect(canMatchToday(plus, [{ createdAt: new Date() }, { createdAt: new Date() }]).ok).toBe(true);
  });

  it('allows messaging one person a day, unlimited within that chat', async () => {
    expect((await canMessageMatch(DEFAULT_ENTITLEMENTS, 'a')).ok).toBe(true);
    await recordMessagedMatch('a');
    expect((await canMessageMatch(DEFAULT_ENTITLEMENTS, 'a')).ok).toBe(true);
    expect((await canMessageMatch(DEFAULT_ENTITLEMENTS, 'b')).ok).toBe(false);
    expect((await canMessageMatch(plus, 'b')).ok).toBe(true);
  });
});
