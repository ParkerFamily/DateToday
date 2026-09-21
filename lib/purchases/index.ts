import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { APP_STORE_LINKS } from '@/constants/legal';
import { commerceConfig } from '@/constants/config';
import { env } from '@/lib/env';
import { getDb, isFirebaseConfigured } from '@/lib/firebase/client';
import {
  DEFAULT_ENTITLEMENTS,
  type EntitlementState,
  type PlusPlanId,
} from '@/lib/entitlements';
import { useSessionStore } from '@/store/session';

export type { PlusPlanId };

type PurchasesModule = typeof import('react-native-purchases').default;
type PurchasesNs = typeof import('react-native-purchases');

let configured = false;
let purchasesMod: PurchasesModule | null = null;
let purchasesNs: PurchasesNs | null = null;
/** Once we know native IAP isn't available, never touch the SDK again. */
let nativeUnavailable = false;

/**
 * Android billing is deferred — never load / configure RevenueCat on Android
 * until we ship a goog_ key and re-enable Android autolinking.
 */
function isAndroidIapDeferred(): boolean {
  return Platform.OS === 'android';
}

function apiKeyForPlatform(): string {
  if (isAndroidIapDeferred()) return '';
  if (Platform.OS === 'ios') return env.revenueCatIosKey;
  if (Platform.OS === 'android') return env.revenueCatAndroidKey;
  return env.revenueCatIosKey || env.revenueCatAndroidKey;
}

/** Expo Go / missing native module — paywall still works with fallback prices. */
function nativePurchasesAvailable(): boolean {
  if (nativeUnavailable) return false;
  if (isAndroidIapDeferred()) return false;
  if (Platform.OS === 'web') return false;
  // Expo Go store client — RNPurchases is null and setLogLevel crashes.
  const exec = Constants.executionEnvironment;
  if (exec === 'storeClient') return false;
  if (Constants.appOwnership === 'expo') return false;
  try {
    if (!NativeModules.RNPurchases) return false;
  } catch {
    return false;
  }
  return true;
}

function loadPurchasesSdk(): boolean {
  if (purchasesMod) return true;
  if (!nativePurchasesAvailable()) {
    nativeUnavailable = true;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ns = require('react-native-purchases') as PurchasesNs;
    const mod = ns?.default;
    if (!mod || typeof mod.configure !== 'function') {
      nativeUnavailable = true;
      return false;
    }
    // Double-check native bridge still present after require.
    if (!NativeModules.RNPurchases) {
      nativeUnavailable = true;
      return false;
    }
    purchasesNs = ns;
    purchasesMod = mod;
    return true;
  } catch {
    nativeUnavailable = true;
    return false;
  }
}

export function isPurchasesConfigured(): boolean {
  return configured && Boolean(apiKeyForPlatform()?.trim()) && Boolean(purchasesMod);
}

/** Why purchases aren't live on this build — used by paywall / restore UX. */
export function purchasesUnavailableReason(): string | null {
  if (Platform.OS === 'web') return 'Subscriptions aren’t available on web.';
  if (isAndroidIapDeferred()) {
    return 'DateToday+ billing on Android is coming soon. You can keep using the free tier for now.';
  }
  const apiKey = apiKeyForPlatform()?.trim() ?? '';
  if (!apiKey) {
    return Platform.OS === 'android'
      ? 'Android subscriptions need a RevenueCat Google Play API key (goog_…). Add EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY, then rebuild.'
      : 'Missing RevenueCat iOS API key (appl_…). Add EXPO_PUBLIC_REVENUECAT_IOS_API_KEY, then rebuild.';
  }
  if (!isUsableApiKey(apiKey)) {
    if (apiKey.startsWith('test_') && !__DEV__) {
      return 'This build has a RevenueCat Test Store key, which can’t run in release. Use an appl_/goog_ key and rebuild.';
    }
    return Platform.OS === 'android'
      ? 'Android RevenueCat key must start with goog_.'
      : 'iOS RevenueCat key must start with appl_.';
  }
  if (!nativePurchasesAvailable()) {
    return 'In-app purchases need a native build (TestFlight / Play / dev client). Expo Go can’t complete store purchases.';
  }
  if (!configured || !purchasesMod) {
    return 'Subscriptions aren’t connected yet on this session. Close and reopen the paywall.';
  }
  return null;
}

