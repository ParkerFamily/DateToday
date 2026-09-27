import {
  addDoc,
  collection,
  doc,
  getDoc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { env } from '@/lib/env';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';

export type MatchUser = { displayName: string; mainPhotoUrl: string | null };

export type DateProposal = {
  activity?: string | null;
  activityLabel?: string | null;
  whenLabel?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  neighborhood?: string | null;
  venueLat?: number | null;
  venueLng?: number | null;
  /** ISO start time; whenLabel stays the human-readable copy. */
  startsAt?: string | null;
  note?: string | null;
};

export type MatchDoc = {
  id: string;
  userIds: string[];
  users: Record<string, MatchUser>;
  createdAt: Date | null;
  lastActivityAt: Date | null;
  lastMessage: { text: string; senderId: string; type: string; messageId: string } | null;
  nextDate: (DateProposal & { messageId?: string; proposerId?: string }) | null;
  unread: Record<string, number>;
};

export type MatchMessage = {
  id: string;
  senderId: string;
  type: 'text' | 'date_proposal';
  text?: string;
  proposal?: DateProposal;
  status?: 'proposed' | 'accepted' | 'declined';
  respondedBy?: string;
  createdAt: Date | null;
};

export type InterestResult = {
  mutual: boolean;
  matchId: string | null;
  other: ({ uid: string } & MatchUser) | null;
};

function toDate(value: unknown): Date | null {
  if (value && typeof (value as Timestamp).toDate === 'function') return (value as Timestamp).toDate();
  return null;
}

export function functionsUrl(name: string) {
  const projectId = env.firebaseProjectId || 'datetoday-e1331';
  return `https://us-central1-${projectId}.cloudfunctions.net/${name}`;
}

/** Heart someone. If they already hearted you back, the server creates the match. */
export async function sendInterest(toUid: string): Promise<InterestResult> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl('sendInterest'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUid }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<InterestResult> & { error?: string };
  if (!res.ok) throw new Error(json.error || 'Couldn’t send that. Try again.');
  return { mutual: Boolean(json.mutual), matchId: json.matchId ?? null, other: json.other ?? null };
}

/** People I've already hearted (so the Live feed doesn't show them again). */
export function subscribeSentInterests(uid: string, onChange: (toUids: Set<string>) => void) {
  const q = query(collection(getDb(), 'interests'), where('fromUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => onChange(new Set(snap.docs.map((d) => String(d.data().toUid ?? '')))),
    () => undefined,
  );
}

export type ReceivedInterest = { fromUid: string; createdAt: Date | null };

/** People who hearted me (newest first). */
export function subscribeReceivedInterests(uid: string, onChange: (rows: ReceivedInterest[]) => void) {
  const q = query(collection(getDb(), 'interests'), where('toUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return { fromUid: String(data.fromUid ?? ''), createdAt: toDate(data.createdAt) };
      });
      rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      onChange(rows);
    },
    () => onChange([]),
  );
}

export type PublicCard = {
  uid: string;
  displayName: string;
  mainPhotoUrl: string | null;
  verificationStatus: string;
};

export async function fetchPublicCard(uid: string): Promise<PublicCard | null> {
  try {
    const snap = await getDoc(doc(getDb(), 'profiles', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid,
      displayName: String(d.displayName ?? 'Member'),
      mainPhotoUrl: (d.mainPhotoUrl as string | null) ?? null,
      verificationStatus: String(d.verificationStatus ?? 'unverified'),
    };
  } catch {
    return null;
  }
}

function parseMatch(id: string, data: Record<string, unknown>): MatchDoc {
  return {
    id,
    userIds: (data.userIds as string[]) ?? [],
    users: (data.users as Record<string, MatchUser>) ?? {},
    createdAt: toDate(data.createdAt),
    lastActivityAt: toDate(data.lastActivityAt),
    lastMessage: (data.lastMessage as MatchDoc['lastMessage']) ?? null,
    nextDate: (data.nextDate as MatchDoc['nextDate']) ?? null,
    unread: (data.unread as Record<string, number>) ?? {},
  };
}

export function otherUserId(match: MatchDoc, me: string) {
  return match.userIds.find((u) => u !== me) ?? '';
}

export function subscribeMatches(
  uid: string,
  onChange: (matches: MatchDoc[]) => void,
  onError?: (error: Error) => void,
) {
  const q = query(collection(getDb(), 'matches'), where('userIds', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => parseMatch(d.id, d.data({ serverTimestamps: 'estimate' })));
      rows.sort(
        (a, b) =>
          (b.lastActivityAt?.getTime() ?? b.createdAt?.getTime() ?? 0) -
          (a.lastActivityAt?.getTime() ?? a.createdAt?.getTime() ?? 0),
      );
      onChange(rows);
    },
    (error) => onError?.(error),
  );
}

