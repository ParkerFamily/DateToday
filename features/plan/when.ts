import type { PlanCategory } from '@/features/places/search';

export type DayChoice = 'tonight' | 'tomorrow' | 'weekend' | 'pick';

/** Minutes after midnight. */
const SLOTS = Array.from({ length: 30 }, (_, i) => 9 * 60 + i * 30); // 9:00 AM – 11:30 PM

const SUGGESTED: Record<PlanCategory, number[]> = {
  drinks: [19 * 60 + 30, 20 * 60 + 30, 21 * 60 + 30],
  dinner: [18 * 60 + 30, 19 * 60 + 30, 20 * 60 + 30],
  coffee: [10 * 60, 12 * 60, 15 * 60],
  activity: [14 * 60, 17 * 60, 19 * 60 + 30],
};

/** Book at least this far ahead when planning for today. */
const LEAD_MINUTES = 30;

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Upcoming Saturday; on a Saturday that's tomorrow (Sunday) since "Tonight" already covers today. */
export function weekendDate(now: Date) {
  const today = startOfDay(now);
  const dow = today.getDay();
  if (dow === 6) return addDays(today, 1);
  return addDays(today, (6 - dow + 7) % 7 || 7);
}

export function dateForChoice(choice: Exclude<DayChoice, 'pick'>, now: Date) {
  if (choice === 'tonight') return startOfDay(now);
  if (choice === 'tomorrow') return addDays(startOfDay(now), 1);
  return weekendDate(now);
}

/** Days offered under "Pick date": the two weeks after tomorrow. */
export function pickableDays(now: Date, count = 14) {
  return Array.from({ length: count }, (_, i) => addDays(startOfDay(now), i + 2));
}

export function availableSlots(day: Date, now: Date) {
  if (!sameDay(day, now)) return SLOTS;
  const earliest = now.getHours() * 60 + now.getMinutes() + LEAD_MINUTES;
  return SLOTS.filter((m) => m >= earliest);
}

/** Three good times for this kind of date, topped up with the next open slots when it's getting late. */
export function suggestedTimes(category: PlanCategory, day: Date, now: Date) {
  const open = availableSlots(day, now);
  const picks = SUGGESTED[category].filter((m) => open.includes(m));
  for (const m of open) {
    if (picks.length >= 3) break;
    if (!picks.includes(m) && m >= 17 * 60) picks.push(m);
  }
  for (const m of open) {
    if (picks.length >= 3) break;
    if (!picks.includes(m)) picks.push(m);
  }
  return picks.sort((a, b) => a - b);
}

export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function dayLabel(day: Date, minutes: number, now: Date) {
  if (sameDay(day, now)) return minutes >= 17 * 60 ? 'Tonight' : 'Today';
  if (sameDay(day, addDays(startOfDay(now), 1))) return 'Tomorrow';
  return day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function whenLabel(day: Date, minutes: number, now: Date) {
  return `${dayLabel(day, minutes, now)} · ${formatTime(minutes)}`;
}

/** Summary line, e.g. "Tonight at 8:30 PM". */
export function whenSentence(day: Date, minutes: number, now: Date) {
  return `${dayLabel(day, minutes, now)} at ${formatTime(minutes)}`;
}

export function startsAt(day: Date, minutes: number) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
}
