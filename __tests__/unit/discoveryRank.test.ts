import { compareDiscoveryRank } from '@/lib/commerce/sessionCommerce';

describe('compareDiscoveryRank', () => {
  it('ranks boosted cards ahead of non-boosted', () => {
    const boosted = { isBoosted: true, distanceMiles: 20, compatScore: 1 };
    const normal = { isBoosted: false, distanceMiles: 2, compatScore: 10 };
    expect(compareDiscoveryRank(boosted, normal, { priorityPool: false })).toBeLessThan(0);
    expect(compareDiscoveryRank(normal, boosted, { priorityPool: false })).toBeGreaterThan(0);
  });

  it('Priority Pool weights compatibility more heavily', () => {
    const closeLowCompat = { isBoosted: false, distanceMiles: 1, compatScore: 1 };
    const fartherHighCompat = { isBoosted: false, distanceMiles: 8, compatScore: 5 };
    expect(
      compareDiscoveryRank(fartherHighCompat, closeLowCompat, { priorityPool: true }),
    ).toBeLessThan(0);
  });
});
