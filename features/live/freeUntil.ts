import { clampLiveExpiration } from '@/utils/time';

export type FreeUntilOption = { value: string; label: string; expiresAt: Date };

/** "12 AM+" keeps you live until 2 AM. */
const ENDS = [
  { value: '21', hour: 21, label: '9 PM' },
  { value: '22', hour: 22, label: '10 PM' },
  { value: '23', hour: 23, label: '11 PM' },
  { value: 'late', hour: 26, label: '12 AM+' },
] as const;

const MIN_LIVE_MS = 30 * 60 * 1000;
const FALLBACK_MS = 2 * 60 * 60 * 1000;

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
  if (now.getHours() < 5) evening.setDate(evening.getDate() - 1);

  const out: FreeUntilOption[] = [];
  for (const end of ENDS) {
    if (startHour != null && end.hour <= startHour) continue;
    const at = new Date(evening);
    at.setHours(end.hour, 0, 0, 0);
    if (at.getTime() - now.getTime() < MIN_LIVE_MS) continue;
    out.push({ value: end.value, label: end.label, expiresAt: clampLiveExpiration(at, now) });
  }
  if (out.length) return out;

  const at = new Date(now.getTime() + FALLBACK_MS);
  return [
    {
      value: 'late',
      label: at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      expiresAt: at,
    },
  ];
}

export function pickFreeUntil(options: FreeUntilOption[], value: string | null): FreeUntilOption {
  return (
    options.find((o) => o.value === value) ??
    options.find((o) => o.value === '23') ??
    options[options.length - 1]
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
