import {
  FREE_FOR_MS,
  FREE_FOR_OPTIONS,
  HOW_SOON_HOUR_MS,
  HOW_SOON_OPTIONS,
  HOW_SOON_SOON_MS,
  isAfterHours,
  JUST_LIVE_MS,
  OUT_LATE_OPTIONS,
  READY_NOW_MS,
  RECENTLY_ACTIVE_MS,
  tonightAt,
  type FreeFor,
  type HowSoon,
} from '@/constants/afterHours';
import { ENERGY_OPTIONS, hasSpotInMind, TRAIT_KEYS, TRAITS, TRAVEL_OPTIONS } from '@/constants/datingTraits';
import { isBroadInterest, normalizeInterests, sharedInterests } from '@/constants/interests';
import { foodLabel } from '@/constants/tonightVibe';
import type { DiscoverFilterValues } from '@/store/discoverFilters';
import type { DiscoveryCard } from '@/types';

type Opts = { plus: boolean; myInterests?: readonly string[] | null; now?: Date };

export const INTENT_OPTIONS = [
  { value: 'food_company', label: 'Food & company' },
  { value: 'something_fun', label: 'Something fun' },
  { value: 'dating_open', label: 'Dating' },
  { value: 'something_real', label: 'Something real' },
  { value: 'casual', label: 'Casual' },
  { value: 'open_vibe', label: 'Open to the vibe' },
] as const;

export const LIFESTYLE_OPTIONS = ['Never', 'Sometimes', 'Socially', 'Often'] as const;

/** What they're down for tonight — `surprise` reads as "Something spontaneous". */
export const DOWN_FOR_OPTIONS = [
  { value: 'drinks', label: 'Drinks' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'activity', label: 'Activity' },
  { value: 'chill', label: 'Chill' },
  { value: 'surprise', label: 'Spontaneous' },
] as const;

export function activityLabel(value: string): string {
  return (
    DOWN_FOR_OPTIONS.find((o) => o.value === value)?.label ??
    value.charAt(0).toUpperCase() + value.slice(1)
  );
}

export function formatHeight(cm: number): string {
  const totalInches = Math.round(cm / 2.54);
  return `${Math.floor(totalInches / 12)}′${totalInches % 12}″`;
}

/** Can this person meet within the "How soon?" window? Live now counts for every window but "later". */
export function matchesHowSoon(c: DiscoveryCard, howSoon: HowSoon, now: Date = new Date()): boolean {
  if (isNearbyOnly(c)) return false;
  const later = c.availabilityMode === 'later';
  if (howSoon === 'now') return !later;
  if (howSoon === 'later') return later;
  if (!later) return true;
  if (c.laterTonightHour == null) return false;
  const window = howSoon === 'soon' ? HOW_SOON_SOON_MS : HOW_SOON_HOUR_MS;
  return tonightAt(c.laterTonightHour, now).getTime() - now.getTime() <= window;
}

/** How much time they have once they're free (from now, or from their "free later" hour). */
export function matchesFreeFor(c: DiscoveryCard, freeFor: FreeFor, now: Date = new Date()): boolean {
  if (isNearbyOnly(c) || !c.liveUntil) return false;
  const until = new Date(c.liveUntil).getTime();
  if (freeFor === 'night') return until >= tonightAt(24, now).getTime();
  const start =
    c.availabilityMode === 'later' && c.laterTonightHour != null
      ? Math.max(now.getTime(), tonightAt(c.laterTonightHour, now).getTime())
      : now.getTime();
  return until - start >= FREE_FOR_MS[freeFor];
}

/** Live tonight, or a nearby profile that opened the app in the last day. */
export function isRecentlyActive(c: DiscoveryCard, now: Date = new Date()): boolean {
  if (!isNearbyOnly(c)) return true;
  const seen = c.lastActiveAt ? new Date(c.lastActiveAt).getTime() : NaN;
  return now.getTime() - seen <= RECENTLY_ACTIVE_MS;
}

/** In range but not live — matchable, never counted as free tonight. */
export function isNearbyOnly(c: Pick<DiscoveryCard, 'availabilityMode'>): boolean {
  return c.availabilityMode === 'nearby';
}

/**
 * Loose by default: people who haven't filled in a field still show.
 * "Match all" (Plus) makes every rule strict, including missing info.
 */
