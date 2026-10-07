import { Alert, Linking, Platform } from 'react-native';
import { functionsUrl } from '@/features/matches/api';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { friendlyError } from '@/lib/errors';

type CalendarLinks = { icsUrl: string; googleUrl: string };

async function fetchCalendarLinks(matchId: string, messageId: string): Promise<CalendarLinks> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Signed out');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl('createCalendarLink'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, messageId }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<CalendarLinks> & { error?: string };
  if (!res.ok || !json.icsUrl || !json.googleUrl) throw new Error(json.error || 'Try again in a moment.');
  return { icsUrl: json.icsUrl, googleUrl: json.googleUrl };
}

/**
 * iOS hands the .ics to Calendar's own "Add" sheet; Android opens a prefilled Google Calendar event.
 * No calendar permission needed either way.
 */
export async function addDateToCalendar(matchId: string, messageId: string): Promise<void> {
  try {
    const { icsUrl, googleUrl } = await fetchCalendarLinks(matchId, messageId);
    await Linking.openURL(Platform.OS === 'ios' ? icsUrl : googleUrl);
  } catch (error) {
    Alert.alert('Couldn’t add to calendar', friendlyError(error, 'Try again in a moment.'));
  }
}