/**
 * RevenueCat force-closes release builds configured with a Test Store key (`test_…`).
 * Never configure with test_ outside Metro __DEV__ — preview/store APKs are release builds.
 * iOS release: appl_ only. Android release: goog_ only.
 */
function isUsableApiKey(apiKey: string): boolean {
  const key = apiKey.trim();
  if (!key) return false;
  // Test Store is Metro/dev only — never release/preview/store binaries.
  if (key.startsWith('test_')) return Boolean(__DEV__);
  if (Platform.OS === 'ios') return key.startsWith('appl_');
  if (Platform.OS === 'android') return key.startsWith('goog_');
  return false;
}

/** Configure once at app boot. Never throws — never lets a bad key kill TestFlight / Android. */
export async function configurePurchases(appUserId?: string | null): Promise<void> {
  try {
    // Android: hard no-op until goog_ + autolinking are re-enabled.
    if (isAndroidIapDeferred() || Platform.OS === 'web') return;
    const apiKey = apiKeyForPlatform()?.trim() ?? '';
    if (!apiKey) return;
    if (!isUsableApiKey(apiKey)) {
      // Skip SDK entirely — Test Store keys crash release builds after OK on the alert.
      return;
    }
    if (!loadPurchasesSdk() || !purchasesMod || !purchasesNs) return;

    if (!configured) {
      try {
        const level = __DEV__ ? purchasesNs.LOG_LEVEL.DEBUG : purchasesNs.LOG_LEVEL.ERROR;
        purchasesMod.setLogLevel(level);
      } catch {
        // Log level is optional — continue to configure.
      }
      try {
        purchasesMod.configure({
          apiKey,
          appUserID: appUserId ?? undefined,
        });
        configured = true;
        startPurchasesCustomerInfoListener();
        // Warm customer info in background — never block / never throw to UI.
        void purchasesMod.getCustomerInfo().then(applyCustomerInfoToSession).catch(() => undefined);
      } catch {
        nativeUnavailable = true;
        purchasesMod = null;
        configured = false;
      }
      return;
    }

    if (appUserId) {
      try {
        await purchasesMod.logIn(appUserId);
      } catch {
        /* ignore identity sync failures */
      }
    }
    startPurchasesCustomerInfoListener();
  } catch {
    nativeUnavailable = true;
    purchasesMod = null;
    configured = false;
  }
}

/** Make sure configure finished before offerings / purchase (paywall can open mid-boot). */
export async function ensurePurchasesReady(): Promise<boolean> {
  const uid = useSessionStore.getState().userId;
  await configurePurchases(uid);
  return isPurchasesConfigured();
}

function resolvePlusPlanId(productId: string | null | undefined): PlusPlanId | null {
  if (!productId) return null;
  if (
    productId === commerceConfig.plusWeeklyProductId ||
    /weekly/i.test(productId)
  ) {
    return 'weekly';
  }
  if (
    productId === commerceConfig.plusMonthlyProductId ||
    /monthly/i.test(productId)
  ) {
    return 'monthly';
  }
  return null;
}

