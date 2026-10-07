import { colors } from '@/constants/theme';
import { clearSignedOutMark, restoreAuthUser, subscribeAuth } from '@/features/auth/api';
import {
    configureNotificationHandler,
    listenForPushTokenChanges,
    notificationUrl,
    registerPushTokenAsync,
} from '@/features/notifications/push';
import { installNotificationActions, isNotificationAction } from '@/features/notifications/actions';
import * as Notifications from 'expo-notifications';
import { loadUserProfile } from '@/features/profile/saveOnboarding';
import { ensureLocationPermissionAsked } from '@/features/auth/postAuth';
import { hasAgreedToTerms } from '@/features/consent/hasAgreed';
import { isBackendConfigured } from '@/lib/env';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { hasEnteredApp } from '@/utils/accountEntry';
import { Caveat_600SemiBold } from '@expo-google-fonts/caveat';
import {
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
// A throw at module scope kills the app before anything renders, so startup extras must never throw.
try {
  configureNotificationHandler();
} catch (error) {
  console.warn('[DateToday] notification handler failed', error);
}
try {
  installNotificationActions();
} catch (error) {
  console.warn('[DateToday] notification actions failed', error);
}

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([task, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Runs behind the splash screen; slow networks fall through and the update applies next launch. */
async function pullOtaUpdate() {
  if (__DEV__) return;
  try {
    const Updates = await import('expo-updates');
    if (!Updates.isEnabled) return;
    const result = await withTimeout(Updates.checkForUpdateAsync(), 4000);
    if (!result?.isAvailable) return;
    const fetched = await withTimeout(Updates.fetchUpdateAsync(), 10000);
    if (fetched?.isNew) await Updates.reloadAsync();
  } catch {
    /* offline */
  }
}

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
    if (__DEV__) console.log('[DateToday] Hydrating user profile for', uid);
    const saved = await loadUserProfile(uid);
    
    if (!saved) {
      if (__DEV__) console.log('[DateToday] No saved profile found for', uid);
      setProfileHydration('done');
      return;
    }
    
    if (__DEV__) {
      console.log('[DateToday] Profile loaded successfully:', {
        userId: saved.profile.userId,
        displayName: saved.profile.displayName,
        verificationStatus: saved.profile.verificationStatus,
        hasPhoto: Boolean(saved.profile.mainPhotoUrl),
      });
    }
    
    setProfile(saved.profile);
    setPreferences(saved.preferences);
    
    if (saved.hasLegalConsent) {
      useOnboardingDraft.getState().acceptLegalConsent();
    }
    
    // Request location permission for existing users who haven't been asked yet.
    // This ensures iOS shows location in Settings even for users who completed
    // onboarding before location permissions were added.
    if (hasEnteredApp(saved.profile)) {
      void ensureLocationPermissionAsked();
      const photos = saved.profile.photoUrls ?? [];
      if (photos.length) {
        void import('@/features/live/firestoreLive')
          .then(({ refreshLiveProfileFields }) =>
            refreshLiveProfileFields({ mainPhotoUrl: saved.profile.mainPhotoUrl, photoUrls: photos }),
          )
          .catch(() => undefined);
      }
    }
    
    // Parallelize independent operations for faster hydration
    const [
      { usePrivacyControls },
      { useBlocksStore },
      { refreshBlockedUsers },
      { restoreLiveSession },
      { hydrateTonightBoostForSession }
    ] = await Promise.all([
      import('@/store/privacyControls'),
      import('@/store/blocks'),
      import('@/features/safety/api'),
      import('@/features/live/restoreLiveSession'),
      import('@/lib/commerce/sessionCommerce')
    ]);
    
    usePrivacyControls.getState().hydrate(saved.privacyControls ?? undefined);
    
    await Promise.all([
      useBlocksStore.getState().hydrate(),
      refreshBlockedUsers().catch(() => undefined),
      restoreLiveSession(uid),
    ]);
    
    const restored = useSessionStore.getState().liveSession;
    if (restored && !restored.isBoosted) await hydrateTonightBoostForSession(restored);
  } catch (error) {
    console.error('[DateToday] Profile hydration failed:', error);
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
  const draftAgreed = useOnboardingDraft((s) => s.legalConsentAccepted);
  const agreed = hasAgreedToTerms(profile, draftAgreed);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      // Parallelize OTA update and blocks hydration
      await Promise.all([
        pullOtaUpdate(),
        import('@/store/blocks').then((m) => m.useBlocksStore.getState().hydrate()),
      ]);
      
      SplashScreen.hideAsync().catch(() => undefined);
      try {
        if (!isBackendConfigured()) {
          if (mounted) setReady(true);
          return;
        }

        // Sync location permission state on startup (just the session state, not Firestore yet)
        try {
          const Location = await import('expo-location');
          const perm = await Location.getForegroundPermissionsAsync();
          useSessionStore.getState().setLocationGranted(perm.status === 'granted');
        } catch {
          // Location check failed, skip
        }

        // Wait for AsyncStorage auth restore — do NOT trust currentUser alone.
        const user = await restoreAuthUser();
        if (!mounted) return;

        if (user) {
          await hydrateSignedInUser(user.uid, user.email ?? null);
          
          // NOW update Firestore location completion after profile is loaded
          try {
            const Location = await import('expo-location');
            const perm = await Location.getForegroundPermissionsAsync();
            const { updateLocationCompletion } = await import('@/features/profile/updateLocationCompletion');
            await updateLocationCompletion(perm.status === 'granted');
          } catch {
            // Location update failed, skip
          }
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
          if (__DEV__) console.log('[DateToday] Auth state changed: signed out');
          useSessionStore.getState().setAuth(null, null);
          return;
        }
        void clearSignedOutMark();
        const prev = useSessionStore.getState().userId;
        const currentProfile = useSessionStore.getState().profile;
        
        if (__DEV__) {
          console.log('[DateToday] Auth state changed:', {
            newUid: user.uid,
            prevUid: prev,
            hasProfile: Boolean(currentProfile),
            profileUserId: currentProfile?.userId,
          });
        }
        
        if (prev === user.uid && currentProfile) {
          // Same session — don't clobber a loaded profile on token refresh.
          if (__DEV__) console.log('[DateToday] Same user, keeping existing profile');
          useSessionStore.getState().setAuth(user.uid, user.email ?? null);
          return;
        }
        
        if (__DEV__) console.log('[DateToday] Hydrating user profile after auth change');
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
      // Email CREATE ACCOUNT walks onboarding before Firebase auth exists
      // (account step creates the user). Do not bounce those screens to welcome.
      if (inAuth || inOnboarding) return;
      router.replace('/(auth)/welcome');
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

    if (entered && !agreed) {
      const onAgreements = inOnboarding && String(segments[1] ?? '') === 'agreements';
      if (!onAgreements && root !== 'legal') router.replace('/(onboarding)/agreements');
      return;
    }

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
  }, [ready, userId, profile, profileHydration, segments, router, agreed]);

  const entered = hasEnteredApp(profile);

  useEffect(() => {
    if (!ready || !userId) return;
    void registerPushTokenAsync();
    return listenForPushTokenChanges();
  }, [ready, userId]);

  // Open the screen a notification points at: cold start (killed app), background, and foreground taps.
  const handledColdStart = useRef(false);
  const lastHandledResponse = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !userId || profileHydration === 'loading' || !entered) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      // Reply / Mark as read are handled in the background by installNotificationActions.
      if (isNotificationAction(response)) return;
      const url = notificationUrl(response);
      if (!response || !url) return;
      const id = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (lastHandledResponse.current === id) return;
      lastHandledResponse.current = id;
      router.push(url as never);
    };
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      const initial = Notifications.getLastNotificationResponse();
      if (initial) {
        Notifications.clearLastNotificationResponse();
        open(initial);
      }
    }
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready, userId, profileHydration, entered, router]);

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
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Caveat_600SemiBold,
  });
  const [fontTimeout, setFontTimeout] = useState(false);

  // AuthGate hides the splash once bootstrap finishes; this is only a backstop.
  useEffect(() => {
    const fonts = setTimeout(() => setFontTimeout(true), 5000);
    const splash = setTimeout(() => SplashScreen.hideAsync().catch(() => undefined), 20000);
    return () => {
      clearTimeout(fonts);
      clearTimeout(splash);
    };
  }, []);

  if (!fontsLoaded && !fontError && !fontTimeout) {
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
                animation: 'none',
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
