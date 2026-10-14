import { nearLabel, travelTripFor } from '@/features/location/effective';
import type { LiveSession, TravelTrip } from '@/types';

const now = new Date(2026, 9, 14, 20, 0);
const miami: TravelTrip = {
  city: 'Miami',
  region: 'Florida',
  startsOn: '2026-10-14',
  endsOn: '2026-10-16',
  latitude: 25.762,
  longitude: -80.192,
};
const live = (trip: TravelTrip | null) =>
  ({
    status: 'active',
    expiresAt: new Date(now.getTime() + 3600000).toISOString(),
    endedAt: null,
    trip,
  }) as unknown as LiveSession;

describe('Travel Mode location', () => {
  it('uses the trip you’re Live with', () => {
    expect(travelTripFor({ liveSession: live(miami), plus: false, savedTrip: null, now })?.city).toBe('Miami');
  });

  it('Live at home wins over a saved trip', () => {
    expect(travelTripFor({ liveSession: live(null), plus: true, savedTrip: miami, now })).toBeNull();
  });

  it('a saved trip only applies with DateToday+', () => {
    expect(travelTripFor({ liveSession: null, plus: true, savedTrip: miami, now })?.city).toBe('Miami');
    expect(travelTripFor({ liveSession: null, plus: false, savedTrip: miami, now })).toBeNull();
  });

  it('ignores an ended Live session and a finished trip', () => {
    const ended = { ...live(miami), status: 'ended', endedAt: now.toISOString() } as LiveSession;
    expect(travelTripFor({ liveSession: ended, plus: false, savedTrip: null, now })).toBeNull();
    const over = { ...miami, startsOn: '2026-10-01', endsOn: '2026-10-03' };
    expect(travelTripFor({ liveSession: null, plus: true, savedTrip: over, now })).toBeNull();
  });

  it('labels Near me by the Travel Mode city', () => {
    expect(nearLabel(null)).toBe('Near me');
    expect(nearLabel('Miami')).toBe('Near Miami');
  });
});
