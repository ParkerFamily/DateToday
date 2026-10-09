import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
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
  /** Planner's IANA zone, so emails can show the local time. */
  timeZone?: string | null;
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
  status?: 'proposed' | 'accepted' | 'declined' | 'canceled';
  respondedBy?: string;
  canceledBy?: string;
  createdAt: Date | null;
  /** Still only on this device; the server hasn't confirmed it yet. */
  pending?: boolean;
  /** Gave up waiting for the server; the bubble offers a retry. */
  failed?: boolean;
};

export type InterestResult = {
  mutual: boolean;
  /** True only when this heart created the match (so the celebration shows once). */
  created: boolean;
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
    body: JSON.stringify({ toUid, tzOffsetMinutes: new Date().getTimezoneOffset() }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<InterestResult> & { error?: string; code?: string };
  if (!res.ok) {
    throw Object.assign(new Error(json.error || 'Couldn’t send that. Try again.'), { code: json.code ?? null });
  }
  return {
    mutual: Boolean(json.mutual),
    // Older servers didn't send `created`; fall back to the previous behavior.
    created: typeof json.created === 'boolean' ? json.created : Boolean(json.mutual),
    matchId: json.matchId ?? null,
    other: json.other ?? null,
  };
}

/** People I've already hearted (so the Live feed doesn't show them again). */
export function subscribeSentInterests(uid: string, onChange: (toUids: Set<string>) => void) {
  const q = query(
    collection(getDb(), 'interests'), 
    where('fromUid', '==', uid),
    limit(500)
  );
  let alive = true;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let unsub = () => {};
  const listen = () => {
    unsub = onSnapshot(
      q,
      (snap) => onChange(new Set(snap.docs.map((d) => String(d.data().toUid ?? '')))),
      () => {
        if (alive) retry = setTimeout(() => alive && listen(), 5000);
      },
    );
  };
  listen();
  return () => {
    alive = false;
    if (retry) clearTimeout(retry);
    unsub();
  };
}

export function isMatchLimitError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'match_limit';
}

export type RevealedLike = {
  uid: string;
  displayName: string;
  mainPhotoUrl: string | null;
  verificationStatus: string;
  likedAt: string | null;
};

/**
 * "Likes you", as the server allows this member to see it. Locked likes carry only a tiny blurred
 * thumbnail (data URI) — no uid, name or photo URL.
 */
export type LikesFeed = {
  plus: boolean;
  total: number;
  revealed: RevealedLike[];
  locked: { blur: string | null }[];
};

/** `fresh` re-checks DateToday+ with the store (after a purchase or restore). */
export async function fetchLikes(fresh = false): Promise<LikesFeed> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const res = await fetch(`${functionsUrl('getLikes')}${fresh ? '?fresh=1' : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as Partial<LikesFeed> & { error?: string };
  if (!res.ok) throw new Error(json.error || 'Couldn’t load your likes right now.');
  return {
    plus: Boolean(json.plus),
    total: Number(json.total) || 0,
    revealed: Array.isArray(json.revealed) ? json.revealed : [],
    locked: Array.isArray(json.locked) ? json.locked : [],
  };
}

/** Fires whenever someone new likes me or a like turns into a match (and once on subscribe). */
export function subscribeLikeInbox(uid: string, onChange: () => void, onError?: (error: Error) => void) {
  return onSnapshot(
    doc(getDb(), 'likeInbox', uid),
    () => onChange(),
    (error) => onError?.(error),
  );
}

export type PublicCard = {
  uid: string;
  displayName: string;
  mainPhotoUrl: string | null;
  verificationStatus: string;
};

/** null = profile deleted; undefined = couldn't load right now (retry later). */
export async function fetchPublicCard(uid: string): Promise<PublicCard | null | undefined> {
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
    return undefined;
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
  const q = query(
    collection(getDb(), 'matches'), 
    where('userIds', 'array-contains', uid),
    limit(500)
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => parseMatch(d.id, d.data({ serverTimestamps: 'estimate' })));
      // Already sorted by lastActivityAt desc from query
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
    { includeMetadataChanges: true },
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
            canceledBy: data.canceledBy as string | undefined,
            createdAt: toDate(data.createdAt),
            pending: d.metadata.hasPendingWrites,
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

/** End the match for both people (no block). The chat and both hearts are deleted. */
export async function unmatch(matchId: string): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl('unmatchUser'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || 'Couldn’t unmatch. Try again.');
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

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export async function proposeDate(matchId: string, proposal: DateProposal) {
  await addDoc(collection(getDb(), 'matches', matchId, 'messages'), {
    senderId: requireUid(),
    type: 'date_proposal',
    proposal: cleanProposal({ timeZone: deviceTimeZone(), ...proposal }),
    status: 'proposed',
    createdAt: serverTimestamp(),
  });
}

export async function respondToDate(matchId: string, messageId: string, status: 'accepted' | 'declined') {
  await updateDoc(doc(getDb(), 'matches', matchId, 'messages', messageId), {
    status,
    respondedBy: requireUid(),
    respondedAt: serverTimestamp(),
  });
}

/** Call off a confirmed date; the other person gets a push and an email. */
export async function cancelDate(matchId: string, messageId: string) {
  await updateDoc(doc(getDb(), 'matches', matchId, 'messages', messageId), {
    status: 'canceled',
    canceledBy: requireUid(),
    canceledAt: serverTimestamp(),
  });
}

export async function markMatchRead(matchId: string, shareReceipt = true, clearUnread = true) {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  await Promise.all([
    clearUnread
      ? updateDoc(doc(getDb(), 'matches', matchId), { [`unread.${uid}`]: 0 }).catch(() => undefined)
      : undefined,
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
