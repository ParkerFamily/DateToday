import { placesRequest, type LatLng } from '@/features/places/search';
import {
  eventRange,
  type EventWindow,
  type ExploreEvent,
  type ExplorePlace,
  type FoodieStyle,
  type PlaceCategory,
} from '@/features/explore/catalog';

/** Spots for an Explore category. Server-cached per area for a day; open/closed is worked out per request. */
export async function explorePlaces(args: {
  center: LatLng;
  category: PlaceCategory;
  style?: FoodieStyle | null;
  radiusMiles: number;
}) {
  const json = await placesRequest<{ places?: ExplorePlace[]; provider?: 'google' | 'osm' }>(
    {
      mode: 'explore',
      lat: args.center.lat,
      lng: args.center.lng,
      category: args.category,
      style: args.style ?? null,
      radiusMiles: args.radiusMiles,
    },
    { timeoutMs: 40000, slowMessage: 'Places are taking a while. Try again in a moment.' },
  );
  return { places: json.places ?? [], provider: json.provider ?? 'osm' };
}

/** Ticketmaster events nearby for tonight or the next two weeks. */
export async function exploreEvents(args: { center: LatLng; radiusMiles: number; window: EventWindow }) {
  const json = await placesRequest<{ events?: ExploreEvent[]; unavailable?: boolean }>(
    {
      mode: 'events',
      lat: args.center.lat,
      lng: args.center.lng,
      radiusMiles: args.radiusMiles,
      ...eventRange(args.window),
    },
    { timeoutMs: 20000, slowMessage: 'Events are taking a while. Try again in a moment.' },
  );
  if (json.unavailable) throw new Error('Couldn’t load events right now.');
  return json.events ?? [];
}
