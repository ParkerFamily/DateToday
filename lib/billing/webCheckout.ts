import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { functionsUrl } from '@/features/matches/api';
import { env } from '@/lib/env';
import {
  entitlementsFromWebSubscription,
  isPlusActive,
  type PlusPlanId,
  type WebSubscriptionDoc,
} from '@/lib/entitlements';
import { getDb, getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase/client';
import { useSessionStore } from '@/store/session';

/**
 * DateToday's web checkout: another way to buy the same DateToday+ (Stripe on our site).
 * Shown only when the platform, this build and the server-side flag all allow it.
 */

export type WebPlan = {
  id: PlusPlanId;
  priceLabel: string;
  periodLabel: string;
};

export type WebCheckoutStatus = {
  available: boolean;
  plans: WebPlan[];
  testMode: boolean;
};

export type WebCheckoutResult = 'unlocked' | 'processing' | 'closed';

const RETURN_URL = 'datetoday://checkout';
const UNAVAILABLE: WebCheckoutStatus = { available: false, plans: [], testMode: false };

/** iOS App Store builds never offer it; other builds must opt in at build time. */
export function webCheckoutBuildAllowed(): boolean {
  if (Platform.OS === 'ios') return false;
  return env.webCheckoutBuild;
}

function deviceCountry(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const region = locale.split(/[-_]/).find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part));
    return region ? region.toUpperCase() : null;
  } catch {
    return null;
  }
}

async function call<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl(name), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: Platform.OS, country: deviceCountry(), ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Try again.');
  return json;
}

/** Never throws: anything unexpected means "keep the normal paywall". */
export async function loadWebCheckout(): Promise<WebCheckoutStatus> {
  if (!webCheckoutBuildAllowed() || !isFirebaseConfigured()) return UNAVAILABLE;
  try {
    const status = await call<WebCheckoutStatus>('webCheckoutStatus');
    const plans = (status.plans ?? []).filter((p) => p.id === 'weekly' || p.id === 'monthly');
    return { available: Boolean(status.available) && plans.length > 0, plans, testMode: Boolean(status.testMode) };
  } catch {
    return UNAVAILABLE;
  }
}

/** Reads webSubscriptions/{uid} once — used on foreground, paywall open and after checkout. */
export async function refreshWebEntitlement(): Promise<void> {
  const uid = useSessionStore.getState().userId;
  if (!uid || !isFirebaseConfigured()) return;
  try {
    const snap = await getDoc(doc(getDb(), 'webSubscriptions', uid));
    if (useSessionStore.getState().userId !== uid) return;
    useSessionStore
      .getState()
      .setWebEntitlements(entitlementsFromWebSubscription(snap.exists() ? (snap.data() as WebSubscriptionDoc) : null));
  } catch {
    /* offline — the live listener catches up */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Opens checkout on our site; resolves after the member comes back to the app. */
export async function startWebCheckout(plan: PlusPlanId): Promise<WebCheckoutResult> {
  if (!webCheckoutBuildAllowed()) return 'closed';
  const { url } = await call<{ url: string }>('createWebCheckoutLink', { plan });
  const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
  const returnedPaid =
    result.type === 'success' && Linking.parse(result.url).queryParams?.status === 'success';

  // The webhook usually lands within seconds of payment; keep checking briefly.
  const tries = returnedPaid ? 10 : 2;
  for (let i = 0; i < tries; i += 1) {
    await refreshWebEntitlement();
    if (isPlusActive(useSessionStore.getState().entitlements)) return 'unlocked';
    await sleep(1500);
  }
  return returnedPaid ? 'processing' : 'closed';
}

/** Stripe's page to change plan, update the card or cancel. */
export async function openWebBillingPortal(): Promise<void> {
  const { url } = await call<{ url: string }>('stripeBillingPortal');
  await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
  await refreshWebEntitlement();
}

let stopSnapshot: Unsubscribe | null = null;
let installed = false;

function watch(uid: string | null) {
  stopSnapshot?.();
  stopSnapshot = null;
  if (!uid || !isFirebaseConfigured()) return;
  try {
    stopSnapshot = onSnapshot(
      doc(getDb(), 'webSubscriptions', uid),
      (snap) => {
        if (useSessionStore.getState().userId !== uid) return;
        useSessionStore
          .getState()
          .setWebEntitlements(entitlementsFromWebSubscription(snap.exists() ? (snap.data() as WebSubscriptionDoc) : null));
      },
      () => undefined,
    );
  } catch {
    /* listener is a nicety; refreshWebEntitlement still works */
  }
}

/**
 * Keeps web-bought DateToday+ in the session for whoever is signed in: live while the app runs,
 * re-read on every return to the foreground (also re-checks expiry). Call once at app start.
 */
export function installWebEntitlementSync(): void {
  if (installed) return;
  installed = true;
  let current = useSessionStore.getState().userId;
  watch(current);
  useSessionStore.subscribe((s) => {
    if (s.userId === current) return;
    current = s.userId;
    watch(current);
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void refreshWebEntitlement();
  });
}
