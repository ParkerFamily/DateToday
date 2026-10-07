import 'expo-router/entry';
// Notification action taps after the app was swiped away run headless (no routes render),
// so their background task has to be defined from the entry, not the root layout.
import { defineAndroidActionTask } from './features/notifications/actions';

try {
  defineAndroidActionTask();
} catch {
  /* best effort: the root layout defines it again */
}
