/**
 * DateToday interaction funnel:
 *
 * GO LIVE = “I'm available tonight.”
 * PINGING = DateToday is looking within my radius while Live (the engine).
 * DISCOVER = People the Ping found (the feed).
 * ♥ = Interest in this person (never called Ping).
 * MATCH = Mutual interest.
 * DATE = Accepted plan.
 *
 * Ping is the invisible engine behind Discover — not a second action.
 */

export const flowCopy = {
  interestSentTitle: '♥ INTEREST SENT',
  interestSentBody: "If they feel it too, you'll match.",
  itsAMatch: "IT'S A MATCH",
  bothFree: 'You are both free tonight.',
  tonightOnly: 'Tonight only.',
  sayHey: 'SAY HEY',
  makeAPlan: 'MAKE A PLAN ⚡',
  breakTheIce: 'Break the ice',
  writeMyOwn: 'Write my own',
  feelingVibe: 'Feeling the vibe?',
  feelingVibeBody: "You're both still free tonight.",
  dateProposal: 'DATE PROPOSAL ⚡',
  accept: 'ACCEPT',
  change: 'CHANGE',
  decline: 'DECLINE',
  itsADate: "IT'S A DATE.",
  viewDate: 'VIEW DATE',
  keepChatting: 'KEEP CHATTING',
  stayLiveAsk: 'You made a plan. Stay Live?',
  pauseDiscovery: 'PAUSE DISCOVERY',
  pauseDiscoveryHint: 'Recommended — focus on tonight.',
  stayLive: 'STAY LIVE',
  datePlannedStatus: 'DATE PLANNED',
  pingingRadius: 'PINGING YOUR RADIUS',
  pingingHint: 'Finding people free tonight who match your vibe.',
  yourPing: 'YOUR PING',
  viewYourPing: 'VIEW YOUR PING →',
  goLiveToEnter: 'Go Live to see who’s free tonight.',
  seeWhosLive: "SEE WHO'S LIVE →",
  fineTuneTitle: 'More time. More conversation. ✦',
  fineTuneBody: 'Unlimited Ping + messages with DateToday+',
} as const;

/** Ping-scoped counts only — never generic “online now” vanity. */
export function formatPeopleInPing(count: number): string {
  if (count <= 0) return 'NO ONE IN YOUR PING YET';
  if (count === 1) return '1 PERSON IN YOUR PING';
  return `${count} PEOPLE IN YOUR PING`;
}

export function formatPingMatchLine(count: number): string {
  if (count <= 0) return 'Waiting for people who match your night';
  if (count === 1) return '1 person matches your night';
  return `${count} people match your night`;
}

/**
 * Offline teaser — thresholds so a tiny pool never looks dead.
 * No names, no exact pin locations.
 */
export function formatCityTonightTeaser(city: string, estimated: number): string {
  if (estimated >= 50) return `50+ people are going out around ${city} tonight`;
  if (estimated >= 20) return `20+ people are going out around ${city} tonight`;
  if (estimated >= 10) return `10+ people are going out around ${city} tonight`;
  return `People are getting ready around ${city} tonight`;
}

/** Contextual openers — no AI. Templates only. */
export const ICEBREAKERS = [
  "Okay so what's actually the move tonight? 😂",
  'You said sushi… defend your favorite spot.',
  'That video prompt sold me 😂',
  "Still free tonight? Let's make it easy.",
] as const;

export function icebreakersFor(opts?: {
  food?: string | null;
  name?: string | null;
}): string[] {
  const food = opts?.food?.toLowerCase();
  return [
    "Okay so what's actually the move tonight? 😂",
    food && food !== 'anything'
      ? `You said ${food}… defend your favorite spot.`
      : 'You said sushi… defend your favorite spot.',
    'That video prompt sold me 😂',
  ];
}
