import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';

export function ProfileProgress() {
  const percent = useOnboardingDraft((s) => s.profilePercent());
  return (
    <View style={styles.wrap} accessibilityLabel={`Profile ${percent} percent`}>
      <AppText style={styles.label}>PROFILE</AppText>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(percent, 4)}%` }]} />
      </View>
      <AppText style={styles.pct}>{percent}%</AppText>
    </View>
  );
}

export function BuildQuestion({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.q}>
      <AppText style={styles.title}>{title}</AppText>
      {subtitle ? <AppText style={styles.sub}>{subtitle}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.brandBright,
    borderRadius: 999,
  },
  pct: {
    color: colors.brandBright,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'right',
  },
  q: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 40,
    textAlign: 'center',
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
});
