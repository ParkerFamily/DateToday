import type { ProfileCompletionRequirements } from '@/types';

export function missingLiveRequirements(
  requirements: ProfileCompletionRequirements,
): string[] {
  const labels: Record<keyof ProfileCompletionRequirements, string> = {
    name: 'Add your name',
    age: 'Confirm you are 18+',
    gender: 'Select your gender',
    preference: 'Choose who you are interested in',
    mainPhoto: 'Add a main photo',
    videos: 'Record 2 video prompts (About You + Tonight)',
    location: 'Allow location access',
    communityStandards: 'Accept community standards',
  };

  return (Object.keys(requirements) as (keyof ProfileCompletionRequirements)[])
    .filter((key) => !requirements[key])
    .map((key) => labels[key]);
}

export function isProfileReadyForLive(requirements: ProfileCompletionRequirements): boolean {
  return missingLiveRequirements(requirements).length === 0;
}

export function completionPercent(requirements: ProfileCompletionRequirements): number {
  const keys = Object.keys(requirements) as (keyof ProfileCompletionRequirements)[];
  const done = keys.filter((k) => requirements[k]).length;
  return Math.round((done / keys.length) * 100);
}
