import type { ProfileCompletionRequirements } from '@/types';
import {
  completionPercent,
  isProfileReadyForLive,
  missingLiveRequirements,
} from '@/utils/profileCompletion';

const complete: ProfileCompletionRequirements = {
  name: true,
  age: true,
  gender: true,
  preference: true,
  mainPhoto: true,
  videos: true,
  location: true,
  communityStandards: true,
};

describe('profileCompletion', () => {
  it('reports 100% when all requirements met', () => {
    expect(completionPercent(complete)).toBe(100);
    expect(isProfileReadyForLive(complete)).toBe(true);
    expect(missingLiveRequirements(complete)).toEqual([]);
  });

  it('lists missing live gates', () => {
    const partial: ProfileCompletionRequirements = {
      ...complete,
      videos: false,
      location: false,
    };
    expect(completionPercent(partial)).toBe(75);
    expect(isProfileReadyForLive(partial)).toBe(false);
    expect(missingLiveRequirements(partial)).toEqual(['Allow location access']);
  });

  it('does not require videos to go live', () => {
    const noVideos: ProfileCompletionRequirements = { ...complete, videos: false };
    expect(isProfileReadyForLive(noVideos)).toBe(true);
    expect(missingLiveRequirements(noVideos)).toEqual([]);
  });
});
