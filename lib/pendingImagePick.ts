import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const SLOT_KEY = 'dt.pendingPhotoSlot';

/** Call right before launching the picker so a recovered result lands in the same slot. */
export function rememberPickSlot(slot: number) {
  if (Platform.OS !== 'android') return;
  void AsyncStorage.setItem(SLOT_KEY, String(slot)).catch(() => undefined);
}

/**
 * Android can destroy the activity while the picker/cropper is open, dropping the
 * launchImageLibraryAsync promise. The pick is kept natively; hand it back on mount
 * and whenever the app returns to the foreground.
 */
export function useRecoverPickedImage(onRecovered: (uri: string, slot: number | null) => void) {
  const callback = useRef(onRecovered);
  callback.current = onRecovered;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const check = async () => {
      const result = await ImagePicker.getPendingResultAsync().catch(() => null);
      if (!result || !('canceled' in result) || result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      const stored = await AsyncStorage.getItem(SLOT_KEY).catch(() => null);
      const slot = stored != null && Number.isFinite(Number(stored)) ? Number(stored) : null;
      callback.current(uri, slot);
    };
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, []);
}
