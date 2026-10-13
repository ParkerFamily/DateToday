import { getFirebaseAuth } from '@/lib/firebase/client';
import { functionsUrl } from '@/features/matches/api';

/** From the friendDate function. limit/left are null when unlimited (DateToday+). */
export type FriendDateSummary = {
  enabled: boolean;
  plus: boolean;
  limit: number | null;
  used: number;
  left: number | null;
  /** When the oldest session this week frees up, once they're out. */
  resetsAt: string | null;
  /** Friend Date Live is allowed until then without using another session. */
  passUntil: string | null;
  counted?: boolean;
};

async function post(action: 'summary' | 'start'): Promise<FriendDateSummary> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const res = await fetch(functionsUrl('friendDate'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const json = (await res.json().catch(() => ({}))) as FriendDateSummary & { error?: string; code?: string };
  if (!res.ok) {
    throw Object.assign(new Error(json.error || 'Something went wrong. Try again.'), { code: json.code ?? null });
  }
  return json;
}

export const friendDateSummary = () => post('summary');

/**
 * Call before going Live (or switching Live) in Friend Date. Uses one of this week's free sessions
 * unless a pass is still running or they have DateToday+. Throws code 'friend_date_limit' when out.
 */
export const startFriendDate = () => post('start');

/** "2 of 3 free Friend Dates left this week" style copy; null for unlimited. */
export function friendDateAllowanceLabel(s: FriendDateSummary | null | undefined): string | null {
  if (s && !s.enabled) return 'Friend Date is paused right now';
  if (!s || s.left == null || s.limit == null) return null;
  if (s.passUntil) return 'Friend Date is on for tonight';
  if (s.left <= 0) return 'No free Friend Dates left this week';
  return `${s.left} of ${s.limit} free Friend Date${s.limit === 1 ? '' : 's'} left this week`;
}
