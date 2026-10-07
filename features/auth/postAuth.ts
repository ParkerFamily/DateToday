import { loadUserProfile } from '@/features/profile/saveOnboarding';
import { recordLegalConsent } from '@/features/consent/recordConsent';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { hasEnteredApp } from '@/utils/accountEntry';
import * as Location from 'expo-location';

type AppRouter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace: (href: any) => void;
};

type SocialUser = {
  id: string;
  email: string | null;
  displayName?: string | null;
  isNewUser: boolean;
  provider?: 'google' | 'apple';
};

/**
 * Request location permission if iOS hasn't been asked yet (undetermined status).
 * This ensures iOS will show location in Settings after the first request.
 * Never shows an alert; just asks once so the permission appears in Settings.
 * 
 * iOS quirk: Location permission won't appear in Settings until the app requests it at least once.
 * This function ensures all users (new and existing) get prompted, fixing the issue where
 * existing users who skip onboarding never see the location permission option in Settings.
 */
export async function ensureLocationPermissionAsked(): Promise<void> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    
    let granted = false;
    // Only request if never asked before (iOS won't show in Settings until we ask)
    if (status === Location.PermissionStatus.UNDETERMINED) {
      const result = await Location.requestForegroundPermissionsAsync();
      granted = result.status === 'granted';
      useSessionStore.getState().setLocationGranted(granted);
    } else {
      // Update store with current status
      granted = status === 'granted';
      useSessionStore.getState().setLocationGranted(granted);
    }
    
    // Update Firestore profileCompletion.location if needed
    const { updateLocationCompletion } = await import('@/features/profile/updateLocationCompletion');
    await updateLocationCompletion(granted);
  } catch (error) {
    // Silently fail - location is optional and we'll ask again later if needed
    console.log('[Location] Could not request permission on post-auth:', error);
  }
}

/**
 * After Google/Apple:
 * - Auth-only (no Firestore enter flags) → onboarding (email/password still skipped)
 * - Finished setup OR previously skipped setup → tabs
 */
export async function continueAfterSocialAuth(
  user: SocialUser,
  router: AppRouter,
): Promise<void> {
  const setAuth = useSessionStore.getState().setAuth;
  const setProfile = useSessionStore.getState().setProfile;
  const setPreferences = useSessionStore.getState().setPreferences;
  const setProfileHydration = useSessionStore.getState().setProfileHydration;
  
  // Clear any stale draft data from previous account before loading this user
  const currentUserId = useSessionStore.getState().userId;
  if (currentUserId && currentUserId !== user.id) {
    useOnboardingDraft.getState().reset();
  }
  
  const applySocialProfile = useOnboardingDraft.getState().applySocialProfile;
  const setEmail = useOnboardingDraft.getState().setEmail;

  setAuth(user.id, user.email);
  setProfileHydration('loading');

  if (user.provider === 'google' || user.provider === 'apple') {
    applySocialProfile({
      email: user.email,
      displayName: user.displayName ?? null,
      provider: user.provider,
    });
  } else if (user.email) {
    setEmail(user.email);
  }

  if (useOnboardingDraft.getState().legalConsentAccepted) {
    await recordLegalConsent(user.isNewUser ? 'signup' : 'welcome_continue').catch(() => undefined);
  }

  try {
    const saved = await loadUserProfile(user.id);

    // Entered the app before (complete OR skip setup persisted on account).
    if (saved && hasEnteredApp(saved.profile)) {
      setProfile(saved.profile);
      setPreferences(saved.preferences);
      if (saved.hasLegalConsent) {
        useOnboardingDraft.getState().acceptLegalConsent();
      }
      setProfileHydration('done');
      
      // Request location permission if iOS hasn't been asked yet.
      // This ensures the permission shows up in iOS Settings even for existing users.
      void ensureLocationPermissionAsked();
      
      router.replace('/(tabs)/live');
      return;
    }

    // Auth stub / partial Firestore — resume onboarding, never treat as done.
    if (saved?.profile) {
      const draft = useOnboardingDraft.getState();
      if (saved.hasLegalConsent) {
        draft.acceptLegalConsent();
      }
      if (saved.profile.legalName && !draft.legalName.trim()) {
        draft.setLegalName(saved.profile.legalName);
      }
      if (saved.profile.displayName && !draft.displayName.trim()) {
        draft.setDisplayName(saved.profile.displayName);
      }
      if (saved.dateOfBirth && !draft.dateOfBirth) {
        draft.setDateOfBirth(saved.dateOfBirth);
      }
      if (saved.profile.genderId) {
        draft.setGender(saved.profile.genderId as 'woman' | 'man' | 'nonbinary');
      }
      if (saved.preferences?.interestedIn) {
        draft.setInterestedIn(saved.preferences.interestedIn);
      }
      if (saved.preferences?.intentions?.length) {
        for (const vibe of saved.preferences.intentions) {
          if (!draft.vibes.includes(vibe)) draft.toggleVibe(vibe);
        }
      }
      if (saved.profile.mainPhotoUrl && !draft.mainPhotoUri) {
        draft.setMainPhotoUri(saved.profile.mainPhotoUrl);
      }
      setProfile(saved.profile);
      setPreferences(saved.preferences);
    }
  } catch {
    // No Firestore doc yet — fall through to onboarding.
  } finally {
    setProfileHydration('done');
  }

  router.replace('/(onboarding)/name');
}
