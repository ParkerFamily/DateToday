import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { PLUS_FILTER_FEATURES } from '@/constants/tonightVibe';
import { LEGAL_URLS } from '@/constants/legal';
import { colors, radii, spacing } from '@/constants/theme';
import { isPlusActive, plusStatusLabel } from '@/lib/entitlements';
import {
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
import { useSessionStore } from '@/store/session';

export default function PaywallScreen() {
  const router = useRouter();
  const entitlements = useSessionStore((s) => s.entitlements);
  const isPlus = isPlusActive(entitlements);

  const [plans, setPlans] = useState<PlusPlanOffer[]>([]);
  const [selected, setSelected] = useState<PlusPlanId>('monthly');
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [storeHint, setStoreHint] = useState<string | null>(null);

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

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selected) ?? plans[1] ?? plans[0],
    [plans, selected],
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
    Alert.alert(title, 'Unlimited Ping and messages are ready.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const openManage = () => {
    void Linking.openURL(managementUrlForEntitlements(entitlements));
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

        <AppText style={styles.title}>More time. More conversation. ✦</AppText>
        <AppText style={styles.sub}>
          Unlimited Ping and messages — so you can actually go out tonight.
        </AppText>

        {isPlus ? (
          <View style={styles.statusCard}>
            <AppText style={styles.statusEyebrow}>Your plan</AppText>
            <AppText style={styles.statusTitle}>{plusStatusLabel(entitlements)}</AppText>
            <AppText style={styles.statusBody}>
              {entitlements.willRenew
                ? 'Auto-renew is on. Pick Weekly or Monthly below to switch plans, or manage billing in the App Store.'
                : 'Auto-renew is off. You’ll keep Plus until the period ends — resubscribe anytime.'}
            </AppText>
            <Pressable onPress={openManage} hitSlop={8}>
              <AppText style={styles.statusLink}>Manage in {Platform.OS === 'android' ? 'Play Store' : 'App Store'} →</AppText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.featureCard}>
          {PLUS_FILTER_FEATURES.map((line) => (
            <View key={line} style={styles.featureRow}>
              <AppText style={styles.bullet}>•</AppText>
              <AppText style={styles.feature}>{line}</AppText>
            </View>
          ))}
        </View>

        {storeHint ? (
          <View style={styles.hintCard}>
            <AppText style={styles.hintText}>{storeHint}</AppText>
          </View>
        ) : null}

        {loadingOffers ? (
          <ActivityIndicator color={colors.brandBright} style={{ marginVertical: spacing.md }} />
        ) : (
          <View style={styles.planList}>
            {plans.map((plan) => {
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
                        <Ionicons name="checkmark" size={16} color={colors.white} />
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Button label={ctaLabel} loading={busy} onPress={() => void onContinue()} />

        <AppText style={styles.legal}>
          Payment is charged to your {Platform.OS === 'android' ? 'Google Play' : 'Apple ID'} account
          at confirmation. Subscription automatically renews unless canceled at least 24 hours before
          the end of the current period. Manage or cancel in your store account settings.
        </AppText>

        <View style={styles.links}>
          <Pressable
            onPress={() =>
              void Linking.openURL(LEGAL_URLS.appleStandardEula).catch(() =>
                router.push('/legal/terms'),
              )
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
          <AppText style={styles.linkDot}>·</AppText>
          <Pressable onPress={() => void onRestore()} disabled={busy}>
            <AppText style={styles.link}>Restore</AppText>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  featureCard: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  bullet: {
    color: colors.brandBright,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  feature: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
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
