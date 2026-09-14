import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import { commerceConfig } from '@/constants/config';
import { env } from '@/lib/env';
import { DEFAULT_ENTITLEMENTS, type EntitlementState } from '@/lib/entitlements';
import { useSessionStore } from '@/store/session';

type PurchasesModule = typeof import('react-native-purchases').default;
type PurchasesNs = typeof import('react-native-purchases');

let configured = false;
let purchasesMod: PurchasesModule | null = null;
let purchasesNs: PurchasesNs | null = null;
/** Once we know native IAP isn't available, never touch the SDK again. */
let nativeUnavailable = false;

function apiKeyForPlatform(): string {
  if (Platform.OS === 'ios') return env.revenueCatIosKey;
  if (Platform.OS === 'android') return env.revenueCatAndroidKey;
  return env.revenueCatIosKey || env.revenueCatAndroidKey;
}

/** Expo Go / missing native module — paywall still works with fallback prices. */
function nativePurchasesAvailable(): boolean {
  if (nativeUnavailable) return false;
  if (Platform.OS === 'web') return false;
  // Expo Go store client — RNPurchases is null and setLogLevel crashes.
  const exec = Constants.executionEnvironment;
  if (exec === 'storeClient') return false;
  if (Constants.appOwnership === 'expo') return false;
  if (!NativeModules.RNPurchases) return false;
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
  return configured && Boolean(apiKeyForPlatform()) && Boolean(purchasesMod);
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

/** Configure once at app boot. Never throws — never lets a bad key kill TestFlight. */
export async function configurePurchases(appUserId?: string | null): Promise<void> {
  try {
    const apiKey = apiKeyForPlatform()?.trim() ?? '';
    if (!apiKey || Platform.OS === 'web') return;
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

export function entitlementsFromCustomerInfo(info: CustomerInfo): EntitlementState {
  const active = Boolean(info.entitlements.active[commerceConfig.plusEntitlementId]);
  return {
    plan: active ? 'plus' : 'free',
    subscriptionStatus: active ? 'active' : 'inactive',
    freePingMinutesPerDay: commerceConfig.freePingMinutesPerDay,
    freeOutgoingMessagesPerDay: commerceConfig.freeOutgoingMessagesPerDay,
  };
}

export function applyCustomerInfoToSession(info: CustomerInfo): EntitlementState {
  const prev = useSessionStore.getState().entitlements;
  const next = entitlementsFromCustomerInfo(info);
  useSessionStore.getState().setEntitlements(next);
  // Mid-Ping upgrade: lift free timer clamp.
  if (
    prev.plan !== 'plus' &&
    next.plan === 'plus' &&
    (next.subscriptionStatus === 'active' || next.subscriptionStatus === 'trialing')
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

export type PlusPlanId = 'weekly' | 'monthly';

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

  if (isPurchasesConfigured() && purchasesMod) {
    try {
      const offerings: PurchasesOfferings = await purchasesMod.getOfferings();
      const offering =
        offerings.all[commerceConfig.plusOfferingId] ?? offerings.current ?? null;
      const packs = offering?.availablePackages ?? [];
      weeklyPkg =
        packs.find((p) => p.identifier === commerceConfig.plusWeeklyPackageId) ??
        offering?.weekly ??
        null;
      monthlyPkg =
        packs.find((p) => p.identifier === commerceConfig.plusMonthlyPackageId) ??
        offering?.monthly ??
        null;
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
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message: string }).message)
        : 'Purchase failed';

  const cancelledCode = purchasesNs?.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR;
  const pendingCode = purchasesNs?.PURCHASES_ERROR_CODE?.PAYMENT_PENDING_ERROR;

  if (
    (cancelledCode != null && code === String(cancelledCode)) ||
    /cancel/i.test(message)
  ) {
    return { status: 'cancelled' };
  }
  if ((pendingCode != null && code === String(pendingCode)) || /pending/i.test(message)) {
    return { status: 'pending' };
  }
  if (/already/i.test(message)) {
    return { status: 'already' };
  }
  return { status: 'error', message };
}

export async function purchasePlusPackage(
  pkg: PurchasesPackage | null,
): Promise<PurchaseResult> {
  if (!isPurchasesConfigured() || !purchasesMod) {
    return {
      status: 'error',
      message: 'Subscriptions aren’t set up on this build yet. You can keep using the app.',
    };
  }
  if (!pkg) {
    return {
      status: 'error',
      message: 'That plan isn’t available right now. Try Restore Purchases or check back soon.',
    };
  }

  try {
    const { customerInfo } = await purchasesMod.purchasePackage(pkg);
    const entitlements = applyCustomerInfoToSession(customerInfo);
    if (!customerInfo.entitlements.active[commerceConfig.plusEntitlementId]) {
      return {
        status: 'error',
        message: 'Purchase completed but DateToday+ isn’t active yet. Try Restore Purchases.',
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

export async function restorePlusPurchases(): Promise<PurchaseResult> {
  if (!isPurchasesConfigured() || !purchasesMod) {
    return {
      status: 'error',
      message: 'Subscriptions aren’t set up on this build yet. You can keep using the app.',
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
      message: 'No active DateToday+ subscription found for this Apple ID.',
    };
  } catch (error) {
    return mapPurchaseError(error);
  }
}

export async function loadBoostPackage(): Promise<{
  package: PurchasesPackage | null;
  priceLabel: string;
}> {
  let pkg: PurchasesPackage | null = null;
  if (isPurchasesConfigured() && purchasesMod) {
    try {
      const offerings = await purchasesMod.getOfferings();
      const offering = offerings.all[commerceConfig.boostOfferingId] ?? null;
      pkg =
        offering?.availablePackages.find(
          (p) => p.identifier === commerceConfig.boostPackageId,
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
  if (!isPurchasesConfigured() || !purchasesMod) {
    return {
      status: 'error',
      message: 'Subscriptions aren’t set up on this build yet. You can keep using the app.',
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
