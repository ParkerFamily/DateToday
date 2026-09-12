import AsyncStorage from '@react-native-async-storage/async-storage';
import { commerceConfig } from '@/constants/config';
import {
  isPlusActive,
  messageAllowance,
  pingMinutesAllowance,
  type EntitlementState,
} from '@/lib/entitlements';

const STORAGE_KEY = 'datetoday.dailyUsage.v1';

export type DailyUsageSnapshot = {
  /** Local calendar day YYYY-MM-DD */
  day: string;
  pingMsUsed: number;
  messagesSent: number;
  /** ISO start of the current free Ping segment (for crash-safe accounting). */
  activePingStartedAt: string | null;
};

function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function empty(day = todayKey()): DailyUsageSnapshot {
  return {
    day,
    pingMsUsed: 0,
    messagesSent: 0,
    activePingStartedAt: null,
  };
}

let cache: DailyUsageSnapshot | null = null;

async function read(): Promise<DailyUsageSnapshot> {
  const day = todayKey();
  if (cache && cache.day === day) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = empty(day);
      return cache;
    }
    const parsed = JSON.parse(raw) as DailyUsageSnapshot;
    if (!parsed || parsed.day !== day) {
      cache = empty(day);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      return cache;
    }
    cache = {
      day: parsed.day,
      pingMsUsed: Number(parsed.pingMsUsed) || 0,
      messagesSent: Number(parsed.messagesSent) || 0,
      activePingStartedAt:
        typeof parsed.activePingStartedAt === 'string' ? parsed.activePingStartedAt : null,
    };
    return cache;
  } catch {
    cache = empty(day);
    return cache;
  }
}

async function write(next: DailyUsageSnapshot): Promise<DailyUsageSnapshot> {
  cache = next;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function getDailyUsage(): Promise<DailyUsageSnapshot> {
  return read();
}

/** Remaining free Ping milliseconds today (ignores Plus — callers should check Plus). */
export async function remainingFreePingMs(
  entitlements: EntitlementState,
  now = new Date(),
): Promise<number> {
  const allowance = pingMinutesAllowance(entitlements);
  if (allowance === 'unlimited') return Number.POSITIVE_INFINITY;
  const usage = await read();
  let used = usage.pingMsUsed;
  if (usage.activePingStartedAt) {
    used += Math.max(0, now.getTime() - new Date(usage.activePingStartedAt).getTime());
  }
  const budget = allowance * 60_000;
  return Math.max(0, budget - used);
}

export async function beginPingSegment(now = new Date()): Promise<void> {
  const usage = await read();
  if (usage.activePingStartedAt) return;
  await write({ ...usage, activePingStartedAt: now.toISOString() });
}

/** Fold elapsed active Ping into daily used and clear the open segment. */
export async function endPingSegment(now = new Date()): Promise<DailyUsageSnapshot> {
  const usage = await read();
  if (!usage.activePingStartedAt) return usage;
  const elapsed = Math.max(0, now.getTime() - new Date(usage.activePingStartedAt).getTime());
  return write({
    ...usage,
    pingMsUsed: usage.pingMsUsed + elapsed,
    activePingStartedAt: null,
  });
}

export async function canSendOutgoingMessage(
  entitlements: EntitlementState,
): Promise<{ ok: true } | { ok: false; used: number; limit: number }> {
  if (isPlusActive(entitlements) || messageAllowance(entitlements) === 'unlimited') {
    return { ok: true };
  }
  const limit = entitlements.freeOutgoingMessagesPerDay;
  const usage = await read();
  if (usage.messagesSent >= limit) {
    return { ok: false, used: usage.messagesSent, limit };
  }
  return { ok: true };
}

export async function recordOutgoingMessage(): Promise<number> {
  const usage = await read();
  const next = await write({ ...usage, messagesSent: usage.messagesSent + 1 });
  return next.messagesSent;
}

export function freePingWarningMs(): number {
  return commerceConfig.freePingWarningMinutes * 60_000;
}

/** MM:SS when under 1h, else HH:MM:SS — for “PINGING · 24:17 LEFT”. */
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