export function applyDiscoverFilters(
  cards: DiscoveryCard[],
  f: DiscoverFilterValues,
  { plus, myInterests, now = new Date() }: Opts,
): DiscoveryCard[] {
  const strict = plus && f.matchAllFilters;
  const nowMs = now.getTime();
  const afterHours = isAfterHours(now);
  const outLateHour = OUT_LATE_OPTIONS.find((o) => o.value === f.outLate)?.hour;
  const outLateAt = outLateHour != null ? tonightAt(outLateHour, now).getTime() : null;
  const wanted = normalizeInterests(f.interestFilter).filter((i) => plus || isBroadInterest(i));
  const keep = (value: unknown, test: () => boolean) =>
    value == null || value === '' ? !strict : test();

  return cards.filter((c) => {
    if (f.verifiedOnly && c.verificationStatus !== 'verified') return false;
    if (f.ageMin != null && c.age < f.ageMin) return false;
    if (f.ageMax != null && c.age > f.ageMax) return false;

    if (f.recentlyActive && !isRecentlyActive(c, now)) return false;

    if (f.vibeFilter.length) {
      const ok = strict
        ? f.vibeFilter.every((v) => c.activities.includes(v))
        : c.activities.some((a) => f.vibeFilter.includes(a));
      if (!ok) return false;
    }

    if (f.foodFilter.length) {
      const foods = plus ? f.foodFilter : f.foodFilter.slice(0, 1);
      const theirs = c.foodCuisines ?? [];
      const ok = strict
        ? foods.every((x) => theirs.includes(x) || theirs.includes('anything'))
        : theirs.some((x) => foods.includes(x) || x === 'anything');
      if (!ok) return false;
    }

    const nearbyOnly = isNearbyOnly(c);
    if (f.howSoon && !matchesHowSoon(c, f.howSoon, now)) return false;
    if (f.freeFor && !matchesFreeFor(c, f.freeFor, now)) return false;
    if (f.energy.length && !keep(c.energy, () => f.energy.includes(c.energy!))) return false;
    if (f.travel.length && !keep(c.travel, () => f.travel.includes(c.travel!))) return false;
    if (f.planInMind && !hasSpotInMind(c.planIdea)) return false;

    // Interest filters are explicit asks, so people with no interests listed don't pass.
    if (wanted.length && !normalizeInterests(c.interests).some((i) => wanted.includes(i))) {
      return false;
    }
    if (f.sharedInterestsOnly && myInterests?.length && !sharedInterests(myInterests, c.interests).length) {
      return false;
    }

    if (!plus) return true;

    if (f.kids.length && !keep(c.kids, () => f.kids.includes(c.kids!))) return false;
    if (f.exercise.length && !keep(c.exercise, () => f.exercise.includes(c.exercise!))) return false;

    if (f.intents.length && !keep(c.datingIntention, () => f.intents.includes(c.datingIntention!))) {
      return false;
    }
    if (f.minHeightCm != null && !keep(c.heightCm, () => c.heightCm! >= f.minHeightCm!)) return false;
    if (f.maxHeightCm != null && !keep(c.heightCm, () => c.heightCm! <= f.maxHeightCm!)) return false;
    if (f.drinking.length && !keep(c.drinking, () => f.drinking.includes(c.drinking!))) return false;
    if (f.smoking.length && !keep(c.smoking, () => f.smoking.includes(c.smoking!))) return false;
    for (const k of TRAIT_KEYS) {
      const wantedTrait = f[k];
      if (wantedTrait.length && !keep(c[k], () => wantedTrait.includes(c[k]!))) return false;
    }
    if (f.videoOnly && !(c.videoPrompts ?? []).some((p) => Boolean(p.videoUrl))) return false;

    if (afterHours) {
      if (nearbyOnly && (outLateAt || f.afterHoursNow || f.lateNightOpen || f.stillOut)) return false;
      if (outLateAt && new Date(c.liveUntil).getTime() < outLateAt) return false;
      if (f.afterHoursNow && c.availabilityMode === 'later') return false;
      if (f.lateNightOpen && !(c.afterHours ?? []).length) return false;
      if (f.stillOut && !(c.afterHours ?? []).includes('still_out')) return false;
    }

    if (f.closeByMiles != null && c.distanceMiles > f.closeByMiles) return false;
    if (f.lastMinute) {
      const started = c.startedAt ? new Date(c.startedAt).getTime() : NaN;
      if (nearbyOnly || !(nowMs - started <= JUST_LIVE_MS)) return false;
    }
    if (f.readyNow) {
      const confirmed = new Date(c.confirmedAt ?? c.startedAt ?? NaN).getTime();
      if (nearbyOnly || c.availabilityMode === 'later' || !(nowMs - confirmed <= READY_NOW_MS)) return false;
    }

    return true;
  });
}

