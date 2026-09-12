import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { isPlusActive } from '@/lib/entitlements';
import {
  loadPlusPlans,
  purchasePlusPackage,
  restorePlusPurchases,
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

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        setLoadingOffers(true);
        const next = await loadPlusPlans();
        if (alive) setPlans(next);
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

  const ctaLabel = selectedPlan
    ? `Continue · ${selectedPlan.priceLabel}/${selectedPlan.periodLabel}`
    : 'Continue';

  const finishUnlocked = () => {
    Alert.alert('DateToday+ unlocked', 'Unlimited Ping and messages are ready.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const onContinue = async () => {
    if (isPlus) {
      finishUnlocked();
      return;
    }
    if (!selectedPlan) return;
    setBusy(true);
    try {
      const result = await purchasePlusPackage(selectedPlan.package);
      if (result.status === 'success' || result.status === 'already') {
        finishUnlocked();
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
        finishUnlocked();
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

        <View style={styles.featureCard}>
          {PLUS_FILTER_FEATURES.map((line) => (
            <View key={line} style={styles.featureRow}>
              <AppText style={styles.bullet}>•</AppText>
              <AppText style={styles.feature}>{line}</AppText>
            </View>
          ))}
        </View>

        {loadingOffers ? (
          <ActivityIndicator color={colors.brandBright} style={{ marginVertical: spacing.md }} />
        ) : (
          <View style={styles.planList}>
            {plans.map((plan) => {
              const on = selected === plan.id;
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => setSelected(plan.id)}
                  style={[styles.planCard, on && styles.planCardOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  {plan.badge ? (
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

        {isPlus ? (
          <AppText style={styles.have}>You already have DateToday+.</AppText>
        ) : (
          <Button label={ctaLabel} loading={busy} onPress={() => void onContinue()} />
        )}

        <AppText style={styles.legal}>
          Subscription automatically renews unless canceled at least 24 hours before the end of the
          current period. Manage or cancel your subscription in your Apple Account.
        </AppText>

        <View style={styles.links}>
          <Pressable onPress={() => router.push('/legal/terms')}>
            <AppText style={styles.link}>Terms</AppText>
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
            <AppText style={styles.link}>Restore Purchases</AppText>
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
  have: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: spacing.sm,
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
