import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
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
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
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