/** Short labels for the active-filter chips above the feed. */
export function activeFilterLabels(f: DiscoverFilterValues, { plus, now = new Date() }: Opts): string[] {
  const out: string[] = [];
  if (f.verifiedOnly) out.push('Verified');
  if (f.recentlyActive) out.push('Recently active');
  if (f.ageMin != null || f.ageMax != null) {
    out.push(`Age ${f.ageMin ?? 18}–${f.ageMax ?? '70+'}`);
  }
  if (f.vibeFilter.length) {
    out.push(f.vibeFilter.map(activityLabel).join(' / '));
  }
  if (f.energy.length) {
    out.push(f.energy.map((e) => ENERGY_OPTIONS.find((o) => o.value === e)?.label ?? e).join(' / '));
  }
  if (f.foodFilter.length) {
    out.push((plus ? f.foodFilter : f.foodFilter.slice(0, 1)).map(foodLabel).join(' / '));
  }
  if (f.howSoon) {
    const label = HOW_SOON_OPTIONS.find((o) => o.value === f.howSoon)?.label;
    if (label) out.push(`⏱ ${label}`);
  }
  if (f.freeFor) {
    const label = FREE_FOR_OPTIONS.find((o) => o.value === f.freeFor)?.label;
    if (label) out.push(`Free ${label.toLowerCase()}`);
  }
  if (f.planInMind) out.push('📍 Plan in mind');
  if (f.travel.length) {
    out.push(f.travel.map((t) => TRAVEL_OPTIONS.find((o) => o.value === t)?.label ?? t).join(' / '));
  }
  if (f.sharedInterestsOnly) out.push('Shared interests');
  const interests = plus ? f.interestFilter : f.interestFilter.filter(isBroadInterest);
  if (interests.length) {
    out.push(
      interests.length <= 2
        ? interests.join(' / ')
        : `${interests.slice(0, 2).join(' / ')} +${interests.length - 2}`,
    );
  }
  if (plus) {
    if (f.kids.length) out.push(`Kids: ${f.kids.join('/')}`);
    if (f.exercise.length) out.push(`Works out: ${f.exercise.join('/')}`);
    if (f.intents.length) {
      out.push(
        f.intents
          .map((i) => INTENT_OPTIONS.find((o) => o.value === i)?.label ?? i)
          .join(' / '),
      );
    }
    if (f.minHeightCm != null || f.maxHeightCm != null) {
      out.push(
        `${f.minHeightCm != null ? formatHeight(f.minHeightCm) : 'Any'}–${
          f.maxHeightCm != null ? formatHeight(f.maxHeightCm) : 'any'
        }`,
      );
    }
    if (f.drinking.length) out.push(`Drinks: ${f.drinking.join('/')}`);
    if (f.smoking.length) out.push(`Smokes: ${f.smoking.join('/')}`);
    for (const k of TRAIT_KEYS) {
      if (f[k].length) out.push(`${TRAITS[k].label}: ${f[k].join('/')}`);
    }
    if (f.videoOnly) out.push('Video intro');
    if (isAfterHours(now)) {
      const late = OUT_LATE_OPTIONS.find((o) => o.value === f.outLate);
      if (late) out.push(`🌙 ${late.label}`);
      if (f.afterHoursNow) out.push('🌙 Available now');
      if (f.lateNightOpen) out.push('🌙 Late-night plans');
      if (f.stillOut) out.push('🌙 Still outside');
    }
    if (f.closeByMiles != null) out.push(`📍 Under ${f.closeByMiles} mi`);
    if (f.lastMinute) out.push('⚡ Last-minute');
    if (f.readyNow) out.push('⚡ Ready now');
    if (f.matchAllFilters) out.push('Exact vibe');
  }
  return out;
}

