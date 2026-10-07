import type { ProfileCompletionRequirements } from '@/types';

export type StepKey = keyof ProfileCompletionRequirements;

type AppRouter = { push: (href: never) => void };

export const COMPLETION_STEPS: {
  key: StepKey;
  label: string;
  action: string;
  href: string;
  optional?: boolean;
}[] = [
  { key: 'mainPhoto', label: 'Main photo', action: 'Add a photo', href: '/settings/media' },
  { key: 'name', label: 'Name', action: 'Add your name', href: '/settings/edit-profile' },
  { key: 'age', label: '18+ confirmed', action: 'Confirm you’re 18+', href: '/settings/age' },
  { key: 'gender', label: 'Gender', action: 'Add your gender', href: '/settings/edit-profile' },
  { key: 'preference', label: 'Who you’re into', action: 'Choose who you’re into', href: '/settings/preferences' },
  { key: 'location', label: 'Location on', action: 'Turn on location', href: '/settings/location' },
  { key: 'videos', label: 'Video prompts', action: 'Record video prompts', href: '/settings/media', optional: true },
];

export function missingStepKeys(requirements: ProfileCompletionRequirements): StepKey[] {
  return COMPLETION_STEPS.filter((s) => !s.optional && !requirements[s.key]).map((s) => s.key);
}

export function openStep(key: StepKey, router: AppRouter) {
  const href = COMPLETION_STEPS.find((s) => s.key === key)?.href;
  if (href) router.push(href as never);
}
