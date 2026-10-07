jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

import { applyDiscoverFilters } from '@/features/discover/applyFilters';
import { availabilityText, cardStatusTags, feedTier } from '@/features/discover/statusTags';
import {
  addDays,
  cleanTrip,
  cleanTripBadge,
  dayKey,
  tripDatesLabel,
  tripLabel,
  tripPhase,
  usableTrip,
} from '@/features/travel/trip';
import { DEFAULT_FILTERS } from '@/store/discoverFilters';
import type { DiscoveryCard, TravelTrip } from '@/types';

// Wednesday, Oct 7 2026, 8 PM local.
const now = new Date(2026, 9, 7, 20, 0);
const today = dayKey(now);

function card(over: Partial<DiscoveryCard> = {}): DiscoveryCard {
  return {
    userId: 'u',
    displayName: 'Sam',
    age: 27,
    neighborhoodLabel: null,
    distanceMiles: 0.4,
    verificationStatus: 'verified',
    datingIntention: null,
    bio: null,
    mainPhotoUrl: null,
    liveSessionId: 'u',
    liveUntil: new Date(2026, 9, 7, 23, 59).toISOString(),
    freeUntil: new Date(2026, 9, 8, 1, 0).toISOString(),
    availabilityLabel: null,
    activities: [],
    isBoosted: false,
    rankScore: 1,
    videoPrompts: [],
    startedAt: new Date(2026, 9, 7, 19, 55).toISOString(),
    confirmedAt: new Date(2026, 9, 7, 19, 55).toISOString(),
    availabilityMode: 'live',
    ...over,
  };
}

const friday = { city: 'Atlanta', startsOn: addDays(today, 2), endsOn: addDays(today, 4) };
const here = { city: 'Atlanta', startsOn: today, endsOn: addDays(today, 4) };

describe('trip labels', () => {
  it('says traveling before the trip and in-city during it', () => {
    expect(tripLabel(friday, now)).toBe('Traveling to Atlanta · Fri');
    expect(tripLabel({ ...friday, startsOn: addDays(today, 1) }, now)).toBe('Traveling to Atlanta · Tomorrow');
    expect(tripLabel(here, now)).toBe('In Atlanta through Sun');
    expect(tripLabel({ ...here, endsOn: today }, now)).toBe('In Atlanta today');
    expect(tripDatesLabel(friday, now)).toBe('Fri – Sun');
  });

  it('tracks the trip phase by calendar day', () => {
    expect(tripPhase(friday, now)).toBe('upcoming');
    expect(tripPhase(here, now)).toBe('here');
    expect(tripPhase({ ...here, startsOn: addDays(today, -3), endsOn: addDays(today, -1) }, now)).toBe('over');
  });
});

describe('trip validation', () => {
  const full: TravelTrip = { ...friday, region: 'Georgia', latitude: 33.749, longitude: -84.388 };

  it('accepts a well-formed trip and rejects junk', () => {
    expect(cleanTrip(full)).toEqual(full);
    expect(cleanTripBadge({ city: '', startsOn: today, endsOn: today })).toBeNull();
    expect(cleanTripBadge({ city: 'Atlanta', startsOn: addDays(today, 3), endsOn: today })).toBeNull();
    expect(cleanTrip({ ...full, latitude: 'x' })).toBeNull();
  });

  it('drops trips that are over, too far out, or too long', () => {
    expect(usableTrip(full, now)).toEqual(full);
    expect(usableTrip({ ...full, startsOn: addDays(today, -5), endsOn: addDays(today, -1) }, now)).toBeNull();
    expect(usableTrip({ ...full, startsOn: addDays(today, 20), endsOn: addDays(today, 21) }, now)).toBeNull();
    expect(usableTrip({ ...full, startsOn: today, endsOn: addDays(today, 10) }, now)).toBeNull();
  });
});

describe('travelers are never presented as nearby', () => {
  it('labels them by trip, not "Live tonight"', () => {
    expect(availabilityText(card({ trip: friday }), now)).toBe('Traveling to Atlanta · Fri');
    expect(availabilityText(card({ trip: here }), now)).toBe('In Atlanta through Sun');
  });

  it('never tags a traveler "Close by" or "Free all night"', () => {
    const local = cardStatusTags(card(), now).map((t) => t.key);
    expect(local).toEqual(expect.arrayContaining(['nearby', 'tonight']));
    for (const trip of [friday, here]) {
      const keys = cardStatusTags(card({ trip }), now).map((t) => t.key);
      expect(keys).not.toContain('nearby');
      expect(keys).not.toContain('tonight');
    }
  });

  it('ranks upcoming travelers after people out now', () => {
    expect(feedTier(card(), now)).toBe(0);
    expect(feedTier(card({ trip: here }), now)).toBe(0);
    expect(feedTier(card({ trip: friday }), now)).toBe(1);
  });

  it('keeps travelers out of close-by and ready-now filters', () => {
    const cards = [card({ userId: 'local' }), card({ userId: 'soon', trip: friday }), card({ userId: 'here', trip: here })];
    const ids = (f: Partial<typeof DEFAULT_FILTERS>) =>
      applyDiscoverFilters(cards, { ...DEFAULT_FILTERS, ...f }, { plus: true, now }).map((c) => c.userId);
    expect(ids({ closeByMiles: 1 })).toEqual(['local']);
    expect(ids({ readyNow: true })).toEqual(['local', 'here']);
    expect(ids({ howSoon: 'now' })).toEqual(['local', 'here']);
  });
});
