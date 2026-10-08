import { ABOUT_YOU_PROMPTS, TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';
import type {
    DatingIntention,
    InterestOption,
    RadiusMiles,
    TonightActivity,
    VerificationStatus,
} from '@/types';
import { create } from 'zustand';

export type OnboardingAuthProvider = 'email' | 'google' | 'apple' | null;

export interface OnboardingDraft {
  /** Name on government ID — private, locked after onboarding. */
  legalName: string;
  /** Public name shown on the profile — editable later. */
  displayName: string;
  dateOfBirth: string; // YYYY-MM-DD
  email: string;
  password: string;
  /** How they signed up — social users skip email/password. */
  authProvider: OnboardingAuthProvider;
  gender: 'woman' | 'man' | 'nonbinary' | null;
  interestedIn: InterestOption | null;
  /** Your Vibe — max 2 */
  vibes: DatingIntention[];
  interests: string[];
  minAge: number;
  maxAge: number;
  radiusMiles: RadiusMiles;
  /** Selected About You prompt id */
  aboutPromptId: string | null;
  aboutVideoUri: string | null;
  tonightVideoUri: string | null;
  mainPhotoUri: string | null;
  bio: string;
  activities: TonightActivity[];
  availableUntilLabel: string;
  locationEnabled: boolean;
  notificationsEnabled: boolean;
  verificationStatus: VerificationStatus;
  personaInquiryId: string | null;
  /** User continued past linked Terms/Privacy/Guidelines (not a pre-checked box). */
  legalConsentAccepted: boolean;
  /** E.164 after SMS verify — removed; kept unused during migrate */
  phoneE164: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  /** Proof the signup email passed its code (before the account exists). Cleared when the email changes. */
  signupToken: string | null;
  setSignupToken: (token: string | null) => void;
  setLegalName: (name: string) => void;
  setDisplayName: (name: string) => void;
  setDateOfBirth: (dob: string) => void;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  setAuthProvider: (provider: OnboardingAuthProvider) => void;
  applySocialProfile: (input: {
    email: string | null;
    displayName: string | null;
    provider: 'google' | 'apple';
  }) => void;
  setGender: (gender: 'woman' | 'man' | 'nonbinary') => void;
  setInterestedIn: (value: InterestOption) => void;
  toggleVibe: (value: DatingIntention) => void;
  setInterests: (interests: string[]) => void;
  setAgeRange: (minAge: number, maxAge: number) => void;
  setRadiusMiles: (miles: RadiusMiles) => void;
  setAboutPromptId: (id: string) => void;
  setAboutVideoUri: (uri: string | null) => void;
  setTonightVideoUri: (uri: string | null) => void;
  setMainPhotoUri: (uri: string | null) => void;
  setBio: (bio: string) => void;
  toggleActivity: (activity: TonightActivity) => void;
  setAvailableUntilLabel: (label: string) => void;
  setLocationEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setVerification: (input: {
    status: VerificationStatus;
    inquiryId?: string | null;
  }) => void;
  acceptLegalConsent: () => void;
  setPhoneVerified: (phoneE164: string) => void;
  setEmailVerified: (verified?: boolean) => void;
  profilePercent: () => number;
  reset: () => void;
}

const initial = {
  legalName: '',
  displayName: '',
  dateOfBirth: '',
  email: '',
  password: '',
  authProvider: null as OnboardingAuthProvider,
  gender: null as 'woman' | 'man' | 'nonbinary' | null,
  interestedIn: null as InterestOption | null,
  vibes: [] as DatingIntention[],
  interests: [] as string[],
  minAge: 19,
  maxAge: 26,
  radiusMiles: 10 as RadiusMiles,
  aboutPromptId: null as string | null,
  aboutVideoUri: null as string | null,
  tonightVideoUri: null as string | null,
  mainPhotoUri: null as string | null,
  bio: '',
  activities: [] as TonightActivity[],
  availableUntilLabel: '11:00 PM',
  locationEnabled: false,
  notificationsEnabled: false,
  verificationStatus: 'unverified' as VerificationStatus,
  personaInquiryId: null as string | null,
  legalConsentAccepted: false,
  phoneE164: null as string | null,
  phoneVerified: false,
  emailVerified: false,
  signupToken: null as string | null,
};

function accountReady(state: typeof initial): boolean {
  if (state.authProvider === 'google' || state.authProvider === 'apple') {
    return Boolean(state.email.includes('@'));
  }
  return Boolean(state.email.includes('@') && state.password.length >= 8);
}

function percentFrom(state: typeof initial): number {
  const checks = [
    state.displayName.trim().length >= 2,
    Boolean(state.dateOfBirth),
    accountReady(state),
    Boolean(state.gender),
    Boolean(state.interestedIn),
    state.vibes.length >= 1,
    state.minAge >= 18 && state.maxAge >= state.minAge,
    Boolean(state.radiusMiles),
    Boolean(state.mainPhotoUri),
    Boolean(state.aboutPromptId && state.aboutVideoUri),
    Boolean(state.tonightVideoUri),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export { ABOUT_YOU_PROMPTS, TONIGHT_SIGNATURE_PROMPT };

export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export const useOnboardingDraft = create<OnboardingDraft>((set, get) => ({
  ...initial,
  setLegalName: (legalName) => set({ legalName }),
  setDisplayName: (displayName) => set({ displayName }),
  setDateOfBirth: (dateOfBirth) => set({ dateOfBirth }),
  setEmail: (email) =>
    set((state) => ({
      email,
      signupToken: state.email.trim().toLowerCase() === email.trim().toLowerCase() ? state.signupToken : null,
    })),
  setSignupToken: (signupToken) => set({ signupToken }),
  setPassword: (password) => set({ password }),
  setAuthProvider: (authProvider) => set({ authProvider }),
  applySocialProfile: ({ email, displayName, provider }) =>
    set((state) => ({
      authProvider: provider,
      // Never clobber what the user already typed.
      email: state.email.trim() || email?.trim() || '',
      legalName: state.legalName.trim() || displayName?.trim() || '',
      displayName: state.displayName.trim() || firstName(displayName),
      password: '',
    })),
  setGender: (gender) => set({ gender }),
  setInterestedIn: (interestedIn) => set({ interestedIn }),
  toggleVibe: (value) => {
    const current = get().vibes;
    if (current.includes(value)) {
      set({ vibes: current.filter((v) => v !== value) });
      return;
    }
    if (current.length >= 2) return;
    set({ vibes: [...current, value] });
  },
  setInterests: (interests) => set({ interests }),
  setAgeRange: (minAge, maxAge) => set({ minAge, maxAge }),
  setRadiusMiles: (radiusMiles) => set({ radiusMiles }),
  setAboutPromptId: (aboutPromptId) => set({ aboutPromptId, aboutVideoUri: null }),
  setAboutVideoUri: (aboutVideoUri) => set({ aboutVideoUri }),
  setTonightVideoUri: (tonightVideoUri) => set({ tonightVideoUri }),
  setMainPhotoUri: (mainPhotoUri) => set({ mainPhotoUri }),
  setBio: (bio) => set({ bio }),
  toggleActivity: (activity) => {
    const current = get().activities;
    set({
      activities: current.includes(activity)
        ? current.filter((a) => a !== activity)
        : [...current, activity],
    });
  },
  setAvailableUntilLabel: (availableUntilLabel) => set({ availableUntilLabel }),
  setLocationEnabled: (locationEnabled) => set({ locationEnabled }),
  setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
  setVerification: ({ status, inquiryId }) =>
    set({
      verificationStatus: status,
      personaInquiryId: inquiryId === undefined ? get().personaInquiryId : inquiryId,
    }),
  acceptLegalConsent: () => set({ legalConsentAccepted: true }),
  setPhoneVerified: (phoneE164) => set({ phoneE164, phoneVerified: true }),
  setEmailVerified: (verified = true) => set({ emailVerified: verified }),
  profilePercent: () => percentFrom(get()),
  reset: () =>
    set({
      ...initial,
      authProvider: null,
      aboutPromptId: null,
      aboutVideoUri: null,
      tonightVideoUri: null,
      activities: [],
      vibes: [],
      interests: [],
      verificationStatus: 'unverified',
      personaInquiryId: null,
      legalConsentAccepted: false,
      phoneE164: null,
      phoneVerified: false,
      emailVerified: false,
      signupToken: null,
    }),
}));
