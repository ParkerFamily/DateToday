jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

import { activeFilterLabels, applyDiscoverFilters } from '@/features/discover/applyFilters';
import { DEFAULT_FILTERS, type DiscoverFilterValues } from '@/store/discoverFilters';
import type { DiscoveryCard } from '@/types';

function card(id: string, over: Partial<DiscoveryCard> = {}): DiscoveryCard {
  return {
    userId: id,
    displayName: id,
    age: 28,
    neighborhoodLabel: null,
    distanceMiles: 2,
    verificationStatus: 'verified',
    datingIntention: 'dating_open',
    bio: null,
    mainPhotoUrl: null,
    liveSessionId: id,
    liveUntil: new Date(2026, 8, 26, 23, 0).toISOString(),
    availabilityLabel: null,
    activities: ['drinks'],
    isBoosted: false,
    rankScore: 1,
    videoPrompts: [],
    foodCuisines: [],
    heightCm: 175,
    drinking: 'Socially',
    smoking: 'Never',
    ...over,
  };
}

const f = (over: Partial<DiscoverFilterValues>): DiscoverFilterValues => ({ ...DEFAULT_FILTERS, ...over });
const ids = (list: DiscoveryCard[]) => list.map((c) => c.userId);

describe('applyDiscoverFilters', () => {
  const pool = [
    card('a'),
    card('b', { age: 40, verificationStatus: 'unverified' }),
    card('c', { heightCm: null, drinking: null, datingIntention: 'casual' }),
  ];

  it('applies free filters (age, verified)', () => {
    expect(ids(applyDiscoverFilters(pool, f({ ageMax: 35 }), { plus: false }))).toEqual(['a', 'c']);
    expect(ids(applyDiscoverFilters(pool, f({ verifiedOnly: true }), { plus: false }))).toEqual(['a', 'c']);
  });

  it('ignores Plus filters for free users', () => {
    expect(ids(applyDiscoverFilters(pool, f({ intents: ['casual'] }), { plus: false }))).toEqual(['a', 'b', 'c']);
  });

  it('keeps people missing info unless Match every filter is on', () => {
    const loose = f({ minHeightCm: 170 });
    expect(ids(applyDiscoverFilters(pool, loose, { plus: true }))).toEqual(['a', 'b', 'c']);
    expect(ids(applyDiscoverFilters(pool, { ...loose, matchAllFilters: true }, { plus: true }))).toEqual(['a', 'b']);
    expect(ids(applyDiscoverFilters(pool, f({ intents: ['casual'] }), { plus: true }))).toEqual(['c']);
  });

  it('filters by interests for everyone', () => {
    const people = [
      card('hiker', { interests: ['Hiking', 'Coffee'] }),
      card('reader', { interests: ['Reading'] }),
      card('blank'),
    ];
    expect(ids(applyDiscoverFilters(people, f({ interestFilter: ['Hiking'] }), { plus: false }))).toEqual(['hiker']);
    expect(
      ids(applyDiscoverFilters(people, f({ sharedInterestsOnly: true }), { plus: false, myInterests: ['Reading'] })),
    ).toEqual(['reader']);
    expect(ids(applyDiscoverFilters(people, f({ sharedInterestsOnly: true }), { plus: false }))).toEqual([
      'hiker',
      'reader',
      'blank',
    ]);
  });

  it('labels only filters that apply to the plan', () => {
    const values = f({ verifiedOnly: true, intents: ['casual'] });
    expect(activeFilterLabels(values, { plus: false })).toEqual(['Verified']);
    expect(activeFilterLabels(values, { plus: true })).toEqual(['Verified', 'Casual']);
  });
});