export function subscribeMatch(
  matchId: string,
  onChange: (match: MatchDoc | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(getDb(), 'matches', matchId),
    (snap) => onChange(snap.exists() ? parseMatch(snap.id, snap.data({ serverTimestamps: 'estimate' })) : null),
    (error) => onError?.(error),
  );
}

export function subscribeMessages(
  matchId: string,
  onChange: (messages: MatchMessage[]) => void,
  onError?: (error: Error) => void,
) {
  const q = query(
    collection(getDb(), 'matches', matchId, 'messages'),
    orderBy('createdAt', 'asc'),
    limitToLast(300),
  );
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          return {
            id: d.id,
            senderId: String(data.senderId ?? ''),
            type: data.type === 'date_proposal' ? 'date_proposal' : 'text',
            text: typeof data.text === 'string' ? data.text : undefined,
            proposal: (data.proposal as DateProposal) ?? undefined,
            status: data.status as MatchMessage['status'],
            respondedBy: data.respondedBy as string | undefined,
            createdAt: toDate(data.createdAt),
          };
        }),
      ),
    (error) => onError?.(error),
  );
}

function requireUid() {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  return uid;
}

export async function sendMatchMessage(matchId: string, text: string) {
  const body = text.trim().slice(0, 2000);
  if (!body) return;
  try {
    const docRef = await addDoc(collection(getDb(), 'matches', matchId, 'messages'), {
      senderId: requireUid(),
      type: 'text',
      text: body,
      createdAt: serverTimestamp(),
    });
    if (!docRef?.id) {
      throw new Error('Message was not created');
    }
  } catch (error) {
    console.error('[DateToday] sendMatchMessage failed:', error);
    throw error;
  }
}

function cleanProposal(p: DateProposal): DateProposal {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out as DateProposal;
}

export async function proposeDate(matchId: string, proposal: DateProposal) {
  try {
    const docRef = await addDoc(collection(getDb(), 'matches', matchId, 'messages'), {
      senderId: requireUid(),
      type: 'date_proposal',
      proposal: cleanProposal(proposal),
      status: 'proposed',
      createdAt: serverTimestamp(),
    });
    if (!docRef?.id) {
      throw new Error('Date proposal was not created');
    }
  } catch (error) {
    console.error('[DateToday] proposeDate failed:', error);
    throw error;
  }
}

export async function respondToDate(matchId: string, messageId: string, status: 'accepted' | 'declined') {
  await updateDoc(doc(getDb(), 'matches', matchId, 'messages', messageId), {
    status,
    respondedBy: requireUid(),
    respondedAt: serverTimestamp(),
  });
}

export async function markMatchRead(matchId: string, shareReceipt = true) {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  await Promise.all([
    updateDoc(doc(getDb(), 'matches', matchId), { [`unread.${uid}`]: 0 }).catch(() => undefined),
    shareReceipt
      ? setDoc(
          doc(getDb(), 'matches', matchId, 'members', uid),
          { lastReadAt: serverTimestamp() },
          { merge: true },
        ).catch(() => undefined)
      : undefined,
  ]);
}

/** Per-person chat state (read receipts + typing), kept off the match doc so typing doesn't churn the inbox. */
export type MemberChatState = { lastReadAt: Date | null; typingAt: Date | null };

export function subscribeMemberState(
  matchId: string,
  uid: string,
  onChange: (state: MemberChatState) => void,
) {
  return onSnapshot(
    doc(getDb(), 'matches', matchId, 'members', uid),
    (snap) => {
      const data = snap.data() ?? {};
      onChange({ lastReadAt: toDate(data.lastReadAt), typingAt: toDate(data.typingAt) });
    },
    () => onChange({ lastReadAt: null, typingAt: null }),
  );
}

export async function setTyping(matchId: string, typing: boolean) {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  await setDoc(
    doc(getDb(), 'matches', matchId, 'members', uid),
    { typingAt: typing ? serverTimestamp() : null },
    { merge: true },
  ).catch(() => undefined);
}

export function proposalSummary(p: DateProposal | null | undefined) {
  if (!p) return 'a date';
  return [p.activityLabel || p.activity, p.whenLabel, p.venueName].filter(Boolean).join(' · ') || 'a date';
}
