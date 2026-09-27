import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { functionsUrl } from '@/features/matches/api';
import { assertFirebaseConfigured, isBackendConfigured, env } from '@/lib/env';
import type { ReportReason } from '@/types';
import { analytics } from '@/lib/analytics';
import { useBlocksStore } from '@/store/blocks';

export type ModerationStatus = 'open' | 'under_review' | 'actioned' | 'closed';

export type BlockedUser = {
  id: string;
  blockedId: string;
  displayName: string | null;
  reason: string | null;
  createdAt: string | null;
};

function requireUid(): string {
  assertFirebaseConfigured();
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

async function callSafetyFunction(name: 'blockUser' | 'unblockUser', body: Record<string, unknown>) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl(name), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Try again.');
}

/**
 * Block someone for good. The server deletes the conversation, removes hearts
 * both ways, hides each person from the other everywhere, and prevents any
 * future match. Pass `report` to also file a report (the chat is kept on the
 * report as evidence before it's deleted).
 */
export async function blockUser(
  blockedId: string,
  reason?: string,
  displayName?: string | null,
  report?: { reason: ReportReason; details?: string },
): Promise<void> {
  if (!blockedId || blockedId === 'unknown') {
    throw new Error('Missing user to block.');
  }

  if (isBackendConfigured()) {
    const uid = requireUid();
    if (uid === blockedId) throw new Error('You can’t block yourself.');
    await callSafetyFunction('blockUser', {
      targetUid: blockedId,
      displayName: displayName ?? null,
      reason: reason ?? null,
      report: report ? { reason: report.reason, details: report.details?.trim() || null } : null,
    });
    await useBlocksStore.getState().addLocal({
      blockedId,
      displayName: displayName ?? null,
      reason: report?.reason ?? reason ?? null,
    });
    analytics.track('user_blocked');
    if (report) analytics.track('report_submitted', { reason: report.reason });
    return;
  }

  await useBlocksStore.getState().addLocal({
    blockedId,
    displayName: displayName ?? null,
    reason: reason ?? null,
  });
  if (env.supabaseUrl) {
    const { blockUserSupabase } = await import('./supabaseSafety');
    await blockUserSupabase(blockedId, reason);
    return;
  }
}

export async function unblockUser(blockedId: string): Promise<void> {
  if (isBackendConfigured()) {
    requireUid();
    await callSafetyFunction('unblockUser', { targetUid: blockedId });
    await useBlocksStore.getState().removeLocal(blockedId);
    return;
  }
  await useBlocksStore.getState().removeLocal(blockedId);
  if (env.supabaseUrl) {
    const { unblockUserSupabase } = await import('./supabaseSafety');
    await unblockUserSupabase(blockedId);
    return;
  }
}

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  if (isBackendConfigured()) {
    try {
      const uid = requireUid();
      const q = query(collection(getDb(), 'blocks'), where('blockerId', '==', uid));
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          blockedId: String(data.blockedId ?? ''),
          displayName: (data.displayName as string | null) ?? null,
          reason: (data.reason as string | null) ?? null,
          createdAt:
            data.createdAt && typeof data.createdAt.toDate === 'function'
              ? data.createdAt.toDate().toISOString()
              : null,
        };
      });
      await useBlocksStore.getState().replaceAll(
        rows.map((r) => ({
          blockedId: r.blockedId,
          displayName: r.displayName,
          reason: r.reason,
          blockedAt: r.createdAt ?? new Date().toISOString(),
        })),
      );
      return rows;
    } catch {
      /* fall through */
    }
  }

  return useBlocksStore.getState().list().map((e) => ({
    id: e.blockedId,
    blockedId: e.blockedId,
    displayName: e.displayName ?? null,
    reason: e.reason ?? null,
    createdAt: e.blockedAt,
  }));
}

export async function refreshBlockedUsers(): Promise<void> {
  await listBlockedUsers();
}

/** Keeps the store's hidden set in sync: people I blocked + people who blocked me. */
export function subscribeHiddenUsers(uid: string) {
  return onSnapshot(
    doc(getDb(), 'hiddenUsers', uid),
    (snap) => {
      const uids = snap.data()?.uids;
      useBlocksStore.getState().setHidden(Array.isArray(uids) ? uids.map(String) : []);
    },
    () => undefined,
  );
}

export async function reportUser(input: {
  reportedId: string;
  reason: ReportReason;
  details?: string;
  matchId?: string;
  dateId?: string;
  contentType?: 'profile' | 'photo' | 'video' | 'message' | 'behavior' | 'other';
  alsoBlock?: boolean;
  displayName?: string | null;
}): Promise<void> {
  if (!input.reportedId || input.reportedId === 'unknown') {
    throw new Error('Pick someone to report from their profile, or describe the issue in details.');
  }

  if (input.alsoBlock && isBackendConfigured()) {
    await blockUser(input.reportedId, input.reason, input.displayName, {
      reason: input.reason,
      details: input.details,
    });
    return;
  }

  if (isBackendConfigured()) {
    const uid = requireUid();
    if (uid === input.reportedId) throw new Error('You can’t report yourself.');
    await addDoc(collection(getDb(), 'reports'), {
      reporterId: uid,
      reportedId: input.reportedId,
      reason: input.reason,
      details: input.details?.trim() || null,
      matchId: input.matchId ?? null,
      dateId: input.dateId ?? null,
      contentType: input.contentType ?? 'profile',
      status: 'open' satisfies ModerationStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    analytics.track('report_submitted', { reason: input.reason });
  } else if (env.supabaseUrl) {
    const { reportUserSupabase } = await import('./supabaseSafety');
    await reportUserSupabase(input);
  } else {
    analytics.track('report_submitted', { reason: input.reason, local: true });
  }

  if (input.alsoBlock) {
    await blockUser(input.reportedId, input.reason, input.displayName);
  }
}
