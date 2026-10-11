import AsyncStorage from '@react-native-async-storage/async-storage';

export type TutorialType = 
  | 'swipe'      // Swipe right/left, matching
  | 'live'       // Going Live, Tonight settings
  | 'messaging'  // Chat, making plans
  | 'matches'    // Viewing matches, connections
  | 'profile';   // Profile setup tips

const TUTORIAL_PREFIX = 'datetoday.tutorial.';

/**
 * Check if the user has completed a specific tutorial.
 */
export async function hasCompletedTutorial(type: TutorialType): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(`${TUTORIAL_PREFIX}${type}`);
    return value === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark a tutorial as completed.
 */
export async function markTutorialCompleted(type: TutorialType): Promise<void> {
  try {
    await AsyncStorage.setItem(`${TUTORIAL_PREFIX}${type}`, 'true');
  } catch {
    // Silently fail
  }
}

/**
 * Reset a specific tutorial completion.
 */
export async function resetTutorial(type: TutorialType): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${TUTORIAL_PREFIX}${type}`);
  } catch {
    // Silently fail
  }
}

/**
 * Reset all tutorials (for settings).
 */
export async function resetAllTutorials(): Promise<void> {
  const types: TutorialType[] = ['swipe', 'live', 'messaging', 'matches', 'profile'];
  await Promise.all(types.map(type => resetTutorial(type)));
}

/**
 * Get completion status for all tutorials.
 */
export async function getAllTutorialStatus(): Promise<Record<TutorialType, boolean>> {
  const types: TutorialType[] = ['swipe', 'live', 'messaging', 'matches', 'profile'];
  const statuses = await Promise.all(
    types.map(type => hasCompletedTutorial(type))
  );
  
  return {
    swipe: statuses[0],
    live: statuses[1],
    messaging: statuses[2],
    matches: statuses[3],
    profile: statuses[4],
  };
}

// Legacy function names for backward compatibility
export const hasCompletedSwipeTutorial = () => hasCompletedTutorial('swipe');
export const markSwipeTutorialCompleted = () => markTutorialCompleted('swipe');
export const resetSwipeTutorial = () => resetTutorial('swipe');
