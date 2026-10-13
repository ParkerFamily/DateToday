import type { useRouter } from 'expo-router';
import { Linking, Platform } from 'react-native';
import { placePlanIdea } from '@/constants/datingTraits';
import type { FoodCuisine } from '@/constants/tonightVibe';
import { syncLiveSessionPatch } from '@/features/live/restoreLiveSession';
import { canStartPlan } from '@/features/live/planGate';
import { otherUserId, type MatchDoc } from '@/features/matches/api';
import { useDiscoverFilters } from '@/store/discoverFilters';
import { useExploreDraft } from '@/store/exploreDraft';
import { useSessionStore } from '@/store/session';
import type { TonightActivity } from '@/types';
import { isLiveSessionActive } from '@/utils/time';

type Router = ReturnType<typeof useRouter>;

/** What "Make this the plan" hands to the existing plan sheet (same shape as a date being changed). */
export type PlanPrefill = {
  activity: string;
  /** Overrides the plan sheet's "🎳 Activity" label, e.g. "🎬 Movie". */
  label: string | null;
  startsAt: string | null;
  venueName: string;
  venueAddress: string | null;
  neighborhood: string | null;
  venueLat: number | null;
  venueLng: number | null;
};

export function isLiveNow() {
  const session = useSessionStore.getState().liveSession;
  return Boolean(session && isLiveSessionActive(session, new Date()));
}

/** Opens the normal plan sheet for this match, prefilled. Plans still need you to be Live. */
export function planWithMatch(router: Router, match: MatchDoc, prefill: PlanPrefill) {
  if (!canStartPlan(router)) return false;
  const me = useSessionStore.getState().userId ?? '';
  const them = match.users[otherUserId(match, me)];
  router.push({
    pathname: '/dates/plan',
    params: {
      name: them?.displayName ?? '',
      photo: them?.mainPhotoUrl ?? '',
      conversationId: match.id,
      prefill: JSON.stringify(prefill),
    },
  });
  return true;
}

/**
 * "Find someone for this". Live: narrows the feed to people up for the same kind of plan.
 * Not Live: preselects it (and the spot) on the Live screen; nothing is sent to anyone.
 */
export function findSomeoneFor(
  router: Router,
  pick: { activity: TonightActivity; cuisine: FoodCuisine | null; spot: string },
  opts: { addToLivePlan?: boolean } = {},
) {
  if (isLiveNow()) {
    useDiscoverFilters.getState().patch({
      vibeFilter: [pick.activity],
      foodFilter: pick.cuisine ? [pick.cuisine] : [],
    });
    if (opts.addToLivePlan) addToLivePlan(pick);
  } else {
    useExploreDraft.getState().setDraft(pick);
  }
  router.navigate('/(tabs)/live');
}

/** Puts the spot on your Live card as tonight's plan (the same "spot in mind" you can set on Live). */
function addToLivePlan(pick: { activity: TonightActivity; cuisine: FoodCuisine | null; spot: string }) {
  const { liveSession, setLiveSession } = useSessionStore.getState();
  if (!liveSession) return;
  const activities = liveSession.activities?.includes(pick.activity)
    ? liveSession.activities
    : [...(liveSession.activities ?? []), pick.activity];
  const patch = {
    planIdea: placePlanIdea('spot', pick.spot),
    activities,
    ...(pick.activity === 'dinner' && pick.cuisine ? { foodCuisines: [pick.cuisine] } : {}),
  };
  setLiveSession({ ...liveSession, ...patch });
  void syncLiveSessionPatch(patch);
}

export function openDirections(p: { name: string; lat: number | null; lng: number | null; address?: string | null }) {
  const label = encodeURIComponent(p.name);
  const where =
    p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : encodeURIComponent([p.name, p.address].filter(Boolean).join(' '));
  const web = `https://www.google.com/maps/dir/?api=1&destination=${where}`;
  const url =
    Platform.OS === 'ios'
      ? p.lat != null && p.lng != null
        ? `http://maps.apple.com/?daddr=${where}&q=${label}`
        : `http://maps.apple.com/?daddr=${where}`
      : Platform.OS === 'android' && p.lat != null && p.lng != null
        ? `geo:${where}?q=${where}(${label})`
        : web;
  void Linking.openURL(url).catch(() => Linking.openURL(web));
}
