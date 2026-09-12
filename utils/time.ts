/**
 * Age helpers — DOB stays private; only age is shown in UI.
 */

export function calculateAge(dateOfBirth: string | Date, now: Date = new Date()): number {
  const dob = typeof dateOfBirth === 'string' ? parseDateOnly(dateOfBirth) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) {
    throw new Error('Invalid date of birth');
  }

  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function isAtLeast18(dateOfBirth: string | Date, now: Date = new Date()): boolean {
  return calculateAge(dateOfBirth, now) >= 18;
}

/** Parse YYYY-MM-DD as local date (avoid UTC shift). */
export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return new Date(value);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, month, day);
}

export function formatDistanceMiles(miles: number): string {
  if (miles < 0.1) return 'Nearby';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function formatLiveUntil(expiresAt: string, now: Date = new Date()): string {
  const end = new Date(expiresAt);
  const sameDay =
    end.getFullYear() === now.getFullYear() &&
    end.getMonth() === now.getMonth() &&
    end.getDate() === now.getDate();

  const time = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `LIVE UNTIL ${time}` : `LIVE UNTIL ${time}`;
}

export function formatRemaining(expiresAt: string, now: Date = new Date()): string {
  const ms = Math.max(0, new Date(expiresAt).getTime() - now.getTime());
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

export function isLiveSessionActive(
  session: { status: string; expiresAt: string; endedAt: string | null },
  now: Date = new Date(),
): boolean {
  return (
    session.status === 'active' &&
    session.endedAt == null &&
    new Date(session.expiresAt).getTime() > now.getTime()
  );
}

export function maxLiveExpiresAt(startedAt: Date = new Date()): Date {
  return new Date(startedAt.getTime() + 12 * 60 * 60 * 1000);
}

export function clampLiveExpiration(expiresAt: Date, startedAt: Date = new Date()): Date {
  const max = maxLiveExpiresAt(startedAt);
  if (expiresAt.getTime() <= startedAt.getTime()) {
    throw new Error('Expiration must be after start');
  }
  return expiresAt.getTime() > max.getTime() ? max : expiresAt;
}
