import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import { functionsUrl } from '@/features/matches/api';

const DEVICE_KEY = 'dt.deviceId';
const SESSION_KEY = 'dt.deviceSession';

type Stored = { uid: string; id: string; ok: boolean };
type ServerStatus = 'ok' | 'needs_code' | 'revoked';

/** `checking` and `needs_code` cover the app with the sign-in code screen; `error` offers retry. */
export type DeviceSecurityStatus = 'idle' | 'checking' | 'ok' | 'needs_code' | 'error';

export const useDeviceSecurity = create<{
  status: DeviceSecurityStatus;
  sessionId: string | null;
  email: string | null;
}>(() => ({ status: 'idle', sessionId: null, email: null }));

let idForUid: { uid: string; id: Promise<string> } | null = null;
let stopWatching: (() => void) | null = null;
let onRevoked: (() => void) | null = null;

/** `revoked` runs once when another device (or "Sign out all other devices") signs this one out. */
export function setRevokedHandler(handler: () => void) {
  onRevoked = handler;
}

async function readStored(): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    return parsed && typeof parsed.id === 'string' && typeof parsed.uid === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored) {
  return AsyncStorage.setItem(SESSION_KEY, JSON.stringify(value)).catch(() => undefined);
}

/** Stays the same across sign-ins on this install; used to remember trusted devices. */
async function deviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
  if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => undefined);
  return id;
}

function webLabel() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Web browser';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  return os && browser !== 'Web browser' ? `${browser} on ${os}` : browser;
}

/** "iPhone 15 Pro", "Samsung SM-N986U", "Chrome on Mac". */
export function deviceLabel(): string {
  if (Platform.OS === 'web') return webLabel();
  let device: typeof import('expo-device') | null = null;
  try {
    device = require('expo-device') as typeof import('expo-device');
  } catch {
    device = null;
  }
  const constants = Platform.constants as { Model?: string; Manufacturer?: string } | undefined;
  const model = device?.modelName ?? constants?.Model ?? '';
  if (Platform.OS === 'ios') return model || 'iPhone';
  const maker = device?.manufacturer ?? constants?.Manufacturer ?? '';
  const brand = maker ? maker.charAt(0).toUpperCase() + maker.slice(1) : '';
  const label = brand && !model.toLowerCase().startsWith(maker.toLowerCase()) ? `${brand} ${model}` : model;
  return label.trim() || 'Android phone';
}

/**
 * The id of this sign-in. A fresh sign-in always gets a new one; a restored app reuses the saved one.
 * Push tokens carry it so a signed-out device stops getting this account's notifications.
 */
export function sessionIdFor(uid: string, fresh = false): Promise<string> {
  if (idForUid?.uid === uid && !fresh) return idForUid.id;
  const id = (async () => {
    const stored = await readStored();
    if (!fresh && stored?.uid === uid) return stored.id;
    const next = Crypto.randomUUID();
    await writeStored({ uid, id: next, ok: false });
    return next;
  })();
  idForUid = { uid, id };
  return id;
}

export async function securityPost<T>(body: object): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in again and retry.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(functionsUrl('security'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Connection is slow. Check your internet and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function watchSession(uid: string, id: string) {
  stopWatching?.();
  stopWatching = onSnapshot(
    doc(getDb(), 'sessions', id),
    (snap) => {
      if (snap.exists() && snap.get('uid') === uid && snap.get('revokedAt')) handleRevoked();
    },
    () => undefined,
  );
}

function handleRevoked() {
  stopWatching?.();
  stopWatching = null;
  useDeviceSecurity.setState({ status: 'ok' });
  const handler = onRevoked;
  onRevoked = null;
  handler?.();
}

async function applyStatus(uid: string, id: string, status: ServerStatus, email?: string | null) {
  if (getFirebaseAuth().currentUser?.uid !== uid) return;
  if (status === 'revoked') {
    handleRevoked();
    return;
  }
  if (status === 'needs_code') {
    useDeviceSecurity.setState({ status: 'needs_code', sessionId: id, email: email ?? null });
    await writeStored({ uid, id, ok: false });
    return;
  }
  useDeviceSecurity.setState({ status: 'ok', sessionId: id });
  await writeStored({ uid, id, ok: true });
  watchSession(uid, id);
}

async function twoStepOn(uid: string) {
  try {
    const snap = await getDoc(doc(getDb(), 'securitySettings', uid));
    return snap.exists() && snap.get('twoStepEmail') === true;
  } catch {
    return false;
  }
}

/**
 * Registers this device for the signed-in account. `fresh` = the person just signed in here
 * (not an app restart), which is what triggers new sign-in alerts and the two-step code.
 */
export async function startDeviceSession(uid: string, fresh: boolean) {
  const pendingId = sessionIdFor(uid, fresh);
  const stored = fresh ? null : await readStored();
  const id = await pendingId;
  // Restarts of an already-confirmed device never wait on the network.
  const trusted = !fresh && stored?.uid === uid && stored.id === id && stored.ok;
  if (trusted) {
    useDeviceSecurity.setState({ status: 'ok', sessionId: id });
    watchSession(uid, id);
  } else if (await twoStepOn(uid)) {
    useDeviceSecurity.setState({ status: 'checking', sessionId: id });
  } else {
    useDeviceSecurity.setState({ status: 'ok', sessionId: id });
  }

  lastStart = { uid, fresh };
  await register(uid, id, fresh);
}

let lastStart: { uid: string; fresh: boolean } | null = null;

async function register(uid: string, id: string, fresh: boolean) {
  try {
    const result = await securityPost<{ status: ServerStatus; email?: string }>({
      action: 'register',
      sessionId: id,
      deviceId: await deviceId(),
      platform: Platform.OS,
      deviceLabel: deviceLabel(),
      appVersion: Constants.expoConfig?.version ?? '',
      fresh,
    });
    await applyStatus(uid, id, result.status, result.email);
  } catch {
    // Never lock someone out over a network blip, unless their account requires the code.
    if (useDeviceSecurity.getState().status === 'checking') useDeviceSecurity.setState({ status: 'error' });
  }
}

/** Retry from the "couldn't confirm" screen with the same sign-in, so a failed first try can't skip the code. */
export async function retryDeviceSession() {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid || lastStart?.uid !== uid) return;
  useDeviceSecurity.setState({ status: 'checking' });
  await register(uid, await sessionIdFor(uid), lastStart.fresh);
}

export async function resendLoginCode() {
  const { sessionId } = useDeviceSecurity.getState();
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!sessionId || !uid) return;
  const result = await securityPost<{ status: ServerStatus; email?: string }>({ action: 'sendLoginCode', sessionId });
  await applyStatus(uid, sessionId, result.status, result.email ?? useDeviceSecurity.getState().email);
}

export async function verifyLoginCode(code: string, remember: boolean) {
  const { sessionId } = useDeviceSecurity.getState();
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!sessionId || !uid) return;
  const result = await securityPost<{ status: ServerStatus }>({
    action: 'verifyLoginCode',
    sessionId,
    code: code.replace(/\s/g, ''),
    remember,
  });
  await applyStatus(uid, sessionId, result.status);
}

/** Part of signing out: mark this device signed out and forget its session. */
export async function endDeviceSession() {
  stopWatching?.();
  stopWatching = null;
  const { sessionId } = useDeviceSecurity.getState();
  useDeviceSecurity.setState({ status: 'idle', sessionId: null, email: null });
  idForUid = null;
  await AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
  if (sessionId && getFirebaseAuth().currentUser) {
    await securityPost({ action: 'signOutDevice', sessionId, self: true }).catch(() => undefined);
  }
}
