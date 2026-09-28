import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
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
import { functionsUrl } from '@/features/matches/api';

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

  const token = await auth.currentUser!.getIdToken();
  const response = await fetch(functionsUrl('activateLive'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  const body = (await response.json()) as {
    session?: { startedAt: string; expiresAt: string };
    error?: string;
  };
  if (!response.ok || !body.session) throw new Error(body.error || 'Could not go Live.');
  const nowIso = body.session.startedAt;
  const expiresAt = body.session.expiresAt;
  const laterHour = input.laterTonightHour != null && input.laterTonightHour >= 18
    ? input.laterTonightHour : null;
  analytics.track('go_live_completed');

  return {
    id: uid,
    userId: uid,
    startedAt: nowIso,
    expiresAt,
    endedAt: null,
    status: 'active',
    radiusMiles: input.radiusMiles,
    availableFrom: input.availableFrom ?? null,
    availableUntil: input.availableUntil ?? expiresAt,
    availabilityLabel: input.availabilityLabel ?? null,
    activities: input.activities,
    foodCuisines: input.foodCuisines,
    laterTonightHour: laterHour,
    availabilityMode: laterHour != null ? 'later' : 'live',
    isBoosted: false,
    boostedAt: null,
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
  >
>;

/** Push local edits (details, Plus extension, Boost) to the beacon other people see. */
export async function updateMyLiveSession(patch: LiveSessionPatch): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).some(key => !['activities', 'foodCuisines', 'availabilityLabel'].includes(key))) {
    throw new Error('Location, radius, expiry and boosts cannot be changed during this Live session.');
  }
  await setDoc(doc(getDb(), 'liveSessions', uid), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
}

/** The protected feed always reads current profile fields from users/{uid}. */
export async function refreshLiveProfileFields(fields: Record<string, unknown>): Promise<void> {
  void fields;
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

/** Fetch the authenticated, server-filtered feed. Never query other beacons directly. */
export async function fetchFirestoreDiscoveryFeed(limit = 40): Promise<DiscoveryCard[]> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to browse Live.');
  const token = await user.getIdToken();
  const response = await fetch(functionsUrl('nearbyLive'), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = (await response.json()) as { candidates?: Record<string, unknown>[]; error?: string };
  if (!response.ok) throw new Error(body.error || 'Nearby people could not be loaded.');
  if (!Array.isArray(body.candidates)) throw new Error('Invalid nearby feed response.');
  return body.candidates.slice(0, limit).map(d => ({
    userId: String(d.uid),
    displayName: String(d.displayName),
    age: Number(d.age),
    neighborhoodLabel: (d.neighborhoodLabel as string | null) ?? null,
    distanceMiles: typeof d.distanceMiles === 'number' ? d.distanceMiles : 0,
    hideDistance: d.hideDistance === true,
    verificationStatus: (d.verificationStatus as VerificationStatus) ?? 'unverified',
    datingIntention: (d.datingIntention as DiscoveryCard['datingIntention']) ?? null,
    bio: (d.bio as string | null) ?? null,
    mainPhotoUrl: (d.mainPhotoUrl as string | null) ?? null,
    liveSessionId: String(d.uid),
    liveUntil: String(d.expiresAt),
    availabilityLabel: (d.availabilityLabel as string | null) ?? null,
    activities: (d.activities as TonightActivity[]) ?? [],
    foodCuisines: (d.foodCuisines as FoodCuisine[]) ?? [],
    isBoosted: d.isBoosted === true,
    rankScore: d.isBoosted === true ? 10 : 1,
    videoPrompts: videoPromptsFromUser(d),
    availabilityMode: d.availabilityMode === 'later' ? 'later' : 'live',
    laterTonightHour: typeof d.laterTonightHour === 'number' ? d.laterTonightHour : null,
    heightCm: typeof d.heightCm === 'number' ? d.heightCm : null,
    drinking: (d.drinking as string | null) ?? null,
    smoking: (d.smoking as string | null) ?? null,
    interests: Array.isArray(d.interests) ? (d.interests as string[]) : [],
    kids: (d.kids as string | null) ?? null,
    exercise: (d.exercise as string | null) ?? null,
  }));
}
