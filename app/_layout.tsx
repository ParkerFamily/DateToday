import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { Caveat_600SemiBold } from '@expo-google-fonts/caveat';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '@/constants/theme';
import { subscribeAuth, waitForAuthUser } from '@/features/auth/api';
import { loadUserProfile } from '@/features/profile/saveOnboarding';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { isBackendConfigured } from '@/lib/env';
import { hasEnteredApp } from '@/utils/accountEntry';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

async function hydrateSignedInUser(uid: string, email: string | null) {
  const setAuth = useSessionStore.getState().setAuth;
  const setProfile = useSessionStore.getState().setProfile;
  const setPreferences = useSessionStore.getState().setPreferences;
  const setProfileHydration = useSessionStore.getState().setProfileHydration;
  setAuth(uid, email);
  setProfileHydration('loading');
  try {
    const saved = await loadUserProfile(uid);
    if (!saved) {
      setProfileHydration('done');
      return;
    }
    setProfile(saved.profile);
    setPreferences(saved.preferences);
    if (saved.hasLegalConsent) {
      useOnboardingDraft.getState().acceptLegalConsent();
    }
    const { usePrivacyControls } = await import('@/store/privacyControls');
    usePrivacyControls.getState().hydrate(saved.privacyControls ?? undefined);
    const { useBlocksStore } = await import('@/store/blocks');
    await useBlocksStore.getState().hydrate();
    const { refreshBlockedUsers } = await import('@/features/safety/api');
    await refreshBlockedUsers().catch(() => undefined);
  } catch {
    // Profile may not exist yet (mid-onboarding).
  } finally {
    setProfileHydration('done');
  }
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const bootstrapped = useRef(false);
  const segments = useSegments();
  const router = useRouter();
  const userId = useSessionStore((s) => s.userId);
  const profile = useSessionStore((s) => s.profile);
  const profileHydration = useSessionStore((s) => s.profileHydration);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      // Local block list applies even before auth finishes.
      void import('@/store/blocks').then((m) => m.useBlocksStore.getState().hydrate());
      try {
        if (!isBackendConfigured()) {
          if (mounted) setReady(true);
          return;
        }

        // Wait for AsyncStorage auth restore — do NOT trust currentUser alone.
        const user = await waitForAuthUser();
        if (!mounted) return;

        if (user) {
          await hydrateSignedInUser(user.uid, user.email ?? null);
          // Purchases must never wipe auth — skip entirely on Android (IAP deferred).
          if (Platform.OS !== 'android') {
            try {
              const { configurePurchases, refreshCustomerInfo } = await import('@/lib/purchases');
              await configurePurchases(user.uid);
              await refreshCustomerInfo();
            } catch {
              /* ignore */
            }
          }
        } else {
          useSessionStore.getState().setAuth(null, null);
          if (Platform.OS !== 'android') {
            try {
              const { configurePurchases } = await import('@/lib/purchases');
              await configurePurchases(null);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        useSessionStore.getState().setAuth(null, null);
      } finally {
        bootstrapped.current = true;
        if (mounted) {
          setReady(true);
          SplashScreen.hideAsync().catch(() => undefined);
        }
      }
    }

    void bootstrap();

    const unsub = subscribeAuth((user) => {
      // Ignore until initial restore finished to avoid null→user race wipes.
      if (!bootstrapped.current) return;

      void (async () => {
        if (!user) {
          useSessionStore.getState().setAuth(null, null);
          return;
        }
        const prev = useSessionStore.getState().userId;
        if (prev === user.uid && useSessionStore.getState().profile) {
          // Same session — don't clobber a loaded profile on token refresh.
          useSessionStore.getState().setAuth(user.uid, user.email ?? null);
          return;
        }
        await hydrateSignedInUser(user.uid, user.email ?? null);
        if (Platform.OS === 'android') return;
        try {
          const { configurePurchases, refreshCustomerInfo } = await import('@/lib/purchases');
          await configurePurchases(user.uid);
          await refreshCustomerInfo();
        } catch {
          /* ignore */
        }
      })();
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const root = String(segments[0] ?? '');
    const inAuth = root === '(auth)';
    const inOnboarding = root === '(onboarding)';
    const atIndex = !root || root === 'index';

    if (!isBackendConfigured()) {
      if (atIndex) router.replace('/(auth)/welcome');
      return;
    }

    if (!userId) {
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }

    // Wait for Firestore profile before deciding onboarding vs tabs —
    // otherwise returning Google/Apple users get bounced to name setup.
    if (profileHydration === 'loading') return;

    const entered = hasEnteredApp(profile);

    // Allow settings / legal / safety / filters / paywall / profile / chat / dates / discovery
    // while entered — do not bounce users editing those stacks into Live.
    const allowedWhileEntered = new Set([
      '(tabs)',
      'settings',
      'legal',
      'safety',
      'filters',
      'paywall',
      'profile',
      'chat',
      'dates',
      'discovery',
      'mutual',
      'likes',
    ]);

    if (entered) {
      if (allowedWhileEntered.has(root)) return;
      // Allow short onboarding editors opened from Settings (videos / verify).
      const onboardingLeaf = String(segments[1] ?? '');
      const settingsEditors = new Set(['video-pick', 'video-record', 'verify']);
      if (inOnboarding && settingsEditors.has(onboardingLeaf)) return;
      // Finished accounts should never be stuck on welcome/onboarding after reload.
      if (inAuth || inOnboarding || atIndex) {
        router.replace('/(tabs)/live');
      }
      return;
    }

    // Signed in but setup not finished — keep them in onboarding (not welcome).
    if (!inOnboarding) {
      router.replace('/(onboarding)/name');
    }
  }, [ready, userId, profile, profileHydration, segments, router]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.brandBright} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Caveat_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.brandBright} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <AuthGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="discovery/index" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="mutual/index" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="profile/[userId]" />
              <Stack.Screen name="chat/[conversationId]" />
              <Stack.Screen name="dates/plan" />
              <Stack.Screen name="dates/its-a-date" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="dates/[dateId]" />
              <Stack.Screen name="filters/index" options={{ presentation: 'modal' }} />
              <Stack.Screen name="likes/index" options={{ presentation: 'modal' }} />
              <Stack.Screen name="paywall/index" />
              <Stack.Screen name="paywall/boost" />
              <Stack.Screen name="safety" />
              <Stack.Screen name="legal" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="+not-found" />
            </Stack>
          </AuthGate>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
