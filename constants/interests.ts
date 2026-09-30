export const MAX_INTERESTS = 10;

export const INTEREST_GROUPS: { title: string; items: string[] }[] = [
  {
    title: 'Active',
    items: ['Active', 'Hiking', 'Gym', 'Running', 'Yoga', 'Cycling', 'Climbing', 'Dancing', 'Sports'],
  },
  {
    title: 'Low-key',
    items: ['Homebody', 'Reading', 'Movies', 'TV shows', 'Gaming', 'Board games', 'Podcasts', 'Anime'],
  },
  {
    title: 'Food & drink',
    items: ['Cooking', 'Baking', 'Foodie', 'Coffee', 'Brunch', 'Wine', 'Craft beer', 'Cocktails'],
  },
  {
    title: 'Going out',
    items: ['Nightlife', 'Live music', 'Concerts', 'Comedy', 'Karaoke', 'Festivals', 'Trivia'],
  },
  {
    title: 'Creative',
    items: ['Art', 'Music', 'Photography', 'Writing', 'Fashion', 'DIY', 'Museums'],
  },
  {
    title: 'Adventure',
    items: ['Travel', 'Outdoors', 'Camping', 'Beach', 'Road trips', 'Fishing'],
  },
  {
    title: 'Heart',
    items: ['Dogs', 'Cats', 'Volunteering', 'Faith', 'Family', 'Self-care'],
  },
];

export const ALL_INTERESTS = INTEREST_GROUPS.flatMap((g) => g.items);

/** Free filter set; filtering on the rest of ALL_INTERESTS is DateToday+. */
export const BROAD_INTERESTS = [
  'Active',
  'Homebody',
  'Hiking',
  'Cooking',
  'Reading',
  'Gym',
  'Travel',
  'Movies',
  'Gaming',
  'Live music',
  'Coffee',
  'Dogs',
] as const;

export function isBroadInterest(name: string): boolean {
  return (BROAD_INTERESTS as readonly string[]).includes(name);
}

/** Older profiles picked from a shorter list; map them onto the current names. */
const LEGACY: Record<string, string> = { Fitness: 'Gym', Film: 'Movies' };

export function normalizeInterests(list: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const name = LEGACY[raw] ?? raw;
    if (name && !out.includes(name)) out.push(name);
  }
  return out.slice(0, MAX_INTERESTS);
}

export function sharedInterests(
  mine: readonly string[] | null | undefined,
  theirs: readonly string[] | null | undefined,
): string[] {
  const set = new Set(normalizeInterests(mine));
  return normalizeInterests(theirs).filter((i) => set.has(i));
}

export const EXERCISE_OPTIONS = ['Every day', 'Often', 'Sometimes', 'Never'];
export const KIDS_OPTIONS = ['Want someday', 'Don’t want', 'Have kids', 'Open to it', 'Not sure'];
export const PETS_OPTIONS = ['Dog person', 'Cat person', 'Both', 'Allergic', 'None'];
