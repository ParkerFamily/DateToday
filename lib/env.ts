import Constants from 'expo-constants';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  stripePublishableKey?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
  appEnv?: string;
  personaTemplateId?: string;
  personaEnvironmentId?: string;
  personaSandboxApiKey?: string;
  revenueCatIosKey?: string;
  revenueCatAndroidKey?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  firebaseAndroidAppId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function pick(name: string, value: string | undefined, fallback = ''): string {
  if (value && value.length > 0) return value;
  return fallback;
}

/**
 * Firebase values from GoogleService-Info.plist (iOS app com.parkerfamily.datetoday).
 * Overridable via EXPO_PUBLIC_FIREBASE_* for web / Android.
 */
const plistDefaults = {
  apiKey: 'AIzaSyDpWkj2YymrKnAyRWcMQkHvbieBh97pbCU',
  authDomain: 'datetoday-e1331.firebaseapp.com',
  projectId: 'datetoday-e1331',
  storageBucket: 'datetoday-e1331.firebasestorage.app',
  messagingSenderId: '626033907762',
  appId: '1:626033907762:ios:4b577d261a70e27fea442b',
} as const;

export const env = {
  supabaseUrl: pick(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl,
  ),
  supabaseAnonKey: pick(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey,
  ),
  stripePublishableKey:
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? extra.stripePublishableKey ?? '',
  googleWebClientId:
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? extra.googleWebClientId ?? '',
  googleIosClientId:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? extra.googleIosClientId ?? '',
  googleAndroidClientId:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? extra.googleAndroidClientId ?? '',
  personaTemplateId:
    process.env.EXPO_PUBLIC_PERSONA_TEMPLATE_ID ?? extra.personaTemplateId ?? '',
  personaEnvironmentId:
    process.env.EXPO_PUBLIC_PERSONA_ENVIRONMENT_ID ?? extra.personaEnvironmentId ?? '',
  /** Sandbox-only API key for creating inquiries from the client during development. */
  personaSandboxApiKey:
    process.env.EXPO_PUBLIC_PERSONA_SANDBOX_API_KEY ?? extra.personaSandboxApiKey ?? '',
  revenueCatIosKey:
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? extra.revenueCatIosKey ?? '',
  revenueCatAndroidKey:
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? extra.revenueCatAndroidKey ?? '',
  firebaseApiKey: pick(
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? extra.firebaseApiKey,
    plistDefaults.apiKey,
  ),
  firebaseAuthDomain: pick(
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? extra.firebaseAuthDomain,
    plistDefaults.authDomain,
  ),
  firebaseProjectId: pick(
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? extra.firebaseProjectId,
    plistDefaults.projectId,
  ),
  firebaseStorageBucket: pick(
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? extra.firebaseStorageBucket,
    plistDefaults.storageBucket,
  ),
  firebaseMessagingSenderId: pick(
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? extra.firebaseMessagingSenderId,
    plistDefaults.messagingSenderId,
  ),
  firebaseAppId: pick(
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? extra.firebaseAppId,
    plistDefaults.appId,
  ),
  firebaseAndroidAppId: pick(
    'EXPO_PUBLIC_FIREBASE_ANDROID_APP_ID',
    process.env.EXPO_PUBLIC_FIREBASE_ANDROID_APP_ID ?? extra.firebaseAndroidAppId,
    '1:626033907762:android:a4854e9d7bd75de6ea442b',
  ),
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? extra.appEnv ?? 'development',
  isDev: (process.env.EXPO_PUBLIC_APP_ENV ?? extra.appEnv ?? 'development') !== 'production',
  previewContentEnabled:
    __DEV__ || (process.env.EXPO_PUBLIC_APP_ENV ?? extra.appEnv ?? 'development') !== 'production',
} as const;

/** Primary backend for DateToday is Firebase. */
export function isBackendConfigured(): boolean {
  return Boolean(env.firebaseApiKey && env.firebaseProjectId && env.firebaseAppId);
}

export function assertFirebaseConfigured(): void {
  if (!isBackendConfigured()) {
    throw new Error(
      'Firebase is not configured. Add GoogleService-Info.plist / EXPO_PUBLIC_FIREBASE_* values.',
    );
  }
}

/** @deprecated Prefer assertFirebaseConfigured — kept for leftover Supabase call sites. */
export function assertSupabaseConfigured(): void {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. DateToday now uses Firebase — use assertFirebaseConfigured().',
    );
  }
}

export function personaClientConfigured(): boolean {
  // Template ID is enough to start hosted / API-created sandbox inquiries.
  return Boolean(env.personaTemplateId?.startsWith('itmpl_'));
}
