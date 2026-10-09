import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { FREE_TIER_FEATURES, PREMIUM_TIER_FEATURES } from '@/constants/tonightVibe';
import { commerceConfig } from '@/constants/config';
import { LEGAL_URLS } from '@/constants/legal';
import { colors, radii, spacing } from '@/constants/theme';
import { UPGRADE_COPY, type UpgradeReason } from '@/lib/commerce/upgradePrompt';
import { isPlusActive, plusStatusLabel } from '@/lib/entitlements';
import {
  billingComingSoon,
  loadPlusPlans,
  managementUrlForEntitlements,
  purchasePlusPackage,
  purchasesUnavailableReason,
  refreshCustomerInfo,
  restorePlusPurchases,
  switchPlusPlan,
  type PlusPlanId,
  type PlusPlanOffer,
} from '@/lib/purchases';
import {
  loadWebCheckout,
  openWebBillingPortal,
  refreshWebEntitlement,
  startWebCheckout,
  webCheckoutBuildAllowed,
  type WebCheckoutStatus,
} from '@/lib/billing/webCheckout';
import { useSessionStore } from '@/store/session';
import { ScaledSheet, rs } from '@/lib/scale';

const PREMIUM_PRICE_BADGE = `${commerceConfig.plusWeeklyFallbackPrice}/wk • ${commerceConfig.plusMonthlyFallbackPrice}/mo`;

