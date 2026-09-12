import { hasEnteredApp } from '@/utils/accountEntry';
import type { Profile } from '@/types';

function profile(completion: Record<string, boolean>): Profile {
  return {
    userId: 'u1',
    displayName: 'Test',
    bio: null,
    genderId: null,
    datingIntention: null,
    heightCm: null,
    occupation: null,
    school: null,
    hometown: null,
    neighborhoodLabel: null,
    zodiac: null,
    verificationStatus: 'unverified',
    mainPhotoUrl: null,
    profileCompletion: completion,
    createdAt: '',
    updatedAt: '',
  };
}

describe('hasEnteredApp', () => {
  it('is false for auth-only / empty completion', () => {
    expect(hasEnteredApp(null)).toBe(false);
    expect(hasEnteredApp(profile({}))).toBe(false);
  });

  it('is true after full onboarding', () => {
    expect(hasEnteredApp(profile({ onboardingComplete: true }))).toBe(true);
  });

  it('is true after skip setup persisted on account', () => {
    expect(hasEnteredApp(profile({ setupSkipped: true, onboardingComplete: false }))).toBe(
      true,
    );
  });

  it('is true for legacy complete profiles missing nested flags', () => {
    const p = profile({});
    p.displayName = 'Alex';
    p.genderId = 'woman';
    p.mainPhotoUrl = 'https://example.com/p.jpg';
    p.dateOfBirth = '1998-01-01';
    expect(hasEnteredApp(p)).toBe(true);
  });

  it('is true when gender + intention exist even without photo flags', () => {
    const p = profile({});
    p.displayName = 'Alex';
    p.genderId = 'man';
    p.datingIntention = 'casual';
    expect(hasEnteredApp(p)).toBe(true);
  });
});
