import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { functionsUrl } from '@/features/matches/api';

export type InviteSummary = {
  code: string;
  link: string;
  invited: number;
  rewards: { likes: number; reveals: number; badge: boolean };
  milestones: { at: number; label: string; reached: boolean }[];
  next: { at: number; label: string; left: number } | null;
  /** Likes the friend gets for using the code. */
  friendLikes: number;
  /** This account can still enter a friend's code (new, and hasn't used one). */
  canRedeem: boolean;
  invitedBy: string | null;
};

async function post<T>(action: string, body: object = {}): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const res = await fetch(functionsUrl('referrals'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw Object.assign(new Error(json.error || 'Something went wrong. Try again.'), { code: json.code ?? null });
  }
  return json;
}

export const inviteSummary = () => post<InviteSummary>('summary');

export const redeemInvite = (code: string) => post<{ ok: true; friendLikes: number }>('redeem', { code });

const PENDING_KEY = 'datetoday.pendingInviteCode';
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

export function cleanInviteCode(raw: string | null | undefined) {
  const s = String(raw ?? '').toUpperCase();
  const fromLink = s.match(/(?:[?&]C=|INVITE\/)([A-Z0-9]{8})(?![A-Z0-9])/);
  const code = fromLink ? fromLink[1] : s.replace(/[^A-Z0-9]/g, '');
  return CODE.test(code) ? code : null;
}

/** A code from an invite link opened before signing up; used once the profile is finished. */
export async function savePendingInvite(raw: string) {
  const code = cleanInviteCode(raw);
  if (code) await AsyncStorage.setItem(PENDING_KEY, code).catch(() => undefined);
  return code;
}

export const pendingInvite = () => AsyncStorage.getItem(PENDING_KEY).then(cleanInviteCode).catch(() => null);

export const clearPendingInvite = () => AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
