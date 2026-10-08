import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import {
  disableNetwork,
  enableNetwork,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { env } from '@/lib/env';

/**
 * Firebase JS SDK — works in Expo Go + EAS.
 * Native GoogleService-Info.plist / google-services.json referenced in app.json for EAS builds.
 * Android must use the Android appId + Android API key from google-services.json.
 */
const firebaseConfig = {
  apiKey:
    Platform.OS === 'android' && env.firebaseAndroidApiKey
      ? env.firebaseAndroidApiKey
      : env.firebaseApiKey,
  authDomain: env.firebaseAuthDomain,
  projectId: env.firebaseProjectId,
  storageBucket: env.firebaseStorageBucket,
  messagingSenderId: env.firebaseMessagingSenderId,
  appId:
    Platform.OS === 'android' && env.firebaseAndroidAppId
      ? env.firebaseAndroidAppId
      : env.firebaseAppId,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

type RnAuthModule = {
  getReactNativePersistence: (storage: typeof ReactNativeAsyncStorage) => Persistence;
};

function rnAuthPersistence(): Persistence | undefined {
  try {
    // Metro resolves the RN build of firebase/auth which exports this helper.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('firebase/auth') as RnAuthModule;
    if (typeof mod.getReactNativePersistence === 'function') {
      return mod.getReactNativePersistence(ReactNativeAsyncStorage);
    }
  } catch {
    /* web / node typings */
  }
  return undefined;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      !firebaseConfig.apiKey.includes('YOUR_'),
  );
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_* or check GoogleService-Info.plist values in lib/env.ts.',
    );
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  const firebaseApp = getFirebaseApp();
  try {
    const persistence = rnAuthPersistence();
    auth = persistence
      ? initializeAuth(firebaseApp, { persistence })
      : initializeAuth(firebaseApp);
  } catch {
    // Already initialized (Fast Refresh / hot reload)
    auth = getAuth(firebaseApp);
  }
  return auth;
}

export function getDb(): Firestore {
  if (db) return db;
  const firebaseApp = getFirebaseApp();
  try {
    // RN's XHR doesn't stream reliably (esp. Android), so the default WebChannel stream can stall:
    // listeners stop updating and writes sit in the local queue, never reaching the server.
    db = initializeFirestore(
      firebaseApp,
      Platform.OS === 'web' ? {} : { experimentalForceLongPolling: true },
    );
  } catch {
    // Already initialized (Fast Refresh / hot reload)
    db = getFirestore(firebaseApp);
  }
  if (Platform.OS !== 'web') watchForeground();
  return db;
}

let reconnecting: Promise<void> | null = null;

/**
 * Long-polling can stall while the app sleeps; Firestore then fails reads as "offline" and queues
 * writes forever, even on good Wi-Fi. Turning its network off and on opens a fresh connection.
 */
export function reconnectFirestore(): Promise<void> {
  const d = db;
  if (!d) return Promise.resolve();
  reconnecting ??= disableNetwork(d)
    .catch(() => undefined)
    .then(() => enableNetwork(d))
    .catch(() => undefined)
    .finally(() => {
      reconnecting = null;
    });
  return reconnecting;
}

export function isConnectionError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (/unavailable|deadline-exceeded|network-request-failed/.test(code)) return true;
  const message = error instanceof Error ? error.message : '';
  return /offline|timed out|network|fetch failed/i.test(message);
}

/** Runs a Firestore call; if the connection had silently dropped, reconnects and tries again. */
export async function withReconnect<T>(run: () => Promise<T>, attempts = 2): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (error) {
      if (i >= attempts || !isConnectionError(error)) throw error;
      await reconnectFirestore();
    }
  }
}

const STALE_AFTER_BACKGROUND_MS = 20_000;
let watching = false;

/** Reconnect after the app has been in the background long enough for the stream to go stale. */
function watchForeground(): void {
  if (watching) return;
  watching = true;
  let backgroundAt: number | null = null;
  AppState.addEventListener('change', (state) => {
    if (state === 'background') {
      backgroundAt = Date.now();
    } else if (state === 'active' && backgroundAt != null) {
      const away = Date.now() - backgroundAt;
      backgroundAt = null;
      if (away >= STALE_AFTER_BACKGROUND_MS) void reconnectFirestore();
    }
  });
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}

export function getFirebase() {
  return {
    app: getFirebaseApp(),
    auth: getFirebaseAuth(),
    db: getDb(),
    storage: getFirebaseStorage(),
    platform: Platform.OS,
  };
}
