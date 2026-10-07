import { LIVE_ENDING_WARN_MS, NIGHTLY_RESET_HOUR, nextNightlyReset } from '@/constants/liveConfig';
import { clampLiveExpiration } from '@/utils/time';

/** Free Until: availability tonight. Independent of how long the Live session lasts. */
export type FreeUntilOption = { value: string; label: string; expiresAt: Date };

/**
 * "12 AM+" means free until 2 AM. From 11 PM it reads "2 AM" and 3 AM / 4 AM join it,
 * so late choices are always real, on-the-hour times.
 */
const ENDS: { value: string; hour: number; label: string; lateLabel?: string; late?: boolean }[] = [
  { value: '21', hour: 21, label: '9 PM' },
  { value: '22', hour: 22, label: '10 PM' },
  { value: '23', hour: 23, label: '11 PM' },
  { value: 'late', hour: 26, label: '12 AM+', lateLabel: '2 AM' },
  { value: '27', hour: 27, label: '3 AM', late: true },
  { value: '28', hour: 28, label: '4 AM', late: true },
];
const LATE_CHOICES_FROM_HOUR = 23;

const MIN_LIVE_MS = 30 * 60 * 1000;

/** Ask "Still free tonight?" this long after going live (or the last "keep me live"). */
export const RECONFIRM_AFTER_MS = 3 * 60 * 60 * 1000;
/** Unanswered for this long → dropped from Out Tonight until they reconfirm. */
export const STALE_LIVE_MS = 4 * 60 * 60 * 1000;

/**
 * End times still ahead tonight. Past midnight, "tonight" is the previous evening.
 * Free-later people can't end before they start.
 */
export function freeUntilOptions(now: Date = new Date(), startHour: number | null = null): FreeUntilOption[] {
  const evening = new Date(now);
  evening.setHours(0, 0, 0, 0);
  if (now.getHours() < NIGHTLY_RESET_HOUR) evening.setDate(evening.getDate() - 1);

  const lateNight = now.getHours() < NIGHTLY_RESET_HOUR || now.getHours() >= LATE_CHOICES_FROM_HOUR;
  const out: FreeUntilOption[] = [];
  for (const end of ENDS) {
    if (end.late && !lateNight) continue;
    if (end.hour >= 24 + NIGHTLY_RESET_HOUR) continue;
    if (startHour != null && end.hour <= startHour) continue;
    const at = new Date(evening);
    at.setHours(end.hour, 0, 0, 0);
    if (at.getTime() - now.getTime() < MIN_LIVE_MS) continue;
    const label = lateNight && end.lateLabel ? end.lateLabel : end.label;
    out.push({ value: end.value, label, expiresAt: clampLiveExpiration(at, now) });
  }
  if (out.length) return out;

  // Only the last stretch before the nightly reset is left: free until close, on the hour.
  const close = nextNightlyReset(now);
  return [{ value: 'close', label: close.toLocaleTimeString([], { hour: 'numeric' }), expiresAt: close }];
}

export function pickFreeUntil(options: FreeUntilOption[], value: string | null): FreeUntilOption {
  return (
    options.find((o) => o.value === value) ??
    options.find((o) => o.value === '23') ??
    options.find((o) => o.value === 'late') ??
    options[0]
  );
}

/** Last time they told us they're free: an explicit "keep me live", else when they went live. */
export function lastConfirmedMs(session: { startedAt?: string | null; confirmedAt?: string | null }): number {
  const t = new Date(session.confirmedAt ?? session.startedAt ?? '').getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function needsReconfirm(
  session: { startedAt?: string | null; confirmedAt?: string | null; expiresAt: string },
  now: Date = new Date(),
): boolean {
  const last = lastConfirmedMs(session);
  if (!Number.isFinite(last)) return false;
  const left = new Date(session.expiresAt).getTime() - now.getTime();
  return now.getTime() - last >= RECONFIRM_AFTER_MS && left > 20 * 60 * 1000;
}

export function isStaleLive(
  session: { startedAt?: string | null; confirmedAt?: string | null },
  now: Date = new Date(),
): boolean {
  const last = lastConfirmedMs(session);
  return Number.isFinite(last) && now.getTime() - last >= STALE_LIVE_MS;
}

/** Live ends within the heads-up window — offer Stay Live / Go Offline. */
export function liveEndingSoon(session: { expiresAt: string }, now: Date = new Date()): boolean {
  const left = new Date(session.expiresAt).getTime() - now.getTime();
  return left > 0 && left <= LIVE_ENDING_WARN_MS;
}

/** Free Until still ahead tonight, e.g. "Free until 1 AM"; null once it's passed or unknown. */
export function freeUntilLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t) || t <= now.getTime()) return null;
  const d = new Date(t);
  const time = d.getMinutes()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleTimeString([], { hour: 'numeric' });
  return `Free until ${time}`;
}
