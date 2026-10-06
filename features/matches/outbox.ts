import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore';
import { create } from 'zustand';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';

/**
 * Chat outbox. Firestore's RN SDK keeps unsent writes in memory only, so a message typed while
 * the connection is bad would vanish if the app is killed. Every message is saved here first
 * (with a client-generated id, so a resend can never duplicate) and removed once the server has it.
 */
export type OutboxMessage = {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  queuedAt: number;
  failed?: boolean;
};

const STORAGE_KEY = 'datetoday.chatOutbox.v1';
/** After this long without a server ack the bubble offers "Tap to retry". */
const SEND_TIMEOUT_MS = 15000;
/** Give up on messages that have sat undelivered for days. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export const useOutbox = create<{ items: OutboxMessage[] }>(() => ({ items: [] }));

function isOutboxMessage(v: unknown): v is OutboxMessage {
  const o = v as OutboxMessage;
  return Boolean(
    o && typeof o.id === 'string' && typeof o.matchId === 'string' && typeof o.senderId === 'string'
      && typeof o.text === 'string' && typeof o.queuedAt === 'number',
  );
}

let hydrated: Promise<void> | null = null;
function hydrate(): Promise<void> {
  if (!hydrated) {
    hydrated = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const cutoff = Date.now() - MAX_AGE_MS;
        const saved = (Array.isArray(parsed) ? parsed : [])
          .filter(isOutboxMessage)
          .filter((m) => m.queuedAt > cutoff);
        useOutbox.setState((s) => {
          const ids = new Set(s.items.map((m) => m.id));
          return { items: [...saved.filter((m) => !ids.has(m.id)), ...s.items] };
        });
      })
      .catch(() => undefined);
  }
  return hydrated;
}

function update(fn: (items: OutboxMessage[]) => OutboxMessage[]) {
  useOutbox.setState((s) => ({ items: fn(s.items) }));
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(useOutbox.getState().items)).catch(() => undefined);
}

export function removeFromOutbox(id: string) {
  if (!useOutbox.getState().items.some((m) => m.id === id)) return;
  update((items) => items.filter((m) => m.id !== id));
}

function setFailed(id: string, failed: boolean) {
  update((items) => items.map((m) => (m.id === id ? { ...m, failed } : m)));
}

const inFlight = new Set<string>();

function errorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
}

/** Resolves when the server has the message; rejects (and marks it failed) on denial or timeout. */
async function deliver(item: OutboxMessage): Promise<void> {
  if (inFlight.has(item.id)) return;
  inFlight.add(item.id);
  setFailed(item.id, false);
  const ref = doc(getDb(), 'matches', item.matchId, 'messages', item.id);
  const write = setDoc(ref, {
    senderId: item.senderId,
    type: 'text',
    text: item.text,
    createdAt: serverTimestamp(),
  });
  // The SDK keeps retrying after our timeout; a late ack still clears the outbox.
  write.then(() => removeFromOutbox(item.id)).catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      write,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Send timed out'), { code: 'timeout' })), SEND_TIMEOUT_MS);
      }),
    ]);
    removeFromOutbox(item.id);
  } catch (error) {
    if (errorCode(error) === 'permission-denied') {
      // Resending a message that already reached the server is an update, which the rules deny.
      const exists = await getDocFromServer(ref).then((s) => s.exists()).catch(() => false);
      if (exists) {
        removeFromOutbox(item.id);
        return;
      }
    }
    setFailed(item.id, true);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    inFlight.delete(item.id);
  }
}

/** Queue a text message and start delivering it. Never loses the text. */
export async function sendTextMessage(matchId: string, text: string): Promise<OutboxMessage | null> {
  const body = text.trim().slice(0, 2000);
  const senderId = getFirebaseAuth().currentUser?.uid;
  if (!body || !senderId) return null;
  await hydrate();
  const item: OutboxMessage = {
    id: doc(collection(getDb(), 'matches', matchId, 'messages')).id,
    matchId,
    senderId,
    text: body,
    queuedAt: Date.now(),
  };
  update((items) => [...items, item]);
  void deliver(item).catch(() => undefined);
  return item;
}

export function retryOutboxMessage(id: string): Promise<void> {
  const item = useOutbox.getState().items.find((m) => m.id === id);
  return item ? deliver(item) : Promise.resolve();
}

/** Resend anything left over (e.g. the app was closed before the server confirmed). */
export async function flushOutbox(matchId?: string): Promise<void> {
  await hydrate();
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const due = useOutbox
    .getState()
    .items.filter((m) => m.senderId === uid && (!matchId || m.matchId === matchId) && !inFlight.has(m.id));
  await Promise.all(due.map((m) => deliver(m).catch(() => undefined)));
}
