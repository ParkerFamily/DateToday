import type { EntitlementState } from '@/lib/entitlements';

export type LimitCheck = { ok: true } | { ok: false; limit: number };

function startOfToday(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Matches created since local midnight (includes ones the other person completed). */
export function matchesCreatedToday(
  matches: readonly { createdAt: Date | null }[],
  now = new Date(),
): number {
  const since = startOfToday(now);
  return matches.filter((m) => (m.createdAt?.getTime() ?? 0) >= since).length;
}

/** Matching is free for everyone. Kept as a gate helper so call sites stay simple. */
export function canMatchToday(
  _entitlements: EntitlementState,
  _matches: readonly { createdAt: Date | null }[],
): LimitCheck {
  return { ok: true };
}

/** Messaging matches is free — no second paywall after a mutual match. */
export async function canMessageMatch(
  _entitlements: EntitlementState,
  _matchId: string,
  _opts: { ongoing?: boolean } = {},
): Promise<LimitCheck> {
  return { ok: true };
}

/** True when the other person has written, or the conversation started before today. */
export function isOngoingConversation(
  messages: readonly { senderId: string; createdAt: Date | null }[],
  myUid: string,
  now = new Date(),
): boolean {
  const since = startOfToday(now);
  return messages.some(
    (m) => m.senderId !== myUid || (m.createdAt != null && m.createdAt.getTime() < since),
  );
}

/** @deprecated Matching/messaging are free; no-op kept for older call sites. */
export async function recordMessagedMatch(_matchId: string): Promise<void> {
  return;
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
