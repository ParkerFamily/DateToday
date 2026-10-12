import AsyncStorage from '@react-native-async-storage/async-storage';

const TOUR_KEY = 'datetoday.tour.v1';
let shownThisRun = false;

/** True the first time someone lands in the app on this device (once per app run at most). */
export async function shouldShowAppTour(): Promise<boolean> {
  if (shownThisRun) return false;
  const done = await AsyncStorage.getItem(TOUR_KEY).catch(() => 'true');
  if (done === 'true' || shownThisRun) return false;
  shownThisRun = true;
  return true;
}

export async function markAppTourSeen() {
  shownThisRun = true;
  await AsyncStorage.setItem(TOUR_KEY, 'true').catch(() => undefined);
}

/** The tour was finished or skipped on this device (prompts wait until then). */
export async function appTourSeen(): Promise<boolean> {
  return (await AsyncStorage.getItem(TOUR_KEY).catch(() => 'true')) === 'true';
}
