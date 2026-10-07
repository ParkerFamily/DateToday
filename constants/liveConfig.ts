/**
 * Live = actively looking right now. It's a short session, separate from Free Until
 * (how long you're available tonight, used for display + filters).
 * Server mirror: LIVE_SESSION_DEFAULT_MS / clamps in functions/index.js.
 */
export const LIVE_SESSION_MS = 3 * 60 * 60 * 1000;

/** In-app + push "about to end" heads-up window. */
export const LIVE_ENDING_WARN_MS = 15 * 60 * 1000;

/** "Tonight" rolls over at this local hour (same boundary as After Hours and Free Until). */
export const NIGHTLY_RESET_HOUR = 5;

/** Next local nightly cutoff after `now`. Live and tonight-only state never carry past it. */
export function nextNightlyReset(now: Date = new Date()): Date {
  const at = new Date(now);
  at.setHours(NIGHTLY_RESET_HOUR, 0, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** Identifies tonight's evening (the date it started), so tonight-only state can reset. */
export function tonightKey(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < NIGHTLY_RESET_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * When a Live session that starts now ends. "Free later" people start counting from their
 * start hour so they're still Live once they're actually free. Never past the nightly reset.
 */
export function liveSessionExpiry(
  now: Date = new Date(),
  startsAt: Date | null = null,
  durationMs: number = LIVE_SESSION_MS,
): Date {
  const from = startsAt && startsAt.getTime() > now.getTime() ? startsAt : now;
  const end = from.getTime() + durationMs;
  return new Date(Math.min(end, nextNightlyReset(now).getTime()));
}
