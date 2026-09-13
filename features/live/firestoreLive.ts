import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
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

  let age = 21;
  try {
    if (typeof u.dateOfBirth === 'string' && u.dateOfBirth) {
      age = calculateAge(u.dateOfBirth);
    }
  } catch {
    /* keep default */
  }

  const laterHour =
    input.laterTonightHour != null && input.laterTonightHour >= 18
      ? input.laterTonightHour
      : null;

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
    displayName: String(u.displayName ?? 'Member'),
    age,
    neighborhoodLabel: (u.neighborhoodLabel as string | null) ?? null,
    mainPhotoUrl: (u.mainPhotoUrl as string | null) ?? null,
    verificationStatus: (u.verificationStatus as string) ?? 'unverified',
    datingIntention: (u.datingIntention as string | null) ?? null,
    bio: (u.bio as string | null) ?? null,
    aboutVideoUrl: (u.aboutVideoUrl as string | null) ?? null,
    tonightVideoUrl: (u.tonightVideoUrl as string | null) ?? null,
    aboutPromptId: (u.aboutPromptId as string | null) ?? null,
    aboutPromptText: (u.aboutPromptText as string | null) ?? null,
    tonightPromptId: (u.tonightPromptId as string | null) ?? null,
    tonightPromptText: (u.tonightPromptText as string | null) ?? null,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(getDb(), 'liveSessions', uid), payload, { merge: true });
  analytics.track('go_live_completed');

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

function tsToIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'toDate' in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

/**
 * Active beacons near the viewer. Client filters by mutual radius + haversine.
 * Low early density — keep the query simple (status == active).
 */
export async function fetchFirestoreDiscoveryFeed(limit = 40): Promise<DiscoveryCard[]> {
  const auth = getFirebaseAuth();
  const me = auth.currentUser?.uid;
  if (!me) return [];

  const mySnap = await getDoc(doc(getDb(), 'liveSessions', me));
  const mine = mySnap.data();
  if (!mine || mine.status !== 'active') return [];

  const myLat = Number(mine.latitude);
  const myLng = Number(mine.longitude);
  const myRadius = Number(mine.radiusMiles ?? 10) as RadiusMiles;
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

    const laterHour =
      typeof d.laterTonightHour === 'number' ? d.laterTonightHour : null;
    const mode =
      d.availabilityMode === 'later' || (laterHour != null && laterHour > new Date().getHours())
        ? 'later'
        : 'live';

    cards.push({
      userId: String(d.userId ?? docSnap.id),
      displayName: String(d.displayName ?? 'Member'),
      age: Number(d.age ?? 21),
      neighborhoodLabel: (d.neighborhoodLabel as string | null) ?? null,
      distanceMiles: Math.round(dist * 10) / 10,
      verificationStatus: (d.verificationStatus as VerificationStatus) ?? 'unverified',
      datingIntention: (d.datingIntention as DiscoveryCard['datingIntention']) ?? null,
      bio: (d.bio as string | null) ?? null,
      mainPhotoUrl: (d.mainPhotoUrl as string | null) ?? null,
      liveSessionId: docSnap.id,
      liveUntil: expiresAt,
      availabilityLabel: (d.availabilityLabel as string | null) ?? null,
      activities: (d.activities as TonightActivity[]) ?? [],
      foodCuisines: (d.foodCuisines as FoodCuisine[]) ?? [],
      isBoosted: Boolean(d.isBoosted),
      rankScore: d.isBoosted ? 10 : 1,
      videoPrompts: videoPromptsFromUser(d),
      availabilityMode: mode,
      laterTonightHour: laterHour,
    });

    if (cards.length >= limit) break;
  }

  return cards;
}
