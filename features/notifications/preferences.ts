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
  | 'liveUpdates'
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
  liveUpdates: true,
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
  { key: 'reminders', label: 'Live reminders', detail: 'Before your Live session ends, with Stay Live / Go Offline' },
  {
    key: 'liveUpdates',
    label: 'Live tonight',
    detail: 'When people near you go Live, and a nudge if you’re still Live. A few a night at most.',
  },
  {
    key: 'promotions',
    label: 'Tonight nudges & offers',
    detail: 'A heads-up when tonight looks good to go live, plus DateToday+ deals. Max one a day.',
  },
  { key: 'system', label: 'Account & security', detail: 'Verification results and new sign-ins', locked: true },
];

/** Keys must match PREF_FOR_CATEGORY in functions/email.js. */
export type EmailPrefKey = 'emailActivity' | 'emailNews';
export type EmailPrefs = Record<EmailPrefKey, boolean>;

export const DEFAULT_EMAIL_PREFS: EmailPrefs = {
  emailActivity: true,
  // Marketing email is opt-in, same as promotional pushes.
  emailNews: false,
};

export const EMAIL_PREF_ROWS: { key: EmailPrefKey; label: string; detail: string }[] = [
  {
    key: 'emailActivity',
    label: 'Matches & likes',
    detail: 'A daily recap when people like you, and new matches if push is off',
  },
  { key: 'emailNews', label: 'News & offers', detail: 'New features and DateToday+ deals. A few a month at most.' },
];

function withDefaults(data: Partial<NotificationPrefs> | undefined): NotificationPrefs {
  const merged = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of Object.keys(merged) as NotificationPrefKey[]) {
    if (typeof data?.[key] === 'boolean') merged[key] = data[key] as boolean;
  }
  merged.system = true;
  return merged;
}

function emailWithDefaults(data: Partial<EmailPrefs> | undefined): EmailPrefs {
  return {
    emailActivity: typeof data?.emailActivity === 'boolean' ? data.emailActivity : DEFAULT_EMAIL_PREFS.emailActivity,
    emailNews: typeof data?.emailNews === 'boolean' ? data.emailNews : DEFAULT_EMAIL_PREFS.emailNews,
  };
}

export function subscribeEmailPrefs(uid: string, onChange: (prefs: EmailPrefs) => void) {
  return onSnapshot(
    doc(getDb(), 'notificationPrefs', uid),
    (snap) => onChange(emailWithDefaults(snap.data() as Partial<EmailPrefs> | undefined)),
    () => undefined,
  );
}

export async function setEmailPref(uid: string, key: EmailPrefKey, value: boolean) {
  await setDoc(doc(getDb(), 'notificationPrefs', uid), { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
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