export function entitlementsFromCustomerInfo(info: CustomerInfo): EntitlementState {
  const entId = commerceConfig.plusEntitlementId;
  const activeEnt = info.entitlements.active[entId];
  const allEnt = info.entitlements.all[entId];
  const ent = activeEnt ?? allEnt ?? null;
  const productId = ent?.productIdentifier ?? null;
  const billingIssueDetected = Boolean(ent?.billingIssueDetectedAt);
  const willRenew = Boolean(activeEnt?.willRenew);
  const expiresAt = activeEnt?.expirationDate ?? allEnt?.expirationDate ?? null;
  const managementURL = info.managementURL ?? null;

  let subscriptionStatus: EntitlementState['subscriptionStatus'] = 'inactive';
  let plan: EntitlementState['plan'] = 'free';

  if (activeEnt?.isActive) {
    plan = 'plus';
    if (String(activeEnt.periodType).toUpperCase() === 'TRIAL') {
      subscriptionStatus = 'trialing';
    } else if (billingIssueDetected) {
      subscriptionStatus = 'past_due';
    } else {
      subscriptionStatus = 'active';
    }
  } else if (allEnt && !allEnt.isActive) {
    plan = 'free';
    subscriptionStatus = 'canceled';
  }

  return {
    plan,
    subscriptionStatus,
    freePingMinutesPerDay: commerceConfig.freePingMinutesPerDay,
    freeOutgoingMessagesPerDay: commerceConfig.freeOutgoingMessagesPerDay,
    plusPlanId: resolvePlusPlanId(productId),
    productId,
    expiresAt,
    willRenew: plan === 'plus' ? willRenew : false,
    managementURL,
    billingIssueDetected,
  };
}

/** Mirror subscription status for support / analytics — never writes forgeable `plan: plus`. */
async function syncSubscriptionMirror(state: EntitlementState): Promise<void> {
  const uid = useSessionStore.getState().userId;
  if (!uid || !isFirebaseConfigured()) return;
  try {
    await setDoc(
      doc(getDb(), 'users', uid),
      {
        subscription: {
          status: state.subscriptionStatus,
          plusActive: state.plan === 'plus' && state.subscriptionStatus !== 'canceled',
          plusPlanId: state.plusPlanId,
          productId: state.productId,
          expiresAt: state.expiresAt,
          willRenew: state.willRenew,
          billingIssueDetected: state.billingIssueDetected,
          source: 'revenuecat',
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    /* rules / offline — ignore */
  }
}

export function applyCustomerInfoToSession(info: CustomerInfo): EntitlementState {
  const prev = useSessionStore.getState().entitlements;
  const next = entitlementsFromCustomerInfo(info);
  useSessionStore.getState().setEntitlements(next);
  void syncSubscriptionMirror(next);
  // Mid-Ping upgrade: lift free timer clamp.
  if (
    prev.plan !== 'plus' &&
    next.plan === 'plus' &&
    (next.subscriptionStatus === 'active' ||
      next.subscriptionStatus === 'trialing' ||
      next.subscriptionStatus === 'past_due')
  ) {
    try {
      // Lazy require avoids circular import with sessionCommerce ↔ purchases.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { extendPingForPlusUnlock } = require('@/lib/commerce/sessionCommerce') as {
        extendPingForPlusUnlock: () => unknown;
      };
      extendPingForPlusUnlock();
    } catch {
      /* ignore */
    }
  }
  return next;
}

let customerInfoListening = false;

/** Keep Plus state in sync when Renewals / restores happen outside the paywall. */
export function startPurchasesCustomerInfoListener(): void {
  if (customerInfoListening || !isPurchasesConfigured() || !purchasesMod) return;
  try {
    purchasesMod.addCustomerInfoUpdateListener((info) => {
      applyCustomerInfoToSession(info);
    });
    customerInfoListening = true;
  } catch {
    /* optional */
  }
}

export async function refreshCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isPurchasesConfigured() || !purchasesMod) return null;
  try {
    const info = await purchasesMod.getCustomerInfo();
    applyCustomerInfoToSession(info);
    return info;
  } catch {
    return null;
  }
}

export type PlusPlanOffer = {
  id: PlusPlanId;
  package: PurchasesPackage | null;
  title: string;
  priceLabel: string;
  periodLabel: string;
  caption: string;
  badge?: string;
};

