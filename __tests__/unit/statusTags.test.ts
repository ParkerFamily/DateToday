jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

import { cardStatusTags, keyTraits, repliesFast } from '@/features/discover/statusTags';
import type { DiscoveryCard } from '@/types';

const now = new Date(2026, 8, 26, 20, 0);
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

function card(over: Partial<DiscoveryCard> = {}): DiscoveryCard {
  return {
    userId: 'u',
    displayName: 'Sam',
    age: 27,
    neighborhoodLabel: null,
    distanceMiles: 5,
    verificationStatus: 'verified',
    datingIntention: null,
    bio: null,
    mainPhotoUrl: null,
    liveSessionId: 'u',
    liveUntil: new Date(2026, 8, 26, 20, 45).toISOString(),
    availabilityLabel: null,
    activities: [],
    isBoosted: false,
    rankScore: 1,
    videoPrompts: [],
    startedAt: minsAgo(90),
    ...over,
  };
}

const labels = (c: DiscoveryCard) => cardStatusTags(c, now).map((t) => t.label);

describe('cardStatusTags', () => {
  it('always leads with availability', () => {
    expect(labels(card())).toEqual(['Live now']);
    expect(labels(card({ availabilityMode: 'later', laterTonightHour: 21 }))).toEqual(['Free at 9 PM']);
  });

  it('never presents non-live people as available', () => {
    const base = { availabilityMode: 'nearby' as const, liveUntil: '', startedAt: null };
    expect(labels(card({ ...base, lastActiveAt: minsAgo(40) }))).toEqual(['Recently active', 'Nearby']);
    expect(labels(card({ ...base, lastActiveAt: daysAgo(2) }))).toEqual(['Nearby']);
  });

  it('adds live signals from real data only', () => {
    const c = card({
      startedAt: minsAgo(5),
      distanceMiles: 1.2,
      liveUntil: new Date(2026, 8, 26, 23, 30).toISOString(),
    });
    expect(labels(c)).toEqual(['Live now', 'Active now', 'Nearby', 'Free tonight']);
  });

  it('needs a real sample before claiming fast replies', () => {
    expect(repliesFast({ replies: 3, fastReplies: 3 })).toBe(false);
    expect(repliesFast({ replies: 10, fastReplies: 7 })).toBe(true);
    expect(repliesFast({ replies: 10, fastReplies: 4 })).toBe(false);
  });

  it('shows recent plans and new members, capped at four tags', () => {
    const c = card({ replies: 8, fastReplies: 8, lastPlanAt: daysAgo(3), joinedAt: daysAgo(2) });
    expect(labels(c)).toEqual(['Live now', 'Usually replies fast', 'Made plans recently', 'New here']);
    expect(labels(card({ lastPlanAt: daysAgo(30), joinedAt: daysAgo(40) }))).toEqual(['Live now']);
  });
});

describe('keyTraits', () => {
  it('picks up to three fast-decision traits', () => {
    const c = card({ datingIntention: 'something_real', heightCm: 178, occupation: 'Designer', drinking: 'Socially' });
    expect(keyTraits(c)).toEqual(['Something real', '5′10″', 'Designer']);
    expect(keyTraits(card({ drinking: 'Never' }))).toEqual(['Doesn’t drink']);
  });
});
