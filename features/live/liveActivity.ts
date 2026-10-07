import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { LiveActivity, LiveActivityFactory } from 'expo-widgets';
import type { LiveSessionActivityProps } from '@/features/live/LiveSessionActivity';
import { clearLiveStatusNotification, showLiveStatusNotification } from '@/features/notifications/push';
import { cancelLiveEndingReminder, cancelStillFreeReminder } from '@/features/notifications/reminders';
import { freeUntilLabel } from '@/features/live/freeUntil';
import { useLiveSessionRestored } from '@/features/live/restoreLiveSession';
import { useMatchesStore, usePendingLikes, useUnreadMatchCount } from '@/store/matches';
import { useSessionStore } from '@/store/session';
import { isLiveSessionActive } from '@/utils/time';

type Factory = LiveActivityFactory<LiveSessionActivityProps>;
type Instance = LiveActivity<LiveSessionActivityProps>;

let factory: Factory | null | undefined;
let current: Instance | null = null;
let lastKey = '';

/**
 * Loaded lazily: binaries built before expo-widgets was added have no native module,
 * and importing it there throws — this must stay safe to ship over the air.
 */
function getFactory(): Factory | null {
  if (factory !== undefined) return factory;
  factory = null;
  if (Platform.OS !== 'ios') return null;
  try {
    factory = require('@/features/live/LiveSessionActivity').default as Factory;
  } catch {
    factory = null;
  }
  return factory;
}

function instances(f: Factory): Instance[] {
  try {
    return f.getInstances();
  } catch {
    return [];
  }
}

export async function endLiveActivity() {
  lastKey = '';
  await Promise.all([cancelLiveEndingReminder(), cancelStillFreeReminder()]);
  if (Platform.OS === 'android') {
    await clearLiveStatusNotification();
    return;
  }
  const f = getFactory();
  if (!f) return;
  const all = new Set<Instance>(instances(f));
  if (current) all.add(current);
  current = null;
  await Promise.all([...all].map((i) => i.end('immediate').catch(() => undefined)));
}

async function showLiveActivity(props: LiveSessionActivityProps) {
  const key = JSON.stringify(props);
  if (Platform.OS === 'android') {
    if (key === lastKey) return;
    lastKey = key;
    await showLiveStatusNotification(
      props.endsLabel ? `${props.headline} · ${props.endsLabel}` : props.headline,
      [props.detail, props.activity].filter(Boolean).join('\n'),
    );
    return;
  }
  const f = getFactory();
  if (!f) return;
  if (key === lastKey && current) return;
  lastKey = key;
  const staleDate = new Date(props.endsAtMs);

  const [existing, ...extras] = current ? [current, ...instances(f).filter((i) => i !== current)] : instances(f);
  await Promise.all(extras.map((i) => i.end('immediate').catch(() => undefined)));

  if (existing) {
    current = existing;
    try {
      await existing.update(props, staleDate);
      return;
    } catch {
      current = null;
    }
  }
  try {
    current = f.start(props, 'datetoday://live', staleDate);
  } catch {
    // Live Activities turned off in Settings, or iOS too old.
    current = null;
    lastKey = '';
  }
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Mount once (tabs layout): mirrors the current live session into the Dynamic Island / Lock Screen. */
export function useLiveActivitySync() {
  const uid = useSessionStore((s) => s.userId);
  const liveSession = useSessionStore((s) => s.liveSession);
  const datePlannedTonight = useSessionStore((s) => s.datePlannedTonight);
  const neighborhood = useSessionStore((s) => s.profile?.neighborhoodLabel ?? null);
  const likesLoaded = useMatchesStore((s) => s.likes !== null);
  const pendingLikes = usePendingLikes()?.total ?? 0;
  const unread = useUnreadMatchCount();
  const restored = useLiveSessionRestored(uid);
  const [tick, setTick] = useState(0);

  const active = liveSession ? isLiveSessionActive(liveSession) : false;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active || !liveSession) return;
    const now = Date.now();
    // Re-render at expiry, and when "Free until" passes so the label drops off.
    const timers = [liveSession.expiresAt, liveSession.availableUntil]
      .map((iso) => (iso ? new Date(iso).getTime() - now : NaN))
      .filter((ms) => Number.isFinite(ms) && ms > 0 && ms < 24 * 60 * 60 * 1000)
      .map((ms) => setTimeout(() => setTick((t) => t + 1), ms + 500));
    return () => timers.forEach(clearTimeout);
  }, [active, liveSession]);

  const props = useMemo<LiveSessionActivityProps | null>(() => {
    if (!active || !liveSession) return null;
    const activities = (liveSession.activities ?? [])
      .map((a) => a.charAt(0).toUpperCase() + a.slice(1).replace(/_/g, ' '))
      .join(' + ');
    const likes = likesLoaded ? pendingLikes : 0;
    const bits: string[] = [];
    if (likes > 0) bits.push(plural(likes, 'person likes you', 'people like you'));
    if (unread > 0) bits.push(plural(unread, 'new message', 'new messages'));
    const endsLabel = freeUntilLabel(liveSession.availableUntil) ?? '';
    return {
      headline: datePlannedTonight ? 'Date planned tonight' : 'You’re live',
      detail: [neighborhood, activities || 'Open to anything'].filter(Boolean).join(' · '),
      activity: bits.join(' · '),
      endsLabel,
      untilTime: endsLabel.replace(/^Free until\s*/, ''),
      likes,
      messages: unread,
      endsAtMs: new Date(liveSession.expiresAt).getTime(),
      boosted: Boolean(liveSession.isBoosted),
    };
    // tick re-evaluates expiry on resume / at the end time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, liveSession, datePlannedTonight, neighborhood, likesLoaded, pendingLikes, unread, tick]);

  // No local session before the Firestore check means "unknown", so leave any running activity alone.
  const knownOffline = restored || liveSession != null;

  useEffect(() => {
    if (props) void showLiveActivity(props);
    else if (knownOffline) void endLiveActivity();
  }, [props, knownOffline]);

  // Live reminders are server pushes now (throttled, with Stay Live / Go Offline); clear old local ones.
  useEffect(() => {
    void cancelLiveEndingReminder();
    void cancelStillFreeReminder();
  }, []);
}
