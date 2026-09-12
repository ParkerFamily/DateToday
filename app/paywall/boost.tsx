import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LiveBadge } from '@/components/ui/LiveBadge';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import { loadBoostPackage, purchaseTonightBoost } from '@/lib/purchases';
import { useSessionStore } from '@/store/session';
import { isLiveSessionActive } from '@/utils/time';

export default function TonightBoostScreen() {
  const router = useRouter();
  const liveSession = useSessionStore((s) => s.liveSession);
  const live = liveSession ? isLiveSessionActive(liveSession) : false;

  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [priceLabel, setPriceLabel] = useState('$4.99');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await loadBoostPackage();
      if (!alive) return;
      setPkg(next.package);
      setPriceLabel(next.priceLabel);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const purchase = async () => {
    if (!live) {
      Alert.alert('Ping first', 'Tonight Boost only works while your Ping is active.', [
        { text: 'Go Live', onPress: () => router.replace('/(tabs)/live') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    setLoading(true);
    try {
      const result = await purchaseTonightBoost(pkg);
      if (result.status === 'cancelled') return;
      if (result.status === 'already') {
        Alert.alert('Already boosted', 'Tonight Boost is already active on this Ping.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      if (result.status === 'pending') {
        Alert.alert('Purchase pending', 'Your Boost will apply when payment clears.');
        return;
      }
      if (result.status === 'error') {
        Alert.alert('Couldn’t boost', result.message);
        return;
      }
      Alert.alert(
        'You’re boosted',
        'You’re moving toward the front of other active Pings for this session.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.content}>
        <SettingsHeader title="Tonight Boost" />

        <View style={styles.hero}>
          <View style={styles.glow} />
          <AppText style={styles.kicker}>ONE-TIME · THIS PING</AppText>
          <AppText style={styles.title}>Get seen first tonight</AppText>
          <AppText style={styles.sub}>
            Ping first, then Boost — jump higher in other active users’ pools for this Ping session.
          </AppText>
        </View>

        <View style={styles.card}>
          {live ? <LiveBadge label="PING ACTIVE" /> : <AppText variant="label">NOT PINGING</AppText>}
          <AppText style={styles.price}>{priceLabel}</AppText>
          <AppText style={styles.caption}>One-time · lasts for your current Ping</AppText>
        </View>

        {live ? (
          <Button
            label={`Boost Tonight · ${priceLabel}`}
            loading={loading}
            onPress={() => void purchase()}
          />
        ) : (
          <Button
            label="Ping first to Boost"
            onPress={() => router.replace('/(tabs)/live')}
          />
        )}
        <Button label="Not now" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    marginTop: spacing.sm,
    paddingVertical: spacing.lg,
    gap: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -40,
    left: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
  },
  kicker: {
    color: colors.brandBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 340,
  },
  card: {
    marginVertical: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  price: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
  },
  caption: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
