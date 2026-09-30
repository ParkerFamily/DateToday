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

  describe('After Hours', () => {
    const at = (h: number, day = 26) => new Date(2026, 8, day, h, 0);
    const night = [
      card('early', { liveUntil: at(22, 26).toISOString() }),
      card('late', { liveUntil: at(1, 27).toISOString(), afterHours: ['still_out'] }),
      card('midnight', { liveUntil: at(0, 27).toISOString(), afterHours: ['late_meet', 'last_minute'] }),
    ];

    it('filters by how late they are out, only after 9 PM', () => {
      const values = f({ outLate: '24' });
      expect(ids(applyDiscoverFilters(night, values, { plus: true, now: at(22) }))).toEqual(['late', 'midnight']);
      expect(ids(applyDiscoverFilters(night, values, { plus: true, now: at(18) }))).toEqual([
        'early',
        'late',
        'midnight',
      ]);
    });

    it('counts past-midnight people as free late for the free-until filter', () => {
      expect(ids(applyDiscoverFilters(night, f({ freeUntilHour: 23 }), { plus: false, now: at(20) }))).toEqual([
        'late',
        'midnight',
      ]);
    });

    it('keeps tonight’s thresholds after midnight', () => {
      const values = f({ outLate: '24' });
      expect(ids(applyDiscoverFilters(night, values, { plus: true, now: at(0, 27) }))).toEqual(['late', 'midnight']);
    });

    it('matches open-to-late-night and ignores it for free users', () => {
      const values = f({ lateNightOpen: true });
      expect(ids(applyDiscoverFilters(night, values, { plus: true, now: at(23) }))).toEqual(['late', 'midnight']);
      expect(ids(applyDiscoverFilters(night, values, { plus: false, now: at(23) }))).toHaveLength(3);
    });

    it('Available now drops people who are only free later', () => {
      const pool2 = [card('now'), card('soon', { availabilityMode: 'later', laterTonightHour: 21 })];
      expect(ids(applyDiscoverFilters(pool2, f({ afterHoursNow: true }), { plus: true, now: at(22) }))).toEqual([
        'now',
      ]);
    });

    it('labels only during After Hours', () => {
      const values = f({ outLate: '23', lateNightOpen: true });
      expect(activeFilterLabels(values, { plus: true, now: at(23) })).toEqual(['🌙 11 PM+', '🌙 Late-night plans']);
      expect(activeFilterLabels(values, { plus: true, now: at(15) })).toEqual([]);
    });
  });

  describe('How soon', () => {
    const now = new Date(2026, 8, 26, 18, 20);
    const people = [
      card('live'),
      card('at7', { availabilityMode: 'later', laterTonightHour: 19 }),
      card('at9', { availabilityMode: 'later', laterTonightHour: 21 }),
    ];
    const run = (howSoon: DiscoverFilterValues['howSoon']) =>
      ids(applyDiscoverFilters(people, f({ howSoon }), { plus: false, now }));

    it('is free and splits by when they can meet', () => {
      expect(run('now')).toEqual(['live']);
      expect(run('hour')).toEqual(['live', 'at7']);
      expect(run('later')).toEqual(['at7', 'at9']);
      expect(activeFilterLabels(f({ howSoon: 'hour' }), { plus: false })).toEqual(['⏱ Within 1 hour']);
    });
  });

  it('never lets non-live nearby people pass "free tonight" filters', () => {
    const now = new Date(2026, 8, 26, 22, 0);
    const people = [card('live'), card('idle', { availabilityMode: 'nearby', liveUntil: '' })];
    const run = (over: Partial<DiscoverFilterValues>) =>
      ids(applyDiscoverFilters(people, f(over), { plus: true, now }));
    expect(run({})).toEqual(['live', 'idle']);
    expect(run({ howSoon: 'now' })).toEqual(['live']);
    expect(run({ freeUntilHour: 21 })).toEqual(['live']);
    expect(run({ spontaneous: ['close_by'] })).toEqual(['live']);
    expect(run({ lateNightOpen: true })).toEqual([]);
  });

  it('limits free interest filters to the broad list', () => {
    const people = [card('yogi', { interests: ['Yoga'] }), card('hiker', { interests: ['Hiking'] })];
    const values = f({ interestFilter: ['Yoga', 'Hiking'] });
    expect(ids(applyDiscoverFilters(people, values, { plus: false }))).toEqual(['hiker']);
    expect(ids(applyDiscoverFilters(people, values, { plus: true }))).toEqual(['yogi', 'hiker']);
  });

  it('applies Spontaneous filters', () => {
    const now = new Date(2026, 8, 26, 20, 0);
    const people = [
      card('fresh', { startedAt: new Date(2026, 8, 26, 19, 40).toISOString(), distanceMiles: 5 }),
      card('near', { startedAt: new Date(2026, 8, 26, 17, 0).toISOString(), distanceMiles: 1 }),
      card('short', { distanceMiles: 1, liveUntil: new Date(2026, 8, 26, 21, 0).toISOString() }),
    ];
    const run = (spontaneous: DiscoverFilterValues['spontaneous']) =>
      ids(applyDiscoverFilters(people, f({ spontaneous }), { plus: true, now }));
    expect(run(['just_live'])).toEqual(['fresh']);
    expect(run(['close_by'])).toEqual(['near', 'short']);
    expect(run(['free_a_while'])).toEqual(['fresh', 'near']);
  });
});
