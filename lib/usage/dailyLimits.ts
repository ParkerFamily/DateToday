import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  conversationAllowance,
  matchAllowance,
  type EntitlementState,
} from '@/lib/entitlements';

const STORAGE_KEY = 'datetoday.dailyUsage.v2';

export type DailyUsageSnapshot = {
  /** Local calendar day YYYY-MM-DD */
  day: string;
  /** Matches the user has sent a message in today. */
  messagedMatchIds: string[];
};

export type LimitCheck = { ok: true } | { ok: false; limit: number };

function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfToday(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

let cache: DailyUsageSnapshot | null = null;

async function read(): Promise<DailyUsageSnapshot> {
  const day = todayKey();
  if (cache && cache.day === day) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<DailyUsageSnapshot>) : null;
    cache =
      parsed?.day === day && Array.isArray(parsed.messagedMatchIds)
        ? { day, messagedMatchIds: parsed.messagedMatchIds.map(String) }
        : { day, messagedMatchIds: [] };
  } catch {
    cache = { day, messagedMatchIds: [] };
  }
  return cache;
}

async function write(next: DailyUsageSnapshot): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
}

export async function getDailyUsage(): Promise<DailyUsageSnapshot> {
  return read();
}

/** Matches created since local midnight (includes ones the other person completed). */
export function matchesCreatedToday(
  matches: readonly { createdAt: Date | null }[],
  now = new Date(),
): number {
  const since = startOfToday(now);
  return matches.filter((m) => (m.createdAt?.getTime() ?? 0) >= since).length;
}

/** Free: one new match a day. Checked before sending a heart that could complete a match. */
export function canMatchToday(
  entitlements: EntitlementState,
  matches: readonly { createdAt: Date | null }[],
): LimitCheck {
  const limit = matchAllowance(entitlements);
  if (limit === 'unlimited') return { ok: true };
  return matchesCreatedToday(matches) < limit ? { ok: true } : { ok: false, limit };
}

/** Free: message one person a day — unlimited messages within that conversation. */
export async function canMessageMatch(
  entitlements: EntitlementState,
  matchId: string,
): Promise<LimitCheck> {
  const limit = conversationAllowance(entitlements);
  if (limit === 'unlimited') return { ok: true };
  const usage = await read();
  if (usage.messagedMatchIds.includes(matchId) || usage.messagedMatchIds.length < limit) {
    return { ok: true };
  }
  return { ok: false, limit };
}

export async function recordMessagedMatch(matchId: string): Promise<void> {
  const usage = await read();
  if (usage.messagedMatchIds.includes(matchId)) return;
  await write({ ...usage, messagedMatchIds: [...usage.messagedMatchIds, matchId] });
}

/** MM:SS when under 1h, else HH:MM:SS. */
export function formatPingClock(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
