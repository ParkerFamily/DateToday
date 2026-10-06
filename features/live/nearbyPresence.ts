import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { isBackendConfigured } from '@/lib/env';
import { usePrivacyControls } from '@/store/privacyControls';
import { useSessionStore } from '@/store/session';

const REFRESH_MS = 20 * 60 * 1000;
let lastWrite = 0;
let removed = false;

async function currentCoords(allowPrompt: boolean): Promise<{ latitude: number; longitude: number } | null> {
  let perm = await Location.getForegroundPermissionsAsync();
  // Signed-in users who skipped onboarding (new install, existing account) were never asked, and iOS
  // doesn't list Location in Settings until the app asks once. Ask only that once; never re-prompt.
  if (perm.status === Location.PermissionStatus.UNDETERMINED && allowPrompt) {
    perm = await Location.requestForegroundPermissionsAsync();
  }
  useSessionStore.getState().setLocationGranted(perm.status === 'granted');
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
  const coords = await currentCoords(force);
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
