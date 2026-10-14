import { useEffect } from 'react';
import { getMyLocation, getMyLocationQuietly, type LatLng } from '@/features/places/search';
import { usableTrip } from '@/features/travel/trip';
import { isPlusActive } from '@/lib/entitlements';
import { useSessionStore } from '@/store/session';
import { useTravelMode } from '@/store/travelMode';
import type { LiveSession, TravelTrip } from '@/types';
import { isLiveSessionActive } from '@/utils/time';

/** Where "near me" means right now. `city` is set in Travel Mode, when it isn't where the phone is. */
export type Here = LatLng & { city: string | null };

/**
 * The Travel Mode trip in effect: the one you're Live with, else your saved trip (DateToday+).
 * Live without a trip means you chose to go out where you are, even with a trip saved.
 */
export function travelTripFor(args: {
  liveSession: LiveSession | null;
  plus: boolean;
  savedTrip: TravelTrip | null;
  now?: Date;
}): TravelTrip | null {
  const now = args.now ?? new Date();
  if (args.liveSession && isLiveSessionActive(args.liveSession, now)) return args.liveSession.trip ?? null;
  return args.plus ? usableTrip(args.savedTrip, now) : null;
}

export function useTravelTrip(): TravelTrip | null {
  const userId = useSessionStore((s) => s.userId);
  const liveSession = useSessionStore((s) => s.liveSession);
  const plus = useSessionStore((s) => isPlusActive(s.entitlements));
  const savedTrip = useTravelMode((s) => s.trip);
  useEffect(() => {
    void useTravelMode.getState().hydrate(userId);
  }, [userId]);
  return travelTripFor({ liveSession, plus, savedTrip });
}

async function currentTrip(): Promise<TravelTrip | null> {
  const session = useSessionStore.getState();
  await useTravelMode.getState().hydrate(session.userId);
  return travelTripFor({
    liveSession: session.liveSession,
    plus: isPlusActive(session.entitlements),
    savedTrip: useTravelMode.getState().trip,
  });
}

const fromTrip = (trip: TravelTrip): Here => ({ lat: trip.latitude, lng: trip.longitude, city: trip.city });

/** The Travel Mode city, else this phone. Throws a user-facing message when location is off. */
export async function getHere(): Promise<Here> {
  const trip = await currentTrip();
  if (trip) return fromTrip(trip);
  return { ...(await getMyLocation()), city: null };
}

/** Same as `getHere`, but never prompts for location. */
export async function getHereQuietly(): Promise<Here | null> {
  const trip = await currentTrip();
  if (trip) return fromTrip(trip);
  const me = await getMyLocationQuietly();
  return me ? { ...me, city: null } : null;
}

/** "Near me", or "Near Miami" in Travel Mode so results never read as physically close. */
export function nearLabel(city: string | null | undefined): string {
  return city ? `Near ${city}` : 'Near me';
}
