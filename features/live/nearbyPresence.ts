import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { isBackendConfigured } from '@/lib/env';
import { usePrivacyControls } from '@/store/privacyControls';
import { useSessionStore } from '@/store/session';

const REFRESH_MS = 20 * 60 * 1000;
const MIN_MOVE_MILES = 0.5;
let lastWrite = 0;
let lastCoords: { latitude: number; longitude: number } | null = null;
let removed = false;

function haversineDistance(
  coord1: { latitude: number; longitude: number },
  coord2: { latitude: number; longitude: number }
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.latitude * Math.PI) / 180) *
      Math.cos((coord2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function currentCoords(allowPrompt: boolean): Promise<{ latitude: number; longitude: number } | null> {
  let perm = await Location.getForegroundPermissionsAsync();
  // Signed-in users who skipped onboarding (new install, existing account) were never asked, and iOS
  // doesn't list Location in Settings until the app asks once. Ask only that once; never re-prompt.
  if (perm.status === Location.PermissionStatus.UNDETERMINED && allowPrompt) {
    perm = await Location.requestForegroundPermissionsAsync();
  }
  const granted = perm.status === 'granted';
  useSessionStore.getState().setLocationGranted(granted);
  // Update Firestore profileCompletion.location if needed
  const { updateLocationCompletion } = await import('@/features/profile/updateLocationCompletion');
  await updateLocationCompletion(granted);
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
      lastCoords = null;
      await live.removeNearbyPresence();
    }
    return;
  }
  if (!force && Date.now() - lastWrite < REFRESH_MS) return;
  const coords = await currentCoords(force);
  if (!coords) return;
  
  // Only write if moved >0.5 miles since last sync (saves Firestore writes)
  if (lastCoords && !force) {
    const distMoved = haversineDistance(lastCoords, coords);
    if (distMoved < MIN_MOVE_MILES) return;
  }
  
  lastWrite = Date.now();
  lastCoords = coords;
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
