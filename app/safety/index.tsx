import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';

const LINKS = [
  {
    title: 'Report someone',
    body: 'Harassment, scams, underage, or safety concerns.',
    href: '/safety/report' as const,
  },
  {
    title: 'Blocked users',
    body: 'People you have blocked stay out of discovery and chat.',
    href: '/settings/blocked' as const,
  },
  {
    title: 'Community Guidelines',
    body: 'Respect, consent, no solicitation, no minors.',
    href: '/legal/guidelines' as const,
  },
  {
    title: 'Dating Safety Tips',
    body: 'Meet in public, tell a friend, and know when to leave.',
    href: '/safety/tips' as const,
  },
];

export default function SafetyCenterScreen() {
  const router = useRouter();

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Safety Center" />
        <AppText variant="secondary">
          Block, report, and get help. Your exact location is never shared.
        </AppText>

        <View style={styles.list}>
          {LINKS.map((item) => (
            <Pressable
              key={item.title}
              style={styles.card}
              onPress={() => router.push(item.href)}
            >
              <AppText variant="title">{item.title}</AppText>
              <AppText variant="secondary">{item.body}</AppText>
            </Pressable>
          ))}
        </View>

        <Button label="Close" variant="secondary" onPress={() => router.back()} />
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
  list: {
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
});
