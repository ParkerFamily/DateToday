import { normalizeInterests, sharedInterests } from '@/constants/interests';
import { foodLabel } from '@/constants/tonightVibe';
import type { DiscoverFilterValues } from '@/store/discoverFilters';
import type { DiscoveryCard } from '@/types';

type Opts = { plus: boolean; myInterests?: readonly string[] | null };

export const INTENT_OPTIONS = [
  { value: 'food_company', label: 'Food & company' },
  { value: 'something_fun', label: 'Something fun' },
  { value: 'dating_open', label: 'Dating' },
  { value: 'something_real', label: 'Something real' },
  { value: 'casual', label: 'Casual' },
  { value: 'open_vibe', label: 'Open to the vibe' },
] as const;

export const LIFESTYLE_OPTIONS = ['Never', 'Sometimes', 'Socially', 'Often'] as const;

export function formatHeight(cm: number): string {
  const totalInches = Math.round(cm / 2.54);
  return `${Math.floor(totalInches / 12)}′${totalInches % 12}″`;
}

/**
 * Loose by default: people who haven't filled in a field still show.
 * "Match all" (Plus) makes every rule strict, including missing info.
 */
export function applyDiscoverFilters(
  cards: DiscoveryCard[],
  f: DiscoverFilterValues,
  { plus, myInterests }: Opts,
): DiscoveryCard[] {
  const strict = plus && f.matchAllFilters;
  const wanted = normalizeInterests(f.interestFilter);
  const keep = (value: unknown, test: () => boolean) =>
    value == null || value === '' ? !strict : test();

  return cards.filter((c) => {
    if (f.verifiedOnly && c.verificationStatus !== 'verified') return false;
    if (f.ageMin != null && c.age < f.ageMin) return false;
    if (f.ageMax != null && c.age > f.ageMax) return false;

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

    if (f.freeUntilHour != null && new Date(c.liveUntil).getHours() < f.freeUntilHour) {
      return false;
    }

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
    if (f.videoOnly && !(c.videoPrompts ?? []).some((p) => Boolean(p.videoUrl))) return false;

    return true;
  });
}

/** Short labels for the active-filter chips above the feed. */
export function activeFilterLabels(f: DiscoverFilterValues, { plus }: Opts): string[] {
  const out: string[] = [];
  if (f.verifiedOnly) out.push('Verified');
  if (f.ageMin != null || f.ageMax != null) {
    out.push(`Age ${f.ageMin ?? 18}–${f.ageMax ?? '70+'}`);
  }
  if (f.vibeFilter.length) {
    out.push(f.vibeFilter.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(' / '));
  }
  if (f.foodFilter.length) {
    out.push((plus ? f.foodFilter : f.foodFilter.slice(0, 1)).map(foodLabel).join(' / '));
  }
  if (f.freeUntilHour != null) {
    const h = f.freeUntilHour % 12 || 12;
    out.push(`Free till ${h} ${f.freeUntilHour >= 12 ? 'PM' : 'AM'}+`);
  }
  if (f.sharedInterestsOnly) out.push('Shared interests');
  if (f.interestFilter.length) {
    out.push(
      f.interestFilter.length <= 2
        ? f.interestFilter.join(' / ')
        : `${f.interestFilter.slice(0, 2).join(' / ')} +${f.interestFilter.length - 2}`,
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
    if (f.videoOnly) out.push('Video intro');
    if (f.matchAllFilters) out.push('Match all');
  }
  return out;
}