function packagePriceLabel(pkg: PurchasesPackage | null, fallback: string): string {
  const localized = pkg?.product?.priceString?.trim();
  return localized || fallback;
}

export async function loadPlusPlans(): Promise<PlusPlanOffer[]> {
  let weeklyPkg: PurchasesPackage | null = null;
  let monthlyPkg: PurchasesPackage | null = null;

  await ensurePurchasesReady();

  if (isPurchasesConfigured() && purchasesMod) {
    try {
      const offerings: PurchasesOfferings = await purchasesMod.getOfferings();
      const offering =
        offerings.all[commerceConfig.plusOfferingId] ?? offerings.current ?? null;
      const packs = offering?.availablePackages ?? [];
      weeklyPkg =
        packs.find((p) => p.identifier === commerceConfig.plusWeeklyPackageId) ??
        packs.find((p) => p.product?.identifier === commerceConfig.plusWeeklyProductId) ??
        offering?.weekly ??
        null;
      monthlyPkg =
        packs.find((p) => p.identifier === commerceConfig.plusMonthlyPackageId) ??
        packs.find((p) => p.product?.identifier === commerceConfig.plusMonthlyProductId) ??
        offering?.monthly ??
        null;

      // Last-resort: pull products directly if offering packages didn't resolve.
      if ((!weeklyPkg || !monthlyPkg) && typeof purchasesMod.getProducts === 'function') {
        try {
          const ids = [
            commerceConfig.plusWeeklyProductId,
            commerceConfig.plusMonthlyProductId,
          ];
          const products = await purchasesMod.getProducts(ids);
          // Prefer packages when present; getProducts alone can't purchase without a package
          // on some RC versions — still helps diagnose empty offerings.
          if (__DEV__ && products.length === 0) {
            console.warn('[DateToday] Store returned 0 Plus products for', ids);
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* fall through to display fallbacks */
    }
  }

  return [
    {
      id: 'weekly',
      package: weeklyPkg,
      title: 'DateToday+ Weekly',
      priceLabel: packagePriceLabel(weeklyPkg, commerceConfig.plusWeeklyFallbackPrice),
      periodLabel: commerceConfig.plusWeeklyFallbackPeriod,
      caption: 'Flexible access',
    },
    {
      id: 'monthly',
      package: monthlyPkg,
      title: 'DateToday+ Monthly',
      priceLabel: packagePriceLabel(monthlyPkg, commerceConfig.plusMonthlyFallbackPrice),
      periodLabel: commerceConfig.plusMonthlyFallbackPeriod,
      caption: 'Save compared with weekly',
      badge: 'BEST VALUE',
    },
  ];
}

export type PurchaseResult =
  | { status: 'success'; entitlements: EntitlementState }
  | { status: 'cancelled' }
  | { status: 'pending' }
  | { status: 'already' }
  | { status: 'error'; message: string };

function mapPurchaseError(error: unknown): PurchaseResult {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: string | number }).code)
      : '';
  const underlying =
    error && typeof error === 'object' && 'underlyingErrorMessage' in error
      ? String((error as { underlyingErrorMessage: string }).underlyingErrorMessage ?? '')
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message: string }).message)
        : 'Purchase failed';

  const codes = purchasesNs?.PURCHASES_ERROR_CODE;
  const cancelledCode = codes?.PURCHASE_CANCELLED_ERROR;
  const pendingCode = codes?.PAYMENT_PENDING_ERROR;
  const alreadyCode = codes?.PRODUCT_ALREADY_PURCHASED_ERROR;
  const notAvailable = codes?.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR;
  const storeProblem = codes?.STORE_PROBLEM_ERROR;
  const notAllowed = codes?.PURCHASE_NOT_ALLOWED_ERROR;
  const purchaseInvalid = codes?.PURCHASE_INVALID_ERROR;
  const network = codes?.NETWORK_ERROR;
  const configErr = codes?.CONFIGURATION_ERROR;

  if (
    (cancelledCode != null && code === String(cancelledCode)) ||
    /cancel/i.test(message)
  ) {
    return { status: 'cancelled' };
  }
  if ((pendingCode != null && code === String(pendingCode)) || /pending/i.test(message)) {
    return { status: 'pending' };
  }
  if (
    (alreadyCode != null && code === String(alreadyCode)) ||
    /already.?owned|already.?purchased/i.test(message)
  ) {
    return { status: 'already' };
  }

  const blob = `${message} ${underlying}`;

  if (
    (notAvailable != null && code === String(notAvailable)) ||
    /not available|cannot be completed|unable to complete|product.?not.?available/i.test(blob)
  ) {
    return {
      status: 'error',
      message:
        'Apple couldn’t complete this purchase. Confirm DateToday+ Weekly is $9.99 in App Store Connect (Reply to App Review), that both Plus IAPs are cleared for sale / attached to this version, and that you’re signed into a Sandbox Apple ID on this TestFlight device.',
    };
  }
  if ((storeProblem != null && code === String(storeProblem)) || /store.?problem/i.test(blob)) {
    return {
      status: 'error',
      message:
        'The App Store had a problem completing payment. Check your Sandbox Apple ID, Paid Apps Agreement, and try again in a minute.',
    };
  }
  if ((notAllowed != null && code === String(notAllowed)) || /not.?allowed|restrictions/i.test(blob)) {
    return {
      status: 'error',
      message:
        'Purchases aren’t allowed on this Apple ID / device. Use a Sandbox tester account (Settings → App Store → Sandbox Account) on TestFlight.',
    };
  }
  if ((purchaseInvalid != null && code === String(purchaseInvalid)) || /invalid/i.test(blob)) {
    return {
      status: 'error',
      message: 'That subscription looks invalid in App Store Connect. Check product IDs match RevenueCat and try Restore Purchases.',
    };
  }
  if ((network != null && code === String(network)) || /network|offline|internet/i.test(blob)) {
    return { status: 'error', message: 'Network error talking to the store. Check connectivity and try again.' };
  }
  if ((configErr != null && code === String(configErr)) || /configuration/i.test(blob)) {
    return {
      status: 'error',
      message:
        'RevenueCat / store configuration error. Confirm the appl_ key, offering `default`, packages $rc_weekly / $rc_monthly, and entitlement datetoday_pro.',
    };
  }

  return { status: 'error', message: message || 'Purchase failed' };
}

