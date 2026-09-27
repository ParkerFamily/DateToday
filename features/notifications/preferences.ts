import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';

/** Keys must match `PREF_FOR_TYPE` in functions/index.js. */
export type NotificationPrefKey =
  | 'matches'
  | 'messages'
  | 'likes'
  | 'dateRequests'
  | 'dateUpdates'
  | 'reminders'
  | 'promotions'
  | 'system';

export type NotificationPrefs = Record<NotificationPrefKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  matches: true,
  messages: true,
  likes: true,
  dateRequests: true,
  dateUpdates: true,
  reminders: true,
  // Marketing needs an explicit opt-in (App Store 4.5.4).
  promotions: false,
  system: true,
};

export const NOTIFICATION_PREF_ROWS: { key: NotificationPrefKey; label: string; detail: string; locked?: boolean }[] = [
  { key: 'matches', label: 'New matches', detail: 'When someone you liked likes you back' },
  { key: 'messages', label: 'Messages', detail: 'New messages from your matches' },
  { key: 'likes', label: 'Likes', detail: 'When someone taps Interested on you' },
  { key: 'dateRequests', label: 'Date requests', detail: 'When a match proposes a plan' },
  { key: 'dateUpdates', label: 'Date confirmations & changes', detail: 'When a plan is accepted or declined' },
  { key: 'reminders', label: 'Reminders', detail: 'Before your live time runs out' },
  {
    key: 'promotions',
    label: 'Tonight nudges & offers',
    detail: 'A heads-up when tonight looks good to go live, plus DateToday+ deals. Max one a day.',
  },
  { key: 'system', label: 'Account & security', detail: 'Verification results and new sign-ins', locked: true },
];

function withDefaults(data: Partial<NotificationPrefs> | undefined): NotificationPrefs {
  const merged = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of Object.keys(merged) as NotificationPrefKey[]) {
    if (typeof data?.[key] === 'boolean') merged[key] = data[key] as boolean;
  }
  merged.system = true;
  return merged;
}

export function subscribeNotificationPrefs(
  uid: string,
  onChange: (prefs: NotificationPrefs) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(getDb(), 'notificationPrefs', uid),
    (snap) => onChange(withDefaults(snap.data() as Partial<NotificationPrefs> | undefined)),
    (error) => onError?.(error),
  );
}

export async function getNotificationPrefs(uid: string): Promise<NotificationPrefs> {
  try {
    const snap = await getDoc(doc(getDb(), 'notificationPrefs', uid));
    return withDefaults(snap.data() as Partial<NotificationPrefs> | undefined);
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export async function setNotificationPref(uid: string, key: NotificationPrefKey, value: boolean) {
  if (key === 'system') return;
  await setDoc(
    doc(getDb(), 'notificationPrefs', uid),
    { [key]: value, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
