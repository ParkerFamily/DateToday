/** Late-night intent: set by people going live (free), filtered on by DateToday+. */
export type AfterHoursTag = 'last_minute' | 'still_out' | 'late_meet';

export const AFTER_HOURS_TAGS: { value: AfterHoursTag; label: string }[] = [
  { value: 'last_minute', label: 'Last-minute plans' },
  { value: 'still_out', label: 'Still outside' },
  { value: 'late_meet', label: 'Open to a late-night meet' },
];

export type OutLate = 'late' | '23' | '24';

/** Free-until thresholds; 24 = midnight. */
export const OUT_LATE_OPTIONS: { value: OutLate; label: string; hour: number }[] = [
  { value: 'late', label: '10 PM+', hour: 22 },
  { value: '23', label: '11 PM+', hour: 23 },
  { value: '24', label: 'Midnight+', hour: 24 },
];

export type SpontaneousOption = 'just_live' | 'close_by' | 'free_a_while';

export const SPONTANEOUS_OPTIONS: { value: SpontaneousOption; label: string }[] = [
  { value: 'just_live', label: 'Just went live' },
  { value: 'close_by', label: 'Close by · under 2 mi' },
  { value: 'free_a_while', label: 'Free for a while' },
];

/** Free: how soon they can actually meet. */
export type HowSoon = 'now' | 'hour' | 'later';

export const HOW_SOON_OPTIONS: { value: HowSoon; label: string }[] = [
  { value: 'now', label: 'Right now' },
  { value: 'hour', label: 'Within 1 hour' },
  { value: 'later', label: 'Free later' },
];

export const HOW_SOON_HOUR_MS = 60 * 60 * 1000;

export const JUST_LIVE_MS = 45 * 60 * 1000;
export const CLOSE_BY_MILES = 2;
export const FREE_A_WHILE_MS = 2 * 60 * 60 * 1000;

export const AFTER_HOURS_START_HOUR = 21;
const AFTER_HOURS_END_HOUR = 5;

/** After Hours only exists from 9 PM until 5 AM. */
export function isAfterHours(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= AFTER_HOURS_START_HOUR || h < AFTER_HOURS_END_HOUR;
}

/** `hour` on tonight's evening — after midnight, "tonight" still means the evening that just started. */
export function tonightAt(hour: number, now: Date = new Date()): Date {
  const base = new Date(now);
  if (now.getHours() < AFTER_HOURS_END_HOUR) base.setDate(base.getDate() - 1);
  base.setHours(hour, 0, 0, 0);
  return base;
}

export function cleanAfterHoursTags(value: unknown): AfterHoursTag[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(AFTER_HOURS_TAGS.map((t) => t.value));
  return value.filter((v): v is AfterHoursTag => known.has(v as AfterHoursTag));
}
