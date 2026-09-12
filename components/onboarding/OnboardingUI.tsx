import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui/AppText';
import { colors, gradients, radii, spacing } from '@/constants/theme';

interface PrimaryCtaProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  showArrow?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PrimaryCta({
  label,
  onPress,
  loading = false,
  disabled = false,
  showArrow = true,
  style,
}: PrimaryCtaProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.ctaWrap,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      <LinearGradient
        colors={[...gradients.brand]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.cta}
      >
        <AppText style={styles.ctaLabel}>{loading ? '…' : label}</AppText>
        {showArrow && !loading ? (
          <Ionicons name="arrow-forward" size={18} color={colors.text} />
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

interface ProgressDotsProps {
  step: number;
  total: number;
}

export function ProgressBar({ step, total }: ProgressDotsProps) {
  const pct = Math.max(0.08, Math.min(1, step / total));
  return (
    <View style={styles.progressTrack} accessibilityLabel={`Step ${step} of ${total}`}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

export function ScriptAccent({ children }: { children: string }) {
  return (
    <AppText
      style={[
        styles.script,
        { fontFamily: 'Caveat_600SemiBold' },
      ]}
    >
      {children}
    </AppText>
  );
}

export function OnboardingHeader({
  title,
  highlight,
  subtitle,
}: {
  title: string;
  highlight?: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.header}>
      <AppText style={styles.title}>
        {title}
        {highlight ? <AppText style={styles.highlight}>{highlight}</AppText> : null}
      </AppText>
      {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ctaWrap: {
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  cta: {
    minHeight: 56,
    borderRadius: radii.pill,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
  disabled: {
    opacity: 0.45,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.brandBright,
  },
  script: {
    fontSize: 28,
    color: colors.text,
    transform: [{ rotate: '-4deg' }],
    textAlign: 'center',
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  highlight: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.brandBright,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
  },
});