export async function purchasePlusPackage(
  pkg: PurchasesPackage | null,
): Promise<PurchaseResult> {
  await ensurePurchasesReady();
  const blocked = purchasesUnavailableReason();
  if (blocked || !isPurchasesConfigured() || !purchasesMod) {
    return {
      status: 'error',
      message: blocked ?? 'Subscriptions aren’t set up on this build yet. You can keep using the app.',
    };
  }
  if (!pkg) {
    return {
      status: 'error',
      message:
        'That plan isn’t available from the App Store yet. In RevenueCat → Product catalog → DateToday (App Store), Import the weekly/monthly products (not Test Store). Attach them to entitlement datetoday_pro and offering `default` ($rc_weekly / $rc_monthly), then reopen the paywall.',
    };
  }

  try {
    const { customerInfo } = await purchasesMod.purchasePackage(pkg);
    const entitlements = applyCustomerInfoToSession(customerInfo);
    if (!customerInfo.entitlements.active[commerceConfig.plusEntitlementId]) {
      return {
        status: 'error',
        message:
          'Purchase completed but DateToday+ isn’t active yet. Attach products to entitlement `datetoday_pro` in RevenueCat, then tap Restore Purchases.',
      };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { extendPingForPlusUnlock } = require('@/lib/commerce/sessionCommerce') as {
        extendPingForPlusUnlock: () => unknown;
      };
      extendPingForPlusUnlock();
    } catch {
      /* ignore */
    }
    return { status: 'success', entitlements };
  } catch (error) {
    return mapPurchaseError(error);
  }
}