const LIST_PREFIX: Partial<Record<string, string>> = {
  drinking: 'Drinks',
  smoking: 'Smokes',
  weed: 'Weed',
  exercise: 'Works out',
};

/**
 * Filters you set that this person matches with a real answer — shown on their card.
 * Loose passes (they left the field blank) don't count.
 */
export function matchedFilterLabels(
  c: DiscoveryCard,
  f: DiscoverFilterValues,
  { plus, now = new Date() }: Opts,
): string[] {
  const out: string[] = [];
  const has = <T>(wanted: readonly T[], value: T | null | undefined): value is T =>
    value != null && wanted.includes(value);
  const nearbyOnly = isNearbyOnly(c);

  if (plus && f.readyNow && !nearbyOnly && c.availabilityMode !== 'later') {
    const confirmed = new Date(c.confirmedAt ?? c.startedAt ?? NaN).getTime();
    if (now.getTime() - confirmed <= READY_NOW_MS) out.push('⚡ Ready now');
  }
  if (plus && f.lastMinute && !nearbyOnly) {
    const started = c.startedAt ? new Date(c.startedAt).getTime() : NaN;
    if (now.getTime() - started <= JUST_LIVE_MS) out.push('🆕 Just went live');
  }
  if (f.howSoon && matchesHowSoon(c, f.howSoon, now)) {
    out.push(`⏱ ${HOW_SOON_OPTIONS.find((o) => o.value === f.howSoon)?.label}`);
  }
  if (f.freeFor && matchesFreeFor(c, f.freeFor, now)) {
    out.push(`Free ${FREE_FOR_OPTIONS.find((o) => o.value === f.freeFor)?.label.toLowerCase()}`);
  }
  for (const a of c.activities) if (f.vibeFilter.includes(a)) out.push(activityLabel(a));
  if (has(f.energy, c.energy)) {
    const e = ENERGY_OPTIONS.find((o) => o.value === c.energy)!;
    out.push(`${e.emoji} ${e.label}`);
  }
  if (plus && f.closeByMiles != null && c.distanceMiles <= f.closeByMiles) out.push(`📍 Under ${f.closeByMiles} mi`);
  if (f.planInMind && hasSpotInMind(c.planIdea)) out.push('📍 Has a plan');
  if (has(f.travel, c.travel)) out.push(TRAVEL_OPTIONS.find((o) => o.value === c.travel)!.label);
  const foods = plus ? f.foodFilter : f.foodFilter.slice(0, 1);
  for (const x of c.foodCuisines ?? []) if (foods.includes(x)) out.push(foodLabel(x));

  if (plus && isAfterHours(now) && !nearbyOnly) {
    const late = OUT_LATE_OPTIONS.find((o) => o.value === f.outLate);
    if (late && new Date(c.liveUntil).getTime() >= tonightAt(late.hour, now).getTime()) out.push(`🌙 ${late.label}`);
    if (f.stillOut && (c.afterHours ?? []).includes('still_out')) out.push('🌙 Still outside');
    if (f.lateNightOpen && (c.afterHours ?? []).length) out.push('🌙 Late-night plans');
  }

  const wanted = normalizeInterests(f.interestFilter).filter((i) => plus || isBroadInterest(i));
  for (const i of normalizeInterests(c.interests)) if (wanted.includes(i)) out.push(i);

  if (plus) {
    if (has(f.intents, c.datingIntention)) {
      out.push(INTENT_OPTIONS.find((o) => o.value === c.datingIntention)?.label ?? c.datingIntention);
    }
    if (c.heightCm != null && (f.minHeightCm != null || f.maxHeightCm != null)) {
      const okMin = f.minHeightCm == null || c.heightCm >= f.minHeightCm;
      const okMax = f.maxHeightCm == null || c.heightCm <= f.maxHeightCm;
      if (okMin && okMax) out.push(formatHeight(c.heightCm));
    }
    for (const k of ['drinking', 'smoking', 'exercise', 'kids', ...TRAIT_KEYS] as const) {
      const v = c[k];
      if (!has(f[k], v)) continue;
      const prefix = LIST_PREFIX[k];
      out.push(prefix ? `${prefix}: ${v.toLowerCase()}` : v);
    }
    if (f.videoOnly && (c.videoPrompts ?? []).some((p) => Boolean(p.videoUrl))) out.push('🎥 Video intro');
  }

  return [...new Set(out)];
}
