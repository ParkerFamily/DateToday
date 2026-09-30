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
  where,
  type Timestamp,
} from 'firebase/firestore';
import { cleanAfterHoursTags, type AfterHoursTag } from '@/constants/afterHours';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import { calculateAge } from '@/utils/time';
import type {
  DiscoveryCard,
  FoodCuisine,
  LiveSession,
  ProfileVideoKind,
  RadiusMiles,
  TonightActivity,
  VerificationStatus,
} from '@/types';
import { analytics } from '@/lib/analytics';

/** ~0.7 mi precision — enough for distance, not a street pin. */
function approxCoord(n: number): number {
  return Math.round(n * 100) / 100;
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
  const userSnap = await getDoc(doc(getDb(), 'users', uid));
  const u = (userSnap.data() ?? {}) as Record<string, unknown>;
  if (!u.mainPhotoUrl || !u.displayName) return;
  await setDoc(
    doc(getDb(), 'nearbyProfiles', uid),
    {
      userId: uid,
      latitude: approxCoord(coords.latitude),
      longitude: approxCoord(coords.longitude),
      lastActiveAt: serverTimestamp(),
      ...publicCardFields(u),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
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

  const userSnap = await getDoc(doc(getDb(), 'users', uid));
  const u = (userSnap.data() ?? {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const lat = approxCoord(input.latitude);
  const lng = approxCoord(input.longitude);

  const laterHour =
    input.laterTonightHour != null && input.laterTonightHour >= 18
      ? input.laterTonightHour
      : null;
  const afterHours = cleanAfterHoursTags(input.afterHours);

  const payload = {
    userId: uid,
    status: 'active',
    startedAt: nowIso,
    expiresAt: input.expiresAt,
    endedAt: null,
    radiusMiles: input.radiusMiles,
    latitude: lat,
    longitude: lng,
    availableFrom: input.availableFrom ?? null,
    availableUntil: input.availableUntil ?? input.expiresAt,
    availabilityLabel: input.availabilityLabel ?? null,
    activities: input.activities,
    foodCuisines: input.foodCuisines ?? [],
    laterTonightHour: laterHour,
    availabilityMode: laterHour != null ? 'later' : 'live',
    isBoosted: Boolean(input.isBoosted),
    boostedAt: input.isBoosted ? nowIso : null,
    afterHours,
    ...publicCardFields(u),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(getDb(), 'liveSessions', uid), payload, { merge: true });
  analytics.track('go_live_completed');
  void publishNearbyPresence({ latitude: input.latitude, longitude: input.longitude }).catch(() => undefined);

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
    activities: input.activities,
    foodCuisines: input.foodCuisines,
    laterTonightHour: laterHour,
    availabilityMode: laterHour != null ? 'later' : 'live',
    isBoosted: Boolean(input.isBoosted),
    boostedAt: input.isBoosted ? nowIso : null,
    afterHours,
  };
}

export async function endFirestoreLiveSession(uid?: string): Promise<void> {
  const auth = getFirebaseAuth();
  const id = uid ?? auth.currentUser?.uid;
  if (!id) return;
  await setDoc(
    doc(getDb(), 'liveSessions', id),
    {
      status: 'ended',
      endedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
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
  >
>;

/** Push local edits (details, Plus extension, Boost) to the beacon other people see. */
export async function updateMyLiveSession(patch: LiveSessionPatch): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await setDoc(doc(getDb(), 'liveSessions', uid), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * The beacon copies public profile fields when you go live; mirror later profile edits
 * (new videos, interests) so people already browsing see them. No-op when not live.
 */
export async function refreshLiveProfileFields(fields: Record<string, unknown>): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const [live, nearby] = await Promise.all([
    getDoc(doc(getDb(), 'liveSessions', uid)),
    getDoc(doc(getDb(), 'nearbyProfiles', uid)),
  ]);
  const patch = { ...fields, updatedAt: serverTimestamp() };
  await Promise.all([
    live.exists() && live.data()?.status === 'active'
      ? setDoc(doc(getDb(), 'liveSessions', uid), patch, { merge: true })
      : null,
    nearby.exists() ? setDoc(doc(getDb(), 'nearbyProfiles', uid), patch, { merge: true }) : null,
  ]);
}

/** The signed-in user's session if it's still active — restores "live" after the OS killed the app. */
export async function fetchMyActiveLiveSession(uid: string): Promise<LiveSession | null> {
  const snap = await getDoc(doc(getDb(), 'liveSessions', uid));
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
    activities: (d.activities as TonightActivity[]) ?? [],
    foodCuisines: (d.foodCuisines as FoodCuisine[]) ?? [],
    laterTonightHour: laterHour,
    availabilityMode: laterHour != null ? 'later' : 'live',
    isBoosted: Boolean(d.isBoosted),
    boostedAt: (d.boostedAt as string | null) ?? null,
    afterHours: cleanAfterHoursTags(d.afterHours),
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
  const q = query(collection(getDb(), 'liveSessions'), where('status', '==', 'active'));
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

  const mySnap = await getDoc(doc(getDb(), 'liveSessions', me));
  let mine = mySnap.data();
  let myRadius: number;
  if (mine && mine.status === 'active') {
    myRadius = Number(mine.radiusMiles ?? 10);
  } else {
    mine = (await getDoc(doc(getDb(), 'nearbyProfiles', me))).data();
    if (!mine) return [];
    myRadius = browseRadiusMiles;
  }

  const myLat = Number(mine.latitude);
  const myLng = Number(mine.longitude);
  if (!Number.isFinite(myLat) || !Number.isFinite(myLng)) return [];

  const q = query(collection(getDb(), 'liveSessions'), where('status', '==', 'active'));
  const snap = await getDocs(q);
  const now = Date.now();
  const cards: DiscoveryCard[] = [];

  for (const docSnap of snap.docs) {
    if (docSnap.id === me) continue;
    const d = docSnap.data() as Record<string, unknown>;
    const expiresAt = tsToIso(d.expiresAt);
    if (new Date(expiresAt).getTime() <= now) continue;

    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const theirRadius = Number(d.radiusMiles ?? 10);
    const dist = milesBetween(
      { latitude: myLat, longitude: myLng },
      { latitude: lat, longitude: lng },
    );
    const maxAllowed = Math.min(myRadius, theirRadius);
    if (dist > maxAllowed) continue;
    if (!wantsToSee(mine, d) || !wantsToSee(d, mine)) continue;

    const laterHour =
      typeof d.laterTonightHour === 'number' ? d.laterTonightHour : null;
    // "Free after 8" becomes live once 8 PM arrives.
    const mode = laterHour != null && laterHour > new Date().getHours() ? 'later' : 'live';

    cards.push({
      ...cardBase(docSnap.id, d, dist),
      liveSessionId: docSnap.id,
      liveUntil: expiresAt,
      availabilityLabel: (d.availabilityLabel as string | null) ?? null,
      activities: (d.activities as TonightActivity[]) ?? [],
      foodCuisines: (d.foodCuisines as FoodCuisine[]) ?? [],
      isBoosted: Boolean(d.isBoosted),
      rankScore: d.isBoosted ? 10 : 1,
      availabilityMode: mode,
      laterTonightHour: laterHour,
      startedAt: d.startedAt ? tsToIso(d.startedAt) : null,
      afterHours: cleanAfterHoursTags(d.afterHours),
    });

    if (cards.length >= limit) break;
  }

  const liveIds = new Set(cards.map((c) => c.userId));
  const nearby = await fetchNearbyCards(me, mine, myRadius, liveIds, limit).catch(() => []);
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
): Promise<DiscoveryCard[]> {
  const myLat = Number(mine.latitude);
  const myLng = Number(mine.longitude);
  const since = FsTimestamp.fromMillis(Date.now() - NEARBY_ACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const snap = await getDocs(
    query(
      collection(getDb(), 'nearbyProfiles'),
      where('lastActiveAt', '>=', since),
      orderBy('lastActiveAt', 'desc'),
      limitTo(200),
    ),
  );
  const out: DiscoveryCard[] = [];
  for (const docSnap of snap.docs) {
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
