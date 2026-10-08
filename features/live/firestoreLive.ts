import {
  collection,
  deleteDoc,
  doc,
  documentId,
  limit as limitTo,
  orderBy,
  Timestamp as FsTimestamp,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  endAt,
  startAt,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { geohashForLocation, geohashQueryBounds } from 'geofire-common';
import { cleanAfterHoursTags, type AfterHoursTag } from '@/constants/afterHours';
import { cleanEnergy, cleanPlanIdea, cleanTravel, traitFields } from '@/constants/datingTraits';
import { getDb, getFirebaseAuth, withReconnect } from '@/lib/firebase/client';
import { calculateAge } from '@/utils/time';
import type {
  DiscoveryCard,
  FoodCuisine,
  LiveSession,
  ProfileVideoKind,
  RadiusMiles,
  TonightActivity,
  TonightEnergy,
  TravelPref,
  TravelTrip,
  VerificationStatus,
} from '@/types';
import { analytics } from '@/lib/analytics';
import { isStaleLive } from '@/features/live/freeUntil';
import { cleanTrip, cleanTripBadge, tripPhase } from '@/features/travel/trip';

/** Timeout wrapper for Firebase operations to prevent infinite hanging. */
function withTimeout<T>(promise: Promise<T>, timeoutMs = 15000, operation = 'Firebase operation'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operation} timed out after ${timeoutMs}ms. Check your internet connection.`)),
        timeoutMs
      )
    ),
  ]);
}

/** ~0.7 mi precision — enough for distance, not a street pin. */
function approxCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Must match `geohashOf` in functions/index.js, which backfills docs written by older app versions. */
export function geohashOf(latitude: number, longitude: number): string {
  return geohashForLocation([latitude, longitude], 9);
}

const METERS_PER_MILE = 1609.344;
const MAX_PER_GEOHASH_RANGE = 300;

type Snap = QueryDocumentSnapshot<DocumentData>;

/**
 * Docs stored within `miles` of a point, searched by geohash so busy places elsewhere can't crowd
 * out the viewer's area. Results can sit slightly past `miles`; callers still check real distance.
 */
async function docsNear(
  name: 'liveSessions' | 'nearbyProfiles',
  center: { latitude: number; longitude: number },
  miles: number,
  legacy: () => Promise<Snap[]>,
): Promise<Snap[]> {
  try {
    const bounds = geohashQueryBounds([center.latitude, center.longitude], miles * METERS_PER_MILE);
    const snaps = await Promise.all(
      bounds.map(([start, end]) =>
        getDocs(
          query(
            collection(getDb(), name),
            orderBy('geohash'),
            startAt(start),
            endAt(end),
            limitTo(MAX_PER_GEOHASH_RANGE),
          ),
        ),
      ),
    );
    const byId = new Map<string, Snap>();
    for (const s of snaps) for (const d of s.docs) byId.set(d.id, d);
    return [...byId.values()];
  } catch {
    return legacy();
  }
}

/** Where this phone is right now; the stored copy is rounded and can be hours old. */
async function deviceCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const Location = await import('expo-location');
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
    if (last) return last.coords;
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]);
    return fresh?.coords ?? null;
  } catch {
    return null;
  }
}

/** Keeps an active Live beacon where the person actually is, so others see a true distance. */
export async function refreshLiveLocation(coords: { latitude: number; longitude: number }): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const ref = doc(getDb(), 'liveSessions', uid);
  const snap = await getDoc(ref);
  const d = snap.data();
  // Travel Mode beacons stay pinned to the trip city.
  if (!d || d.status !== 'active' || d.trip) return;
  const lat = approxCoord(coords.latitude);
  const lng = approxCoord(coords.longitude);
  if (Number(d.latitude) === lat && Number(d.longitude) === lng) return;
  await setDoc(
    ref,
    { latitude: lat, longitude: lng, geohash: geohashOf(lat, lng), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

function milesBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type PublishLiveInput = {
  latitude: number;
  longitude: number;
  radiusMiles: RadiusMiles;
  expiresAt: string;
  activities: TonightActivity[];
  foodCuisines?: FoodCuisine[];
  availableFrom?: string | null;
  availableUntil?: string | null;
  availabilityLabel?: string | null;
  /** Local hour 18–21 when free later; null = live now. */
  laterTonightHour?: number | null;
  isBoosted?: boolean;
  afterHours?: AfterHoursTag[];
  energy?: TonightEnergy | null;
  travel?: TravelPref | null;
  planIdea?: string | null;
  liveDurationMs?: number;
  nightResetAt?: string | null;
  /** Travel Mode: latitude/longitude are this city's center. */
  trip?: TravelTrip | null;
};

function videoPromptsFromUser(d: Record<string, unknown>): DiscoveryCard['videoPrompts'] {
  const out: DiscoveryCard['videoPrompts'] = [];
  if (d.tonightVideoUrl) {
    out.push({
      promptId: String(d.tonightPromptId ?? 'tonight'),
      promptText: String(d.tonightPromptText ?? "What's the move tonight?"),
      kind: 'tonight_signature' as ProfileVideoKind,
      videoUrl: String(d.tonightVideoUrl),
      thumbnailUrl: (d.mainPhotoUrl as string | null) ?? null,
      durationSeconds: 15,
    });
  }
  if (d.aboutVideoUrl) {
    out.push({
      promptId: String(d.aboutPromptId ?? 'about'),
      promptText: String(d.aboutPromptText ?? 'A little about me'),
      kind: 'about_you' as ProfileVideoKind,
      videoUrl: String(d.aboutVideoUrl),
      thumbnailUrl: (d.mainPhotoUrl as string | null) ?? null,
      durationSeconds: 15,
    });
  }
  return out;
}

/** Main photo first, then the rest, max 3; docs written before photoUrls existed fall back to the main photo. */
function cardPhotos(d: Record<string, unknown>): string[] {
  const main = typeof d.mainPhotoUrl === 'string' && d.mainPhotoUrl ? d.mainPhotoUrl : null;
  const list = Array.isArray(d.photoUrls)
    ? (d.photoUrls as unknown[]).filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
    : [];
  return [...new Set([...(main ? [main] : []), ...list])].slice(0, 3);
}

/** Public card fields copied from private users/{uid} onto live + nearby docs. */
function publicCardFields(u: Record<string, unknown>) {
  let age = 21;
  try {
    if (typeof u.dateOfBirth === 'string' && u.dateOfBirth) {
      age = calculateAge(u.dateOfBirth);
    }
  } catch {
    /* keep default */
  }
  return {
    quizLevel: Number((u.quiz as { level?: unknown } | undefined)?.level) || 0,
    displayName: String(u.displayName ?? 'Member'),
    age,
    neighborhoodLabel: (u.neighborhoodLabel as string | null) ?? null,
    mainPhotoUrl: (u.mainPhotoUrl as string | null) ?? null,
    photoUrls: cardPhotos(u),
    verificationStatus: (u.verificationStatus as string) ?? 'unverified',
    datingIntention: (u.datingIntention as string | null) ?? null,
    bio: (u.bio as string | null) ?? null,
    heightCm: typeof u.heightCm === 'number' ? u.heightCm : null,
    drinking: (u.drinking as string | null) ?? null,
    smoking: (u.smoking as string | null) ?? null,
    interests: Array.isArray(u.interests) ? (u.interests as string[]).slice(0, 10) : [],
    kids: (u.kids as string | null) ?? null,
    exercise: (u.exercise as string | null) ?? null,
    occupation: (u.occupation as string | null) ?? null,
    school: (u.school as string | null) ?? null,
    ...traitFields(u),
    // Needed so both people's "show me" preferences can be honored in the feed.
    gender: (u.gender as string | null) ?? null,
    interestedIn: (u.interestedIn as string | null) ?? 'everyone',
    aboutVideoUrl: (u.aboutVideoUrl as string | null) ?? null,
    tonightVideoUrl: (u.tonightVideoUrl as string | null) ?? null,
    aboutPromptId: (u.aboutPromptId as string | null) ?? null,
    aboutPromptText: (u.aboutPromptText as string | null) ?? null,
    tonightPromptId: (u.tonightPromptId as string | null) ?? null,
    tonightPromptText: (u.tonightPromptText as string | null) ?? null,
  };
}

/**
 * Non-live presence so the feed isn't empty when few people are live: approximate location +
 * last active time. Only written for people who allow discovery and already granted location.
 */
export async function publishNearbyPresence(coords: { latitude: number; longitude: number }): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const userSnap = await withTimeout(getDoc(doc(getDb(), 'users', uid)), 10000, 'Fetch user profile');
  const u = (userSnap.data() ?? {}) as Record<string, unknown>;
  if (!u.mainPhotoUrl || !u.displayName) return;
  const latitude = approxCoord(coords.latitude);
  const longitude = approxCoord(coords.longitude);
  await withTimeout(
    setDoc(
      doc(getDb(), 'nearbyProfiles', uid),
      {
        userId: uid,
        latitude,
        longitude,
        geohash: geohashOf(latitude, longitude),
        lastActiveAt: serverTimestamp(),
        ...publicCardFields(u),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
    10000,
    'Update nearby presence'
  );
}

export async function removeNearbyPresence(): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(getDb(), 'nearbyProfiles', uid)).catch(() => undefined);
}

/**
 * Publish / refresh the signed-in user's live beacon in Firestore.
 * Denormalizes public profile fields so Ping can read without private users/{uid}.
 */
export async function publishLiveSession(input: PublishLiveInput): Promise<LiveSession> {
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to Go Live.');

  const userSnap = await withReconnect(() =>
    withTimeout(getDoc(doc(getDb(), 'users', uid)), 8000, 'Fetch your profile'),
  );
  const u = (userSnap.data() ?? {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const trip = cleanTrip(input.trip);
  const lat = approxCoord(trip ? trip.latitude : input.latitude);
  const lng = approxCoord(trip ? trip.longitude : input.longitude);
  const tripDoc = trip ? { ...trip, latitude: lat, longitude: lng, region: trip.region ?? null } : null;
  const upcomingTrip = trip != null && tripPhase(trip) === 'upcoming';

  const laterHour =
    !upcomingTrip && input.laterTonightHour != null && input.laterTonightHour >= 18
      ? input.laterTonightHour
      : null;
  const afterHours = cleanAfterHoursTags(input.afterHours);
  const energy = cleanEnergy(input.energy);
  const travel = cleanTravel(input.travel);
  const planIdea = cleanPlanIdea(input.planIdea);

  const payload = {
    userId: uid,
    status: 'active',
    startedAt: nowIso,
    confirmedAt: nowIso,
    expiresAt: input.expiresAt,
    endedAt: null,
    endedReason: null,
    radiusMiles: input.radiusMiles,
    latitude: lat,
    longitude: lng,
    geohash: geohashOf(lat, lng),
    availableFrom: input.availableFrom ?? null,
    availableUntil: input.availableUntil ?? input.expiresAt,
    availabilityLabel: input.availabilityLabel ?? null,
    liveDurationMs: input.liveDurationMs ?? null,
    nightResetAt: input.nightResetAt ?? null,
    activities: input.activities,
    foodCuisines: input.foodCuisines ?? [],
    laterTonightHour: laterHour,
    availabilityMode: laterHour != null ? 'later' : 'live',
    isBoosted: Boolean(input.isBoosted),
    boostedAt: input.isBoosted ? nowIso : null,
    afterHours,
    energy,
    travel,
    planIdea,
    trip: tripDoc,
    ...publicCardFields(u),
    updatedAt: serverTimestamp(),
  };

  await withReconnect(() =>
    withTimeout(setDoc(doc(getDb(), 'liveSessions', uid), payload, { merge: true }), 12000, 'Go live'),
  );
  analytics.track('go_live_completed');
  // Keeps them discoverable once Live ends — only if they allow showing up when not Live.
  // Never from a trip city: nearby presence means where you actually are.
  const privacy = (u.privacyControls ?? {}) as { showInDiscovery?: boolean; pauseDiscovery?: boolean };
  if (!trip && privacy.showInDiscovery !== false && privacy.pauseDiscovery !== true) {
    void publishNearbyPresence({ latitude: input.latitude, longitude: input.longitude }).catch(() => undefined);
  }

  return {
    id: uid,
    userId: uid,
    startedAt: nowIso,
    expiresAt: input.expiresAt,
    endedAt: null,
    status: 'active',
    radiusMiles: input.radiusMiles,
    availableFrom: input.availableFrom ?? null,
    availableUntil: input.availableUntil ?? input.expiresAt,
    availabilityLabel: input.availabilityLabel ?? null,
    liveDurationMs: input.liveDurationMs,
    nightResetAt: input.nightResetAt ?? null,
    activities: input.activities,
    foodCuisines: input.foodCuisines,
    laterTonightHour: laterHour,
    availabilityMode: laterHour != null ? 'later' : 'live',
    isBoosted: Boolean(input.isBoosted),
    boostedAt: input.isBoosted ? nowIso : null,
    afterHours,
    confirmedAt: nowIso,
    energy,
    travel,
    planIdea,
    trip: tripDoc,
  };
}

export async function endFirestoreLiveSession(uid?: string): Promise<void> {
  const auth = getFirebaseAuth();
  const id = uid ?? auth.currentUser?.uid;
  if (!id) return;
  const endedAt = new Date().toISOString();
  await withReconnect(() =>
    withTimeout(
      setDoc(
        doc(getDb(), 'liveSessions', id),
        { status: 'ended', endedAt, updatedAt: serverTimestamp() },
        { merge: true },
      ),
      10000,
      'End live session',
    ),
  );
  analytics.track('go_live_ended');
}

export type LiveSessionPatch = Partial<
  Pick<
    LiveSession,
    | 'activities'
    | 'foodCuisines'
    | 'radiusMiles'
    | 'availabilityLabel'
    | 'availableUntil'
    | 'expiresAt'
    | 'isBoosted'
    | 'boostedAt'
    | 'afterHours'
    | 'confirmedAt'
    | 'energy'
    | 'travel'
    | 'planIdea'
  >
>;

/** Push local edits (details, Plus extension, Boost) to the beacon other people see. */
export async function updateMyLiveSession(patch: LiveSessionPatch): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await withReconnect(() =>
    withTimeout(
      setDoc(doc(getDb(), 'liveSessions', uid), { ...clean, updatedAt: serverTimestamp() }, { merge: true }),
      10000,
      'Update live session',
    ),
  );
}

/**
 * The beacon copies public profile fields when you go live; mirror later profile edits
 * (new videos, interests) so people already browsing see them. No-op when not live.
 */
export async function refreshLiveProfileFields(fields: Record<string, unknown>): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const [live, nearby] = await Promise.all([
    withTimeout(getDoc(doc(getDb(), 'liveSessions', uid)), 8000, 'Check live session'),
    withTimeout(getDoc(doc(getDb(), 'nearbyProfiles', uid)), 8000, 'Check nearby profile'),
  ]);
  const patch = { ...fields, updatedAt: serverTimestamp() };
  await Promise.all([
    live.exists() && live.data()?.status === 'active'
      ? withTimeout(setDoc(doc(getDb(), 'liveSessions', uid), patch, { merge: true }), 8000, 'Update live profile')
      : null,
    nearby.exists() 
      ? withTimeout(setDoc(doc(getDb(), 'nearbyProfiles', uid), patch, { merge: true }), 8000, 'Update nearby profile')
      : null,
  ]);
}

/** The signed-in user's session if it's still active — restores "live" after the OS killed the app. */
export async function fetchMyActiveLiveSession(uid: string): Promise<LiveSession | null> {
  const snap = await withTimeout(
    getDoc(doc(getDb(), 'liveSessions', uid)),
    10000,
    'Restore live session'
  );
  if (!snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  const expiresAt = tsToIso(d.expiresAt);
  if (d.status !== 'active' || d.endedAt || new Date(expiresAt).getTime() <= Date.now()) return null;
  const laterHour = typeof d.laterTonightHour === 'number' ? d.laterTonightHour : null;
  return {
    id: uid,
    userId: uid,
    startedAt: tsToIso(d.startedAt),
    expiresAt,
    endedAt: null,
    status: 'active',
    radiusMiles: (d.radiusMiles as RadiusMiles) ?? 10,
    availableFrom: (d.availableFrom as string | null) ?? null,
    availableUntil: (d.availableUntil as string | null) ?? expiresAt,
    availabilityLabel: (d.availabilityLabel as string | null) ?? null,
    liveDurationMs: typeof d.liveDurationMs === 'number' ? d.liveDurationMs : undefined,
    nightResetAt: (d.nightResetAt as string | null) ?? null,
    activities: (d.activities as TonightActivity[]) ?? [],
    foodCuisines: (d.foodCuisines as FoodCuisine[]) ?? [],
    laterTonightHour: laterHour,
    availabilityMode: laterHour != null ? 'later' : 'live',
    isBoosted: Boolean(d.isBoosted),
    boostedAt: (d.boostedAt as string | null) ?? null,
    afterHours: cleanAfterHoursTags(d.afterHours),
    confirmedAt: (d.confirmedAt as string | null) ?? null,
    energy: cleanEnergy(d.energy),
    travel: cleanTravel(d.travel),
    planIdea: cleanPlanIdea(d.planIdea),
    trip: cleanTrip(d.trip),
  };
}

function tsToIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'toDate' in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

/** Does `viewer`'s "show me" gender preference include `other`? Missing data = no filter. */
function wantsToSee(viewer: Record<string, unknown>, other: Record<string, unknown>): boolean {
  const pref = viewer.interestedIn;
  const gender = other.gender;
  if (pref === 'men' && gender && gender !== 'man') return false;
  if (pref === 'women' && gender && gender !== 'woman') return false;
  return true;
}

/** Fires whenever someone goes live, updates, or ends — used to refresh the feed in realtime. */
export function subscribeActiveLiveSessions(onChange: () => void) {
  const q = query(
    collection(getDb(), 'liveSessions'), 
    where('status', '==', 'active'),
    limitTo(200)
  );
  let first = true;
  return onSnapshot(
    q,
    (snap) => {
      if (first) {
        first = false;
        return;
      }
      if (snap.docChanges().length) onChange();
    },
    () => undefined,
  );
}

/**
 * Active beacons near the viewer, then non-live nearby people. Client filters by mutual radius +
 * haversine. Viewers who aren't live browse from their nearby presence with `browseRadiusMiles`.
 */
export async function fetchFirestoreDiscoveryFeed(
  limit = 40,
  browseRadiusMiles = 10,
): Promise<DiscoveryCard[]> {
  const auth = getFirebaseAuth();
  const me = auth.currentUser?.uid;
  if (!me) return [];

  const mySnap = await withReconnect(() =>
    withTimeout(getDoc(doc(getDb(), 'liveSessions', me)), 10000, 'Load your location'),
  );
  let mine = mySnap.data();
  let myRadius: number;
  if (mine && mine.status === 'active') {
    myRadius = Number(mine.radiusMiles ?? 10);
  } else {
    mine = (await withTimeout(
      getDoc(doc(getDb(), 'nearbyProfiles', me)),
      10000,
      'Load your profile'
    )).data();
    if (!mine) return [];
    myRadius = browseRadiusMiles;
  }

  // Travel Mode browses the trip city, not wherever the phone is.
  const myTrip = mine.status === 'active' ? cleanTrip(mine.trip) : null;
  const here = await deviceCoords();
  const away = travelAway(myTrip, here);
  const myLat = myTrip?.latitude ?? here?.latitude ?? Number(mine.latitude);
  const myLng = myTrip?.longitude ?? here?.longitude ?? Number(mine.longitude);
  if (!Number.isFinite(myLat) || !Number.isFinite(myLng)) return [];
  if (here && !myTrip && mine.status === 'active') void refreshLiveLocation(here).catch(() => undefined);

  const center = { latitude: myLat, longitude: myLng };
  const found = await withTimeout(
    docsNear('liveSessions', center, myRadius, async () =>
      (await getDocs(query(collection(getDb(), 'liveSessions'), where('status', '==', 'active'), limitTo(200)))).docs,
    ),
    12000,
    'Find people nearby',
  );
  const now = Date.now();
  const cards: DiscoveryCard[] = [];
  // Closest first, so the card limit never drops someone nearer than a person kept.
  const liveDocs = found
    .map((s) => ({ s, dist: milesBetween(center, { latitude: Number(s.get('latitude')), longitude: Number(s.get('longitude')) }) }))
    .filter((x) => Number.isFinite(x.dist))
    .sort((a, b) => a.dist - b.dist);

  for (const { s: docSnap } of liveDocs) {
    if (docSnap.id === me) continue;
    const d = docSnap.data() as Record<string, unknown>;
    if (d.status !== 'active') continue;
    const expiresAt = tsToIso(d.expiresAt);
    if (new Date(expiresAt).getTime() <= now) continue;
    const startedAt = d.startedAt ? tsToIso(d.startedAt) : null;
    // Never answered "Still free tonight?" — shown as a regular nearby profile instead.
    if (isStaleLive({ startedAt, confirmedAt: (d.confirmedAt as string | null) ?? null })) continue;

    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // A traveler's beacon sits at the trip city; without a valid, current trip it can't be labelled honestly.
    const trip = cleanTripBadge(d.trip);
    if (d.trip && (!trip || tripPhase(trip) === 'over')) continue;

    const theirRadius = Number(d.radiusMiles ?? 10);
    const dist = milesBetween(
      { latitude: myLat, longitude: myLng },
      { latitude: lat, longitude: lng },
    );
    const maxAllowed = Math.min(myRadius, theirRadius);
    if (dist > maxAllowed) continue;
    if (!wantsToSee(mine, d) || !wantsToSee(d, mine)) continue;

    const laterHour =
      typeof d.laterTonightHour === 'number' && !(trip && tripPhase(trip) === 'upcoming')
        ? d.laterTonightHour
        : null;
    // "Free after 8" becomes live once 8 PM arrives.
    const mode = laterHour != null && laterHour > new Date().getHours() ? 'later' : 'live';

    cards.push({
      ...cardBase(docSnap.id, d, dist),
      ...awayFields(away, lat, lng),
      liveSessionId: docSnap.id,
      liveUntil: expiresAt,
      freeUntil: d.availableUntil ? tsToIso(d.availableUntil) : null,
      availabilityLabel: (d.availabilityLabel as string | null) ?? null,
      activities: (d.activities as TonightActivity[]) ?? [],
      foodCuisines: (d.foodCuisines as FoodCuisine[]) ?? [],
      isBoosted: Boolean(d.isBoosted),
      rankScore: d.isBoosted ? 10 : 1,
      availabilityMode: mode,
      laterTonightHour: laterHour,
      startedAt,
      confirmedAt: (d.confirmedAt as string | null) ?? null,
      afterHours: cleanAfterHoursTags(d.afterHours),
      energy: cleanEnergy(d.energy),
      travel: cleanTravel(d.travel),
      planIdea: cleanPlanIdea(d.planIdea),
      trip,
    });

    if (cards.length >= limit) break;
  }

  const liveIds = new Set(cards.map((c) => c.userId));
  const nearby = await fetchNearbyCards(
    me,
    { ...mine, latitude: myLat, longitude: myLng },
    myRadius,
    liveIds,
    limit,
    away,
  ).catch(() => []);
  cards.push(...nearby);

  const stats = await fetchUserStats(cards.map((c) => c.userId)).catch(() => new Map());
  for (const c of cards) {
    const s = stats.get(c.userId);
    if (!s) continue;
    c.joinedAt = s.joinedAt;
    c.lastPlanAt = s.lastPlanAt;
    c.replies = s.replies;
    c.fastReplies = s.fastReplies;
  }

  return cards;
}

/**
 * People who aren't live, out to `radiusMiles` (past the Live radius). Backs "Recently active
 * nearby" when no one is live — reading only, so the viewer's own Live session is untouched.
 */
export async function fetchFirestoreNearbyBrowse(radiusMiles: number, limit = 40): Promise<DiscoveryCard[]> {
  const me = getFirebaseAuth().currentUser?.uid;
  if (!me) return [];
  const [liveSnap, nearbySnap] = await Promise.all([
    withTimeout(getDoc(doc(getDb(), 'liveSessions', me)), 10000, 'Load your location'),
    withTimeout(getDoc(doc(getDb(), 'nearbyProfiles', me)), 10000, 'Load your profile'),
  ]);
  const live = liveSnap.data();
  const mine = live && live.status === 'active' ? live : nearbySnap.data();
  if (!mine) return [];
  const myTrip = mine === live ? cleanTrip(live?.trip) : null;
  const here = await deviceCoords();
  const latitude = myTrip?.latitude ?? here?.latitude ?? Number(mine.latitude);
  const longitude = myTrip?.longitude ?? here?.longitude ?? Number(mine.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

  const cards = await fetchNearbyCards(
    me,
    { ...mine, latitude, longitude },
    radiusMiles,
    new Set(),
    limit,
    travelAway(myTrip, here),
  );
  const stats = await fetchUserStats(cards.map((c) => c.userId)).catch(() => new Map<string, UserStats>());
  for (const c of cards) Object.assign(c, stats.get(c.userId));
  return cards;
}

/** Travel Mode only: where the viewer really is (`from` is null if location is off). Never written anywhere. */
type TravelAway = { from: { latitude: number; longitude: number } | null } | null;

function travelAway(
  trip: TravelTrip | null,
  here: { latitude: number; longitude: number } | null,
): TravelAway {
  return trip ? { from: here } : null;
}

function awayFields(away: TravelAway, lat: number, lng: number): Pick<DiscoveryCard, 'awayMiles'> {
  if (!away) return {};
  if (!away.from) return { awayMiles: null };
  return { awayMiles: Math.round(milesBetween(away.from, { latitude: lat, longitude: lng }) * 10) / 10 };
}

/** Profile fields shared by live and nearby cards. */
function cardBase(id: string, d: Record<string, unknown>, dist: number) {
  return {
    userId: String(d.userId ?? id),
    displayName: String(d.displayName ?? 'Member'),
    age: Number(d.age ?? 21),
    neighborhoodLabel: (d.neighborhoodLabel as string | null) ?? null,
    distanceMiles: Math.round(dist * 10) / 10,
    verificationStatus: (d.verificationStatus as VerificationStatus) ?? 'unverified',
    datingIntention: (d.datingIntention as DiscoveryCard['datingIntention']) ?? null,
    bio: (d.bio as string | null) ?? null,
    mainPhotoUrl: (d.mainPhotoUrl as string | null) ?? null,
    photoUrls: cardPhotos(d),
    videoPrompts: videoPromptsFromUser(d),
    heightCm: typeof d.heightCm === 'number' ? d.heightCm : null,
    drinking: (d.drinking as string | null) ?? null,
    smoking: (d.smoking as string | null) ?? null,
    interests: Array.isArray(d.interests) ? (d.interests as string[]) : [],
    kids: (d.kids as string | null) ?? null,
    exercise: (d.exercise as string | null) ?? null,
    quizLevel: Number(d.quizLevel) || 0,
    occupation: (d.occupation as string | null) ?? null,
    school: (d.school as string | null) ?? null,
    ...traitFields(d),
  };
}

export const NEARBY_ACTIVE_DAYS = 14;

/** People in range who aren't live — matchable, but never presented as free tonight. */
async function fetchNearbyCards(
  me: string,
  mine: Record<string, unknown>,
  myRadius: number,
  skip: Set<string>,
  limit: number,
  away: TravelAway = null,
): Promise<DiscoveryCard[]> {
  const myLat = Number(mine.latitude);
  const myLng = Number(mine.longitude);
  const sinceMs = Date.now() - NEARBY_ACTIVE_DAYS * 24 * 60 * 60 * 1000;
  const found = await docsNear('nearbyProfiles', { latitude: myLat, longitude: myLng }, myRadius, async () =>
    (
      await getDocs(
        query(
          collection(getDb(), 'nearbyProfiles'),
          where('lastActiveAt', '>=', FsTimestamp.fromMillis(sinceMs)),
          orderBy('lastActiveAt', 'desc'),
          limitTo(200),
        ),
      )
    ).docs,
  );
  const activeAt = (s: Snap) => {
    const t = s.get('lastActiveAt') as Timestamp | undefined;
    return typeof t?.toMillis === 'function' ? t.toMillis() : 0;
  };
  const recent = found.filter((s) => activeAt(s) >= sinceMs).sort((a, b) => activeAt(b) - activeAt(a));
  const out: DiscoveryCard[] = [];
  for (const docSnap of recent) {
    if (docSnap.id === me || skip.has(docSnap.id)) continue;
    const d = docSnap.data() as Record<string, unknown>;
    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const dist = milesBetween({ latitude: myLat, longitude: myLng }, { latitude: lat, longitude: lng });
    if (dist > myRadius) continue;
    if (!wantsToSee(mine, d) || !wantsToSee(d, mine)) continue;
    out.push({
      ...cardBase(docSnap.id, d, dist),
      ...awayFields(away, lat, lng),
      liveSessionId: '',
      liveUntil: '',
      availabilityLabel: null,
      activities: [],
      foodCuisines: [],
      isBoosted: false,
      rankScore: 0,
      availabilityMode: 'nearby',
      laterTonightHour: null,
      lastActiveAt: d.lastActiveAt ? tsToIso(d.lastActiveAt) : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

type UserStats = Pick<DiscoveryCard, 'joinedAt' | 'lastPlanAt' | 'replies' | 'fastReplies'>;

function optionalIso(value: unknown): string | null {
  return value ? tsToIso(value) : null;
}

/** Server-written signals (reply speed, recent plans, join date) — `in` queries cap at 30 ids. */
async function fetchUserStats(uids: string[]): Promise<Map<string, UserStats>> {
  const out = new Map<string, UserStats>();
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    if (!chunk.length) continue;
    const snap = await getDocs(
      query(collection(getDb(), 'userStats'), where(documentId(), 'in', chunk)),
    );
    for (const d of snap.docs) {
      const s = d.data() as Record<string, unknown>;
      out.set(d.id, {
        joinedAt: optionalIso(s.joinedAt),
        lastPlanAt: optionalIso(s.lastPlanAt),
        replies: Number(s.replies) || 0,
        fastReplies: Number(s.fastReplies) || 0,
      });
    }
  }
  return out;
}