/** Upgrade / downgrade within the same Apple subscription group. */
export async function switchPlusPlan(
  pkg: PurchasesPackage | null,
): Promise<PurchaseResult> {
  return purchasePlusPackage(pkg);
}

export async function restorePlusPurchases(): Promise<PurchaseResult> {
  await ensurePurchasesReady();
  const blocked = purchasesUnavailableReason();
  if (blocked || !isPurchasesConfigured() || !purchasesMod) {
    return {
      status: 'error',
      message: blocked ?? 'Subscriptions aren’t set up on this build yet. You can keep using the app.',
    };
  }
  try {
    const info = await purchasesMod.restorePurchases();
    const entitlements = applyCustomerInfoToSession(info);
    if (info.entitlements.active[commerceConfig.plusEntitlementId]) {
      return { status: 'success', entitlements };
    }
    return {
      status: 'error',
      message:
        Platform.OS === 'android'
          ? 'No active DateToday+ subscription found for this Google account.'
          : 'No active DateToday+ subscription found for this Apple ID.',
    };
  } catch (error) {
    return mapPurchaseError(error);
  }
}

export function managementUrlForEntitlements(state: EntitlementState): string {
  if (state.managementURL) return state.managementURL;
  return Platform.OS === 'android'
    ? APP_STORE_LINKS.googleSubscriptions
    : APP_STORE_LINKS.appleSubscriptions;
}

export async function loadBoostPackage(): Promise<{
  package: PurchasesPackage | null;
  priceLabel: string;
}> {
  let pkg: PurchasesPackage | null = null;
  await ensurePurchasesReady();
  if (isPurchasesConfigured() && purchasesMod) {
    try {
      const offerings = await purchasesMod.getOfferings();
      const offering = offerings.all[commerceConfig.boostOfferingId] ?? null;
      pkg =
        offering?.availablePackages.find(
          (p) => p.identifier === commerceConfig.boostPackageId,
        ) ??
        offering?.availablePackages.find(
          (p) => p.product?.identifier === commerceConfig.boostProductId,
        ) ??
        offering?.availablePackages[0] ??
        null;
    } catch {
      /* fallback */
    }
  }
  return {
    package: pkg,
    priceLabel: packagePriceLabel(pkg, commerceConfig.boostFallbackPrice),
  };
}

/** Consumable Tonight Boost — does NOT grant datetoday_pro. */
export async function purchaseTonightBoost(
  pkg: PurchasesPackage | null,
): Promise<PurchaseResult> {
  await ensurePurchasesReady();
  const blocked = purchasesUnavailableReason();
  if (blocked || !isPurchasesConfigured() || !purchasesMod) {
    return {
      status: 'error',
      message: blocked ?? 'Subscriptions aren’t set up on this build yet. You can keep using the app.',
    };
  }
  if (!pkg) {
    return {
      status: 'error',
      message: 'Tonight Boost isn’t available right now.',
    };
  }

  const session = useSessionStore.getState().liveSession;
  if (!session || session.status !== 'active' || session.endedAt) {
    return {
      status: 'error',
      message: 'Start a Ping before buying Tonight Boost.',
    };
  }
  if (session.isBoosted) {
    return {
      status: 'already',
    };
  }

  try {
    await purchasesMod.purchasePackage(pkg);
    // Lazy require — keep purchases free of hard cycle at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { activateTonightBoost } = require('@/lib/commerce/sessionCommerce') as {
      activateTonightBoost: () => Promise<unknown>;
    };
    await activateTonightBoost();
    await refreshCustomerInfo();
    return {
      status: 'success',
      entitlements: useSessionStore.getState().entitlements ?? DEFAULT_ENTITLEMENTS,
    };
  } catch (error) {
    return mapPurchaseError(error);
  }
}
