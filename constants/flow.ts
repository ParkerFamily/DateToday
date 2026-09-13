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
  quietTitle: 'Quiet right now. Not dead.',
  quietBody:
    'Nobody matching your filters is Pinged nearby yet. Start your Ping — we’ll alert you when someone compatible goes live.',
  youreLiveWatching: "You're live ✦",
  watchingArea: "We're watching your area.",
  zeroMatchNow: '0 people match right now',
  notifyWhenNearby: "We'll notify you the second someone matching your preferences Pings nearby.",
  expandRadius: 'Expand radius',
  adjustFilters: 'Adjust filters',
  loosenFiltersTitle: 'No exact matches right now',
  loosenFiltersBody: 'People are Live nearby if you loosen one preference.',
  showNearby: 'Show nearby people',
  laterTonightTitle: 'LATER TONIGHT',
  liveNowTitle: 'LIVE NOW ⚡',
  beFirstCta: 'Start your Ping',
  tonightIdeas: 'Tonight’s ideas',
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

/** Offline teaser — never invents a headcount. */
export function formatCityTonightTeaser(city: string, _estimated?: number): string {
  return `People get ready around ${city} tonight — Go Live to enter the pool.`;
}

export function formatLaterHour(hour: number): string {
  if (hour >= 21) return '9 PM+';
  const h = ((hour + 11) % 12) + 1;
  return `${h} PM`;
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
