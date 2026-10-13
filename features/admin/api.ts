import { getFirebaseAuth } from '@/lib/firebase/client';
import { functionsUrl } from '@/features/matches/api';

export type Overview = {
  at: number;
  accounts: {
    total: number;
    disabled: number;
    signups24h: number;
    signups7d: number;
    active24h: number;
    active7d: number;
    truncated: boolean;
  };
  profiles: number;
  verified: number;
  matches: number;
  matches24h: number;
  openReports: number;
  plusOn: number;
  liveNow: number;
};

export type UserRow = {
  uid: string;
  name: string | null;
  email: string | null;
  photo: string | null;
  age: number | null;
  verified: boolean;
  disabled: boolean;
  admin: boolean;
  exists: boolean;
  live: boolean;
  createdAt: number;
  lastActiveAt: number;
};

export type ReportStatus = 'open' | 'under_review' | 'actioned' | 'closed';

export type ReportRow = {
  id: string;
  status: ReportStatus;
  reason: string | null;
  details: string | null;
  contentType: string | null;
  createdAt: number;
  reporter: { uid: string | null; name: string | null };
  reported: { uid: string | null; name: string | null };
  reportedMessage: { type: string; text: string | null; gifId: string | null } | null;
  hasConversation: boolean;
  adminNote: string | null;
};

export type ReportLine = {
  mine: boolean;
  from: string | null;
  type: string;
  text: string | null;
  gifId: string | null;
  reported: boolean;
  at: number;
};

export type UserDetail = {
  uid: string;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  providers: string[];
  disabled: boolean;
  admin: boolean;
  createdAt: number;
  lastSignInAt: number;
  lastActiveAt: number;
  age: number | null;
  gender: string | null;
  interestedIn: string | null;
  datingIntention: string | null;
  bio: string | null;
  occupation: string | null;
  onboardingComplete: boolean;
  verificationStatus: string;
  photos: string[];
  videos: string[];
  live: { active: boolean; until: number; area: string | null; boosted: boolean } | null;
  plus: {
    app: { on: boolean; source: string | null; productId: string | null; expiresAt: number } | null;
    web: { on: boolean; status: string | null; plan: string | null; expiresAt: number } | null;
  };
  moderation: { banned: boolean; reason: string | null; bannedAt: number; unbannedAt: number } | null;
  counts: {
    matches: number;
    reportsAgainst: number;
    reportsBy: number;
    blocksBy: number;
    blockedBy: number;
    likesSent: number;
    likesReceived: number;
  };
  pushDevices: number;
  devices: { label: string; platform: string; place: string; lastActiveAt: number; signedOut: boolean }[];
  reports: ReportRow[];
  log: { action: string; at: number; detail: Record<string, unknown> }[];
};

export type LiveRow = {
  uid: string;
  name: string | null;
  age: number | null;
  photo: string | null;
  area: string | null;
  until: number;
  startedAt: number;
  boosted: boolean;
  verified: boolean;
  travel: boolean;
};

export type FreeLikesConfig = { enabled: boolean; starter: number; verifiedBonus: number; videoBonus: number };
export type PriorityLikesConfig = { enabled: boolean; noteMaxChars: number; dailyLimit: number };
export type FriendDateConfig = { enabled: boolean; freeSessionsPerWeek: number; passHours: number };

export type BroadcastResult = {
  dryRun: boolean;
  optedIn: number;
  willReceive: number;
  capped: number;
  noDevice: number;
};

export type LogEntry = {
  id: string;
  action: string;
  at: number;
  byEmail: string | null;
  targetUid: string | null;
  targetName: string | null;
  detail: Record<string, unknown>;
};

async function adminPost<T>(action: string, body: object = {}): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in again and retry.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(functionsUrl('admin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ action, ...body }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The server took too long. Try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

let ownerCheck: { uid: string; admin: Promise<boolean> } | null = null;

/** True when the signed-in account carries the `admin` claim. Refreshes the token once per run to pick up new claims. */
export function isOwnerAdmin(): Promise<boolean> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return Promise.resolve(false);
  if (ownerCheck?.uid === user.uid) return ownerCheck.admin;
  const admin = user
    .getIdTokenResult(true)
    .then((r) => r.claims.admin === true)
    .catch(() => false);
  ownerCheck = { uid: user.uid, admin };
  return admin;
}

export const adminApi = {
  overview: () => adminPost<Overview>('overview'),
  users: (query: string) => adminPost<{ users: UserRow[] }>('users', { query }).then((r) => r.users),
  user: (uid: string) => adminPost<UserDetail>('user', { uid }),
  ban: (uid: string, reason: string) => adminPost('ban', { uid, reason }),
  unban: (uid: string) => adminPost('unban', { uid }),
  signOut: (uid: string) => adminPost<{ devices: number }>('signOut', { uid }),
  endLive: (uid: string) => adminPost<{ ended: boolean }>('endLive', { uid }),
  setVerification: (uid: string, status: 'verified' | 'unverified' | 'failed') =>
    adminPost('setVerification', { uid, status }),
  deleteUser: (uid: string) => adminPost('deleteUser', { uid, confirm: uid }),
  pushUser: (uid: string, title: string, body: string) => adminPost<{ devices: number }>('pushUser', { uid, title, body }),
  broadcast: (input: { title: string; body: string; url: string; send: boolean }) =>
    adminPost<BroadcastResult>('broadcast', input),
  reports: (status: ReportStatus | 'all') => adminPost<{ reports: ReportRow[] }>('reports', { status }).then((r) => r.reports),
  report: (id: string) => adminPost<{ report: ReportRow; conversation: ReportLine[] }>('report', { id }),
  resolveReport: (id: string, status: ReportStatus, note?: string) => adminPost('resolveReport', { id, status, note }),
  live: () => adminPost<{ live: LiveRow[] }>('live').then((r) => r.live),
  config: () =>
    adminPost<{ freeLikes: FreeLikesConfig; priorityLikes: PriorityLikesConfig; friendDate?: FriendDateConfig }>('config'),
  setFreeLikes: (value: FreeLikesConfig) => adminPost('setConfig', { key: 'freeLikes', value }),
  setFriendDate: (value: FriendDateConfig) => adminPost('setConfig', { key: 'friendDate', value }),
  log: () => adminPost<{ log: LogEntry[] }>('log').then((r) => r.log),
};

export function ago(at: number, now = Date.now()) {
  if (!at) return '—';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function stamp(at: number) {
  if (!at) return '—';
  return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
