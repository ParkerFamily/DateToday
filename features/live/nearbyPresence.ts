import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { isBackendConfigured } from '@/lib/env';
import { usePrivacyControls } from '@/store/privacyControls';
import { useSessionStore } from '@/store/session';

const REFRESH_MS = 20 * 60 * 1000;
let lastWrite = 0;
let removed = false;

async function currentCoords(): Promise<{ latitude: number; longitude: number } | null> {
  // Never prompts: people only show as "nearby" if they already shared location with the app.
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') return null;
  const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 }).catch(() => null);
  if (last) return last.coords;
  const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
    () => null,
  );
  return fresh?.coords ?? null;
}

async function sync(force = false) {
  const { showInDiscovery, pauseDiscovery, hydrated } = usePrivacyControls.getState();
  if (!hydrated) return;
  const live = await import('@/features/live/firestoreLive');
  if (!showInDiscovery || pauseDiscovery) {
    if (!removed) {
      removed = true;
      lastWrite = 0;
      await live.removeNearbyPresence();
    }
    return;
  }
  if (!force && Date.now() - lastWrite < REFRESH_MS) return;
  const coords = await currentCoords();
  if (!coords) return;
  lastWrite = Date.now();
  removed = false;
  await live.publishNearbyPresence(coords);
}

/** Keeps the signed-in user's non-live "nearby" presence fresh while the app is open. */
export function useNearbyPresence() {
  const uid = useSessionStore((s) => s.userId);
  const hasPhoto = useSessionStore((s) => Boolean(s.profile?.mainPhotoUrl));
  const showInDiscovery = usePrivacyControls((s) => s.showInDiscovery);
  const pauseDiscovery = usePrivacyControls((s) => s.pauseDiscovery);
  const hydrated = usePrivacyControls((s) => s.hydrated);

  useEffect(() => {
    if (!uid || !hasPhoto || !hydrated || !isBackendConfigured()) return;
    removed = false;
    void sync(true).catch(() => undefined);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync().catch(() => undefined);
    });
    return () => sub.remove();
  }, [uid, hasPhoto, hydrated, showInDiscovery, pauseDiscovery]);
}
