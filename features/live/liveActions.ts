import { functionsUrl } from '@/features/matches/api';
import { getFirebaseAuth } from '@/lib/firebase/client';

export type LiveActionKind = 'stay' | 'offline';
export type LiveActionResult = { live: boolean; expiresAt: string | null };

/**
 * Stay Live / Go Offline through the server so a notification tap (app in the background)
 * and an in-app tap behave the same. `nonce` makes a repeated tap a no-op.
 */
export async function callLiveAction(action: LiveActionKind, nonce?: string): Promise<LiveActionResult> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Signed out');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl('liveAction'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<LiveActionResult> & { error?: string };
  if (!res.ok) throw new Error(json.error || `liveAction ${res.status}`);
  return { live: Boolean(json.live), expiresAt: json.expiresAt ?? null };
}
