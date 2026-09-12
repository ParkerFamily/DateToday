import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LiveSession } from '@/types';
import { useSessionStore } from '@/store/session';
import { isPlusActive } from '@/lib/entitlements';
import { clampLiveExpiration } from '@/utils/time';

const BOOST_KEY = 'datetoday.tonightBoost.v1';

type BoostRecord = {
  sessionId: string;
  boostedAt: string;
};

async function readBoost(): Promise<BoostRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(BOOST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BoostRecord;
  } catch {
    return null;
  }
}

async function writeBoost(record: BoostRecord | null): Promise<void> {
  if (!record) {
    await AsyncStorage.removeItem(BOOST_KEY);
    return;
  }
  await AsyncStorage.setItem(BOOST_KEY, JSON.stringify(record));
}

/** Apply a purchased Tonight Boost to the current Ping session. */
export async function activateTonightBoost(): Promise<LiveSession> {
  const session = useSessionStore.getState().liveSession;
  if (!session || session.status !== 'active' || session.endedAt) {
    throw new Error('Start a Ping before buying Tonight Boost.');
  }
  const boostedAt = new Date().toISOString();
  const next: LiveSession = {
    ...session,
    isBoosted: true,
    boostedAt,
  };
  useSessionStore.getState().setLiveSession(next);
  await writeBoost({ sessionId: session.id, boostedAt });
  return next;
}

/** Clear Boost when Ping ends (or session id rotates). */
export async function clearTonightBoost(): Promise<void> {
  const session = useSessionStore.getState().liveSession;
  if (session?.isBoosted) {
    useSessionStore.getState().setLiveSession({
      ...session,
      isBoosted: false,
      boostedAt: null,
    });
  }
  await writeBoost(null);
}

/** Rehydrate Boost flag after app relaunch for the same Ping session. */
export async function hydrateTonightBoostForSession(
  session: LiveSession | null,
): Promise<LiveSession | null> {
  if (!session) return null;
  const record = await readBoost();
  if (!record || record.sessionId !== session.id) {
    return { ...session, isBoosted: false, boostedAt: null };
  }
  const next = { ...session, isBoosted: true, boostedAt: record.boostedAt };
  useSessionStore.getState().setLiveSession(next);
  return next;
}

/**
 * When DateToday+ unlocks mid-Ping, remove the free-minute clamp and restore
 * the user's chosen availability window (capped at 12h).
 */
export function extendPingForPlusUnlock(): LiveSession | null {
  const { liveSession, entitlements, setLiveSession } = useSessionStore.getState();
  if (!liveSession || !isPlusActive(entitlements)) return liveSession;
  if (liveSession.status !== 'active' || liveSession.endedAt) return liveSession;

  const started = new Date(liveSession.startedAt);
  const preferred = liveSession.availableUntil
    ? new Date(liveSession.availableUntil)
    : new Date(Date.now() + 4 * 60 * 60 * 1000);
  let nextExpires: Date;
  try {
    nextExpires = clampLiveExpiration(
      preferred.getTime() > Date.now()
        ? preferred
        : new Date(Date.now() + 4 * 60 * 60 * 1000),
      started,
    );
  } catch {
    nextExpires = new Date(Date.now() + 4 * 60 * 60 * 1000);
  }

  // Only extend — never shorten an already-longer Plus window.
  if (nextExpires.getTime() <= new Date(liveSession.expiresAt).getTime()) {
    return liveSession;
  }

  const next: LiveSession = {
    ...liveSession,
    expiresAt: nextExpires.toISOString(),
    availableUntil: nextExpires.toISOString(),
    availabilityLabel: liveSession.availabilityLabel ?? 'DateToday+',
  };
  setLiveSession(next);
  return next;
}

/** Discovery rank: Boosted first, then Priority Pool (Plus) compatibility. */
export function compareDiscoveryRank(
  a: { isBoosted: boolean; distanceMiles: number; compatScore: number },
  b: { isBoosted: boolean; distanceMiles: number; compatScore: number },
  opts: { priorityPool: boolean },
): number {
  if (a.isBoosted !== b.isBoosted) return a.isBoosted ? -1 : 1;
  if (opts.priorityPool) {
    // Stronger weight on tonight compatibility for Plus Priority Pool.
    const wa = a.compatScore * 3 - a.distanceMiles * 0.05;
    const wb = b.compatScore * 3 - b.distanceMiles * 0.05;
    if (wb !== wa) return wb - wa;
  } else {
    if (b.compatScore !== a.compatScore) return b.compatScore - a.compatScore;
  }
  return a.distanceMiles - b.distanceMiles;
}
