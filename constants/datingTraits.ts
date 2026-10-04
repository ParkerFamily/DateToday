import { PETS_OPTIONS } from '@/constants/interests';
import type { ProfileTraits, TonightEnergy, TravelPref } from '@/types';

/** Set when going live (free); filtered on in Tonight. */
export const ENERGY_OPTIONS: { value: TonightEnergy; label: string; emoji: string }[] = [
  { value: 'low_key', label: 'Low-key', emoji: '🕯️' },
  { value: 'social', label: 'Social', emoji: '🥂' },
  { value: 'turnt', label: 'Turnt', emoji: '🔥' },
  { value: 'romantic', label: 'Romantic', emoji: '🌹' },
  { value: 'adventurous', label: 'Adventurous', emoji: '🧭' },
];

export const TRAVEL_OPTIONS: { value: TravelPref; label: string }[] = [
  { value: 'can_travel', label: 'Can travel' },
  { value: 'nearby', label: 'Prefer nearby' },
  { value: 'halfway', label: 'Meet halfway' },
];

export const PLAN_IDEA_MAX = 60;

export function energyLabel(value: TonightEnergy | null | undefined): string | null {
  const o = ENERGY_OPTIONS.find((e) => e.value === value);
  return o ? `${o.emoji} ${o.label}` : null;
}

export function cleanEnergy(value: unknown): TonightEnergy | null {
  return ENERGY_OPTIONS.some((o) => o.value === value) ? (value as TonightEnergy) : null;
}

export function cleanTravel(value: unknown): TravelPref | null {
  return TRAVEL_OPTIONS.some((o) => o.value === value) ? (value as TravelPref) : null;
}

export function cleanPlanIdea(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim().slice(0, PLAN_IDEA_MAX);
  return t || null;
}

export type TraitKey = keyof ProfileTraits;

/** Optional profile answers, stored as the display string (same as drinking / smoking). */
export const TRAITS: Record<TraitKey, { label: string; options: readonly string[] }> = {
  weed: { label: 'Weed', options: ['Never', 'Sometimes', 'Socially', 'Often'] },
  pets: { label: 'Pets', options: PETS_OPTIONS },
  education: {
    label: 'Education',
    options: ['High school', 'Trade school', 'Some college', 'Bachelor’s', 'Master’s', 'Doctorate'],
  },
  industry: {
    label: 'Work',
    options: [
      'Tech',
      'Healthcare',
      'Finance',
      'Creative',
      'Education',
      'Hospitality',
      'Trades',
      'Business',
      'Law',
      'Public service',
      'Student',
      'Other',
    ],
  },
  religion: {
    label: 'Religion',
    options: ['Christian', 'Catholic', 'Muslim', 'Jewish', 'Hindu', 'Buddhist', 'Spiritual', 'Agnostic', 'Atheist', 'Other'],
  },
  politics: { label: 'Politics', options: ['Liberal', 'Moderate', 'Conservative', 'Not political', 'Other'] },
  loveLanguage: {
    label: 'Love language',
    options: ['Quality time', 'Words of affirmation', 'Physical touch', 'Acts of service', 'Gifts'],
  },
  communication: { label: 'Communication', options: ['Big texter', 'Phone calls', 'FaceTime', 'Better in person'] },
  chronotype: { label: 'Night owl or early bird', options: ['Night owl', 'Early bird', 'In between'] },
  socialEnergy: { label: 'Social energy', options: ['Introvert', 'Ambivert', 'Extrovert'] },
};

export const TRAIT_KEYS = Object.keys(TRAITS) as TraitKey[];

/** Copy trait answers off a Firestore doc; unknown answers are dropped. */
export function traitFields(src: Record<string, unknown>): Record<TraitKey, string | null> {
  return Object.fromEntries(
    TRAIT_KEYS.map((k) => {
      const v = src[k];
      return [k, typeof v === 'string' && TRAITS[k].options.includes(v) ? v : null];
    }),
  ) as Record<TraitKey, string | null>;
}
