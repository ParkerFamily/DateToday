import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText, BrandMark } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.center}>
        <BrandMark size={32} />
        <AppText variant="hero">Page not found</AppText>
        <AppText variant="secondary" style={styles.body}>
          That route doesn’t exist. Head back and keep Pinging.
        </AppText>
        <Button label="Go home" onPress={() => router.replace('/(tabs)/live')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  body: {
    maxWidth: 280,
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
});
