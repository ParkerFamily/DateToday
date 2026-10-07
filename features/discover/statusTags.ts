import { CLOSE_BY_MILES } from '@/constants/afterHours';
import { formatHeight, INTENT_OPTIONS } from '@/features/discover/applyFilters';
import type { DiscoveryCard } from '@/types';

export const ACTIVE_NOW_MS = 20 * 60 * 1000;
export const FREE_TONIGHT_MS = 2 * 60 * 60 * 1000;
export const NEW_HERE_MS = 7 * 24 * 60 * 60 * 1000;
export const RECENT_PLAN_MS = 14 * 24 * 60 * 60 * 1000;
/** Needs a real sample before we claim anything about someone. */
export const FAST_REPLY_MIN_SAMPLE = 5;
export const FAST_REPLY_MIN_RATIO = 0.6;

export type StatusTone = 'live' | 'brand' | 'neutral';
export type StatusTag = { key: string; label: string; tone: StatusTone };

function ms(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

function hourLabel(hour: number): string {
  const h = hour % 12 || 12;
  return `${h} ${hour >= 12 && hour < 24 ? 'PM' : 'AM'}`;
}

export const RECENTLY_ACTIVE_MS = 3 * 60 * 60 * 1000;

export function isLaterTonight(card: Pick<DiscoveryCard, 'availabilityMode'>): boolean {
  return card.availabilityMode === 'later';
}

/** Feed order: live now, then free later tonight, then nearby people who aren't live. */
export function feedTier(card: Pick<DiscoveryCard, 'availabilityMode'>): 0 | 1 | 2 {
  if (card.availabilityMode === 'nearby') return 2;
  return card.availabilityMode === 'later' ? 1 : 0;
}

export function isRecentlyActive(card: DiscoveryCard, now: Date = new Date()): boolean {
  return now.getTime() - ms(card.lastActiveAt) <= RECENTLY_ACTIVE_MS;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Soft activity for people who aren't live. Never implies they want to go out:
 * "Online" (green dot) only means the app was open recently.
 */
export function activityStatus(
  card: Pick<DiscoveryCard, 'lastActiveAt' | 'joinedAt'>,
  now: Date = new Date(),
): { label: string; online: boolean } {
  const last = ms(card.lastActiveAt);
  if (Number.isFinite(last)) {
    if (now.getTime() - last <= ACTIVE_NOW_MS) return { label: 'Online', online: true };
    const lastDate = new Date(last);
    if (sameDay(lastDate, now)) return { label: 'Active today', online: false };
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(lastDate, yesterday)) return { label: 'Active yesterday', online: false };
  }
  if (now.getTime() - ms(card.joinedAt) <= NEW_HERE_MS) return { label: 'New here', online: false };
  if (Number.isFinite(last)) return { label: 'Recently active', online: false };
  return { label: 'Nearby', online: false };
}

/** "Live tonight" is reserved for people who explicitly went live — never derived from app activity. */
export function availabilityText(card: DiscoveryCard, now: Date = new Date()): string {
  if (card.availabilityMode === 'nearby') return activityStatus(card, now).label;
  if (isLaterTonight(card) && card.laterTonightHour != null) {
    return `Free at ${hourLabel(card.laterTonightHour)}`;
  }
  return 'Live tonight';
}

export function repliesFast(card: Pick<DiscoveryCard, 'replies' | 'fastReplies'>): boolean {
  const replies = card.replies ?? 0;
  return replies >= FAST_REPLY_MIN_SAMPLE && (card.fastReplies ?? 0) / replies >= FAST_REPLY_MIN_RATIO;
}

/**
 * Secondary signals under the card's status line. Availability itself (Live tonight / Free at /
 * Active today) is the status line, so it isn't repeated here.
 */
export function cardStatusTags(card: DiscoveryCard, now: Date = new Date(), max = 3): StatusTag[] {
  const nowMs = now.getTime();
  const tier = feedTier(card);
  const tags: StatusTag[] = [];

  if (tier !== 2) {
    if (card.distanceMiles <= CLOSE_BY_MILES) tags.push({ key: 'nearby', label: 'Close by', tone: 'brand' });
    if (tier === 0 && ms(card.freeUntil || card.liveUntil) - nowMs >= FREE_TONIGHT_MS) {
      tags.push({ key: 'tonight', label: 'Free all night', tone: 'brand' });
    }
  }
  if (repliesFast(card)) tags.push({ key: 'replies', label: 'Usually replies fast', tone: 'neutral' });
  if (nowMs - ms(card.lastPlanAt) <= RECENT_PLAN_MS) {
    tags.push({ key: 'plans', label: 'Made plans recently', tone: 'neutral' });
  }
  const newHere = nowMs - ms(card.joinedAt) <= NEW_HERE_MS;
  if (newHere && !(tier === 2 && activityStatus(card, now).label === 'New here')) {
    tags.push({ key: 'new', label: 'New here', tone: 'neutral' });
  }

  return tags.slice(0, max);
}

const OPEN_TO: Record<string, string> = {
  dinner: 'Open to dinner',
  drinks: 'Open to drinks',
  coffee: 'Open to coffee',
  activity: 'Up for an activity',
  chill: 'Down to chill',
  surprise: 'Down for something spontaneous',
};

export function openToLabel(activity: string): string {
  return OPEN_TO[activity] ?? `Open to ${activity}`;
}

const DRINKING: Record<string, string> = {
  Never: 'Doesn’t drink',
  Sometimes: 'Drinks sometimes',
  Socially: 'Drinks socially',
  Often: 'Drinks often',
};

/** The 2–3 permanent traits worth showing on the card; everything else lives on the profile. */
export function keyTraits(card: DiscoveryCard, max = 3): string[] {
  const intent = INTENT_OPTIONS.find((o) => o.value === card.datingIntention)?.label;
  const out = [
    intent ?? null,
    card.heightCm ? formatHeight(card.heightCm) : null,
    card.occupation?.trim() || null,
    card.drinking ? DRINKING[card.drinking] ?? `Drinks: ${card.drinking}` : null,
  ].filter((v): v is string => Boolean(v));
  return out.slice(0, max);
}
