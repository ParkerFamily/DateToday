import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText, BrandMark } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { copy } from '@/constants/copy';
import { colors, radii, spacing } from '@/constants/theme';

export default function DateDetailScreen() {
  const router = useRouter();
  const { dateId } = useLocalSearchParams<{ dateId: string }>();

  const demo = {
    partner: 'Maya',
    when: 'Tonight · 8:30 PM',
    venue: 'The Local',
    neighborhood: 'Midtown',
    activity: 'Drinks',
  };

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <LinearGradient colors={['#160B28', colors.background]} style={styles.fill}>
        <BrandMark size={22} />
        <View style={styles.center}>
          <AppText style={styles.bolt}>⚡</AppText>
          <AppText variant="brand" style={styles.title}>
            {copy.tonightsOn}
          </AppText>
          <AppText variant="secondary">You + {demo.partner}</AppText>

          <View style={styles.card}>
            <AppText variant="label">When</AppText>
            <AppText variant="title">{demo.when}</AppText>
            <AppText variant="label" style={styles.gap}>
              Where
            </AppText>
            <AppText variant="title">{demo.venue}</AppText>
            <AppText variant="secondary">{demo.neighborhood}</AppText>
            <AppText variant="label" style={styles.gap}>
              Plan
            </AppText>
            <AppText>{demo.activity}</AppText>
            <AppText variant="caption" style={styles.id}>
              #{String(dateId)}
            </AppText>
          </View>
        </View>

        <View style={styles.actions}>
          <Button label={copy.message} onPress={() => router.push('/chat/preview')} />
          <Button label="Back to Dates" variant="secondary" onPress={() => router.replace('/(tabs)/dates')} />
        </View>
      </LinearGradient>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 64,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    gap: spacing.md,
  },
  bolt: {
    fontSize: 48,
    color: colors.brandBright,
  },
  title: {
    textAlign: 'center',
  },
  card: {
    width: '100%',
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.surface,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  gap: {
    marginTop: spacing.md,
  },
  id: {
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
});
