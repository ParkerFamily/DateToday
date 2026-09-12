import type { TonightActivity } from '@/types';
import { foodLabel, type FoodCuisine } from '@/constants/tonightVibe';

export interface TonightVibeSnapshot {
  activities: TonightActivity[];
  foodCuisines?: FoodCuisine[];
}

export interface CompatibilityResult {
  score: number;
  sharedActivities: TonightActivity[];
  sharedFood: FoodCuisine[];
  /** Short chip for Discover, e.g. "You both picked Dinner · Italian" */
  cue: string | null;
}

function titleCaseActivity(a: string): string {
  return a.charAt(0).toUpperCase() + a.slice(1);
}

export function tonightCompatibility(
  me: TonightVibeSnapshot,
  them: TonightVibeSnapshot,
): CompatibilityResult {
  const myActs = new Set(me.activities);
  const sharedActivities = them.activities.filter((a) => myActs.has(a));

  const myFood = new Set(me.foodCuisines ?? []);
  const theirFood = them.foodCuisines ?? [];
  const sharedFood = theirFood.filter(
    (f) => myFood.has(f) || myFood.has('anything') || f === 'anything',
  );
  const dinnerOverlap = sharedActivities.includes('dinner');
  const softFood =
    dinnerOverlap &&
    myFood.size > 0 &&
    theirFood.length > 0 &&
    (myFood.has('anything') || theirFood.includes('anything'))
      ? (theirFood.find((f) => f !== 'anything') ??
        [...myFood].find((f) => f !== 'anything') ??
        null)
      : null;

  const foodForCue =
    sharedFood.find((f) => f !== 'anything') ?? softFood ?? sharedFood[0] ?? null;

  let score = sharedActivities.length * 10;
  if (foodForCue) score += 8;
  else if (sharedFood.length) score += 4;
  if (sharedActivities.includes('dinner') && foodForCue) score += 4;

  let cue: string | null = null;
  if (sharedActivities.length) {
    const top = sharedActivities[0];
    if (top === 'dinner' && foodForCue) {
      cue = `You both picked Dinner · ${foodLabel(foodForCue)}`;
    } else if (sharedActivities.length === 1) {
      cue = `You both picked ${titleCaseActivity(top)}`;
    } else {
      cue = `You both want ${sharedActivities.map(titleCaseActivity).join(' + ')}`;
    }
  }

  return {
    score,
    sharedActivities,
    sharedFood: foodForCue
      ? [foodForCue, ...sharedFood.filter((f) => f !== foodForCue)]
      : sharedFood,
    cue,
  };
}

export function sharedFoodHeadline(sharedFood: FoodCuisine[]): string | null {
  const concrete = sharedFood.find((f) => f !== 'anything');
  if (!concrete) return null;
  return `YOU BOTH SAID ${foodLabel(concrete).toUpperCase()}`;
}