export default function PaywallScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const entitlements = useSessionStore((s) => s.entitlements);
  const isPlus = isPlusActive(entitlements);
  const plusFromWeb = useSessionStore((s) => s.plusSource) === 'web';
  const headline =
    !isPlus && reason && reason in UPGRADE_COPY
      ? UPGRADE_COPY[reason as UpgradeReason]
      : UPGRADE_COPY.default;

  const [plans, setPlans] = useState<PlusPlanOffer[]>([]);
  const [selected, setSelected] = useState<PlusPlanId>('monthly');
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [storeHint, setStoreHint] = useState<string | null>(null);
  const comingSoon = billingComingSoon();
  const [web, setWeb] = useState<WebCheckoutStatus | null>(null);
  const webMode = Boolean(web?.available) && !isPlus;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        setLoadingOffers(true);
        await refreshCustomerInfo();
        const next = await loadPlusPlans();
        if (!alive) return;
        setPlans(next);
        const current = useSessionStore.getState().entitlements.plusPlanId;
        if (current) setSelected(current);
        const missingStorePkg = next.every((p) => !p.package);
        setStoreHint(
          missingStorePkg
            ? purchasesUnavailableReason() ??
                'Store prices aren’t loading. RevenueCat must have products under DateToday (App Store) — not only Test Store — linked to offering `default` ($rc_weekly / $rc_monthly) and entitlement datetoday_pro.'
            : null,
        );
      } finally {
        if (alive) setLoadingOffers(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void refreshWebEntitlement();
    if (!webCheckoutBuildAllowed()) return;
    void loadWebCheckout().then((next) => {
      if (alive) setWeb(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Web checkout shows the same plans, priced from DateToday's billing (Stripe). */
  const shownPlans = useMemo(() => {
    if (!webMode || !web) return plans;
    return plans.flatMap((p) => {
      const w = web.plans.find((x) => x.id === p.id);
      return w ? [{ ...p, priceLabel: w.priceLabel, periodLabel: w.periodLabel }] : [];
    });
  }, [plans, web, webMode]);

  const selectedPlan = useMemo(
    () => shownPlans.find((p) => p.id === selected) ?? shownPlans[1] ?? shownPlans[0],
    [shownPlans, selected],
  );

  const selectingCurrent =
    isPlus && entitlements.plusPlanId != null && selected === entitlements.plusPlanId;
  const selectingOther =
    isPlus && entitlements.plusPlanId != null && selected !== entitlements.plusPlanId;

  const ctaLabel = (() => {
    if (!selectedPlan) return 'Continue';
    if (selectingCurrent) return 'Manage subscription';
    if (selectingOther) {
      return selected === 'weekly' ? 'Switch to Weekly' : 'Switch to Monthly';
    }
    return `Continue · ${selectedPlan.priceLabel}/${selectedPlan.periodLabel}`;
  })();

  const finishUnlocked = (title = 'DateToday+ unlocked') => {
    Alert.alert(title, 'Unlimited matches, messages and Advanced Filters are ready.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const openManage = () => {
    if (plusFromWeb) {
      if (Platform.OS === 'ios') return;
      void openWebBillingPortal().catch((e: Error) => Alert.alert('Couldn’t open billing', e.message));
      return;
    }
    void Linking.openURL(managementUrlForEntitlements(entitlements));
  };

  const onWebUpgrade = async () => {
    if (!selectedPlan) return;
    setBusy(true);
    try {
      const result = await startWebCheckout(selectedPlan.id);
      if (result === 'unlocked') {
        finishUnlocked();
      } else if (result === 'processing') {
        Alert.alert(
          'Almost there',
          'Your payment went through. DateToday+ unlocks here in a moment — no need to restart the app.',
        );
      }
    } catch (e) {
      Alert.alert('Couldn’t open checkout', e instanceof Error ? e.message : 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const onContinue = async () => {
    if (!selectedPlan) return;

    if (selectingCurrent) {
      openManage();
      return;
    }

    setBusy(true);
    try {
      const result = selectingOther
        ? await switchPlusPlan(selectedPlan.package)
        : await purchasePlusPackage(selectedPlan.package);

      if (result.status === 'success' || result.status === 'already') {
        finishUnlocked(selectingOther ? 'Plan updated' : 'DateToday+ unlocked');
        return;
      }
      if (result.status === 'cancelled') return;
      if (result.status === 'pending') {
        Alert.alert(
          'Purchase pending',
          'Your payment is processing. DateToday+ will unlock when it clears.',
        );
        return;
      }
      Alert.alert('Couldn’t complete purchase', result.message);
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    setBusy(true);
    try {
      const result = await restorePlusPurchases();
      if (result.status === 'success') {
        finishUnlocked('Purchases restored');
        return;
      }
      if (result.status === 'cancelled') return;
      Alert.alert('Restore', result.status === 'error' ? result.message : 'Nothing to restore.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsHeader title="DateToday+" />

        <AppText style={styles.title}>{headline.title}</AppText>
        <AppText style={styles.sub}>{headline.body}</AppText>

        {isPlus ? (
          <View style={styles.statusCard}>
            <AppText style={styles.statusEyebrow}>Your plan</AppText>
            <AppText style={styles.statusTitle}>{plusStatusLabel(entitlements)}</AppText>
            {plusFromWeb ? (
              <>
                <AppText style={styles.statusBody}>
                  {entitlements.willRenew
                    ? 'Auto-renew is on. Your DateToday+ is billed through your DateToday account.'
                    : 'Auto-renew is off. You’ll keep Plus until the period ends.'}
                </AppText>
                {Platform.OS === 'ios' ? null : (
                  <Pressable onPress={openManage} hitSlop={8}>
                    <AppText style={styles.statusLink}>Manage subscription →</AppText>
                  </Pressable>
                )}
              </>
            ) : (
              <>
                <AppText style={styles.statusBody}>
                  {entitlements.willRenew
                    ? 'Auto-renew is on. Pick Weekly or Monthly below to switch plans, or manage billing in the App Store.'
                    : 'Auto-renew is off. You’ll keep Plus until the period ends — resubscribe anytime.'}
                </AppText>
                <Pressable onPress={openManage} hitSlop={8}>
                  <AppText style={styles.statusLink}>Manage in {Platform.OS === 'android' ? 'Play Store' : 'App Store'} →</AppText>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        <View style={styles.tierCard}>
          <View style={styles.tierBlock}>
            <View style={styles.tierHead}>
              <AppText style={styles.tierTitle}>DateToday Free</AppText>
              <View style={styles.freeBadge}>
                <AppText style={styles.freeBadgeText}>Free</AppText>
              </View>
            </View>
            {FREE_TIER_FEATURES.map((item) => (
              <View key={item.label} style={styles.featureRow}>
                <Ionicons
                  name={item.included ? 'checkmark' : 'lock-closed'}
                  size={rs(16)}
                  color={item.included ? colors.live : colors.textSecondary}
                />
                <AppText style={[styles.feature, !item.included && styles.featureLocked]}>
                  {item.label}
                </AppText>
              </View>
            ))}
          </View>

          <View style={styles.tierDivider} />

          <View style={styles.tierBlock}>
            <View style={styles.tierHead}>
              <AppText style={styles.tierTitle}>DateToday Premium</AppText>
              <View style={styles.priceBadge}>
                <AppText style={styles.priceBadgeText}>{PREMIUM_PRICE_BADGE}</AppText>
              </View>
            </View>
            {PREMIUM_TIER_FEATURES.map((item) => (
              <View key={item.label} style={styles.featureRow}>
                <Ionicons name="checkmark" size={rs(16)} color={colors.live} />
                <AppText style={styles.feature}>{item.label}</AppText>
              </View>
            ))}
          </View>
        </View>

        {storeHint && !webMode ? (
          <View style={styles.hintCard}>
            <AppText style={styles.hintText}>{storeHint}</AppText>
          </View>
        ) : null}

        {webMode && web?.testMode ? (
          <View style={styles.hintCard}>
            <AppText style={styles.hintText}>
              Test mode — nothing is charged. Pay with card 4242 4242 4242 4242, any future date and any CVC.
            </AppText>
          </View>
        ) : null}

        {plusFromWeb ? null : loadingOffers ? (
          <ActivityIndicator color={colors.brandBright} style={{ marginVertical: spacing.md }} />
        ) : (
          <View style={styles.planList}>
            {shownPlans.map((plan) => {
              const on = selected === plan.id;
              const current = isPlus && entitlements.plusPlanId === plan.id;
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => setSelected(plan.id)}
                  style={[styles.planCard, on && styles.planCardOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  {current ? (
                    <View style={styles.badgeCurrent}>
                      <AppText style={styles.badgeText}>CURRENT</AppText>
                    </View>
                  ) : plan.badge ? (
                    <View style={styles.badge}>
                      <AppText style={styles.badgeText}>{plan.badge}</AppText>
                    </View>
                  ) : null}
                  <View style={styles.planTop}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <AppText style={styles.planTitle}>{plan.title}</AppText>
                      <AppText style={styles.planPrice}>
                        {plan.priceLabel}
                        <AppText style={styles.planPeriod}> / {plan.periodLabel}</AppText>
                      </AppText>
                      <AppText style={styles.planCaption}>{plan.caption}</AppText>
                    </View>
                    <View style={[styles.check, on && styles.checkOn]}>
                      {on ? (
                        <Ionicons name="checkmark" size={rs(16)} color={colors.white} />
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {plusFromWeb ? null : webMode ? (
          <>
            <Button label="Upgrade to DateToday+" loading={busy} onPress={() => void onWebUpgrade()} />
            <AppText style={styles.legal}>
              {selectedPlan ? `${selectedPlan.priceLabel}/${selectedPlan.periodLabel}. ` : ''}
              Billed securely by Stripe. Renews automatically until you cancel — cancel anytime from
              Settings › Manage subscription.
            </AppText>
          </>
        ) : comingSoon ? (
          <Button label="Coming soon on Android" disabled onPress={() => undefined} />
        ) : (
          <>
            <Button label={ctaLabel} loading={busy} onPress={() => void onContinue()} />
            <AppText style={styles.legal}>
              Payment is charged to your {Platform.OS === 'android' ? 'Google Play' : 'Apple ID'} account
              at confirmation. Subscription automatically renews unless canceled at least 24 hours before
              the end of the current period. Manage or cancel in your store account settings.
            </AppText>
          </>
        )}

        <View style={styles.links}>
          <Pressable
            onPress={() =>
              void Linking.openURL(
                Platform.OS === 'ios' ? LEGAL_URLS.appleStandardEula : LEGAL_URLS.termsOfService,
              ).catch(() => router.push('/legal/terms'))
            }
          >
            <AppText style={styles.link}>Terms of Use (EULA)</AppText>
          </Pressable>
          <AppText style={styles.linkDot}>·</AppText>
          <Pressable
            onPress={() =>
              void Linking.openURL(LEGAL_URLS.privacyPolicy).catch(() =>
                router.push('/legal/privacy'),
              )
            }
          >
            <AppText style={styles.link}>Privacy</AppText>
          </Pressable>
          {comingSoon ? null : (
            <>
              <AppText style={styles.linkDot}>·</AppText>
              <Pressable onPress={() => void onRestore()} disabled={busy}>
                <AppText style={styles.link}>Restore</AppText>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  statusCard: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: 'rgba(124, 58, 237, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
    gap: 6,
  },
  statusEyebrow: {
    color: colors.brandBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  statusBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  statusLink: {
    color: colors.brandBright,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  tierCard: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  tierBlock: {
    gap: 10,
  },
  tierHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 2,
  },
  tierTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  freeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  freeBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  priceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(34, 229, 139, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(34, 229, 139, 0.45)',
  },
  priceBadgeText: {
    color: colors.live,
    fontSize: 12,
    fontWeight: '800',
  },
  tierDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  feature: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  featureLocked: {
    color: colors.textSecondary,
  },
  planList: {
    gap: 12,
    marginTop: spacing.sm,
  },
  planCard: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 8,
  },
  planCardOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124, 58, 237, 0.16)',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  badgeCurrent: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.85)',
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  planPrice: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  planPeriod: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  planCaption: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.brandBright,
    borderColor: colors.brandBright,
  },
  hintCard: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: 'rgba(168,85,247,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  legal: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.xs,
  },
  link: {
    color: colors.brandBright,
    fontSize: 13,
    fontWeight: '700',
  },
  linkDot: {
    color: colors.textSecondary,
  },
});
