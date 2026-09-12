/**
 * Nearby public spots for post-match "FIND A SPOT" — demo / MVP.
 * Real venue search + partnerships come later.
 */
import type { FoodCuisine } from '@/constants/tonightVibe';

export interface DateSpot {
  id: string;
  name: string;
  cuisine: FoodCuisine;
  neighborhood: string;
  milesFromYou: number;
  milesFromThem: number;
}

export const DEMO_DATE_SPOTS: DateSpot[] = [
  {
    id: 'umi',
    name: 'Umi',
    cuisine: 'sushi',
    neighborhood: 'Buckhead',
    milesFromYou: 2.1,
    milesFromThem: 3.4,
  },
  {
    id: 'barcelona',
    name: 'Barcelona Wine Bar',
    cuisine: 'anything',
    neighborhood: 'Midtown',
    milesFromYou: 1.2,
    milesFromThem: 1.8,
  },
  {
    id: 'seven-lumps',
    name: 'Seven Lumps Sushi',
    cuisine: 'sushi',
    neighborhood: 'Virginia-Highland',
    milesFromYou: 2.8,
    milesFromThem: 2.2,
  },
  {
    id: 'antipasti',
    name: 'Antico Pizza',
    cuisine: 'italian',
    neighborhood: 'Midtown',
    milesFromYou: 1.5,
    milesFromThem: 2.0,
  },
  {
    id: 'tacos',
    name: 'Superica',
    cuisine: 'mexican',
    neighborhood: 'West Midtown',
    milesFromYou: 2.4,
    milesFromThem: 3.1,
  },
  {
    id: 'bones',
    name: 'Bones',
    cuisine: 'steakhouse',
    neighborhood: 'Buckhead',
    milesFromYou: 3.6,
    milesFromThem: 2.9,
  },
  {
    id: 'mary-macs',
    name: "Mary Mac's Tea Room",
    cuisine: 'american',
    neighborhood: 'Midtown',
    milesFromYou: 1.8,
    milesFromThem: 2.5,
  },
  {
    id: 'atlas',
    name: 'Atlas',
    cuisine: 'seafood',
    neighborhood: 'Midtown',
    milesFromYou: 1.4,
    milesFromThem: 2.1,
  },
];

export function spotsForCuisine(cuisine: FoodCuisine | null | undefined): DateSpot[] {
  if (!cuisine || cuisine === 'anything') {
    return DEMO_DATE_SPOTS.slice(0, 4);
  }
  const exact = DEMO_DATE_SPOTS.filter((s) => s.cuisine === cuisine);
  if (exact.length) return exact;
  return DEMO_DATE_SPOTS.filter((s) => s.cuisine === 'anything').concat(DEMO_DATE_SPOTS.slice(0, 2));
}
