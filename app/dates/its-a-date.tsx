import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { flowCopy } from '@/constants/flow';
import { colors, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';

/**
 * Celebration after a plan is accepted.
 * Then ask: pause discovery (recommended) or stay Live.
 */
export default function ItsADateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setDiscoveryPaused = useSessionStore((s) => s.setDiscoveryPaused);
  const setDatePlannedTonight = useSessionStore((s) => s.setDatePlannedTonight);
  const params = useLocalSearchParams<{
    name?: string;
    venue?: string;
    time?: string;
    activity?: string;
    conversationId?: string;
  }>();

  const name = params.name ?? 'them';
  const venue = params.venue ?? 'Tonight';
  const time = params.time ?? '8:30';

  const lockDate = (pause: boolean) => {
    setDatePlannedTonight(true);
    setDiscoveryPaused(pause);
  };

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <LinearGradient
        colors={['#1A0B2E', '#0D1F18', '#09090B']}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.fill,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.center}>
          <AppText style={styles.bolt}>⚡</AppText>
          <AppText style={styles.title}>{flowCopy.itsADate}</AppText>
          <AppText style={styles.pair}>You + {name}</AppText>
          <AppText style={styles.venue}>{venue}</AppText>
          <AppText style={styles.time}>{time} PM · Tonight</AppText>
        </View>

        <View style={styles.actions}>
          <AppText style={styles.askTitle}>{flowCopy.stayLiveAsk}</AppText>
          <Button
            label={flowCopy.pauseDiscovery}
            onPress={() => {
              lockDate(true);
              router.replace('/(tabs)/dates');
            }}
          />
          <AppText style={styles.hint}>{flowCopy.pauseDiscoveryHint}</AppText>
          <Button
            label={flowCopy.stayLive}
            variant="secondary"
            onPress={() => {
              lockDate(false);
              router.replace('/(tabs)/dates');
            }}
          />
          <Button
            label={flowCopy.keepChatting}
            variant="ghost"
            onPress={() => {
              lockDate(true);
              router.replace({
                pathname: '/chat/[conversationId]',
                params: {
                  conversationId: String(params.conversationId ?? 'new'),
                  name,
                },
              });
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    gap: 10,
  },
  bolt: { fontSize: 48 },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  pair: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
  },
  venue: {
    color: colors.live,
    fontSize: 24,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  time: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    gap: spacing.sm,
  },
  askTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
