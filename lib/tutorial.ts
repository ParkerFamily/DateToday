import AsyncStorage from '@react-native-async-storage/async-storage';

const TUTORIAL_STORAGE_KEY = 'datetoday.swipeTutorial.completed';

/**
 * Check if the user has completed the swipe tutorial.
 */
export async function hasCompletedSwipeTutorial(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark the swipe tutorial as completed.
 */
export async function markSwipeTutorialCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
  } catch {
    // Silently fail
  }
}

/**
 * Reset tutorial completion (for testing purposes only).
 */
export async function resetSwipeTutorial(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    // Silently fail
  }
}
