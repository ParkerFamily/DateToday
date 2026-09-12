import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/theme';
import type { VerificationStatus } from '@/types';

type Props = {
  status: VerificationStatus | null | undefined;
  compact?: boolean;
};

/**
 * Always-on trust tag — verified AND unverified are labeled so the difference is obvious.
 */
export function VerificationTag({ status, compact = false }: Props) {
  const s = status ?? 'unverified';

  if (s === 'verified') {
    return (
      <View
        style={[styles.base, styles.verified, compact && styles.compact]}
        accessibilityLabel="Verified account"
      >
        <Ionicons name="checkmark-circle" size={compact ? 12 : 14} color={colors.live} />
        <AppText style={[styles.label, styles.verifiedLabel]}>VERIFIED</AppText>
      </View>
    );
  }

  if (s === 'pending' || s === 'manual_review') {
    return (
      <View
        style={[styles.base, styles.pending, compact && styles.compact]}
        accessibilityLabel="Verification pending"
      >
        <Ionicons name="time-outline" size={compact ? 12 : 14} color={colors.warning} />
        <AppText style={[styles.label, styles.pendingLabel]}>
          {s === 'manual_review' ? 'IN REVIEW' : 'PENDING'}
        </AppText>
      </View>
    );
  }

  // unverified + failed → not verified tag (visible, not blank)
  return (
    <View
      style={[styles.base, styles.unverified, compact && styles.compact]}
      accessibilityLabel="Not verified"
    >
      <Ionicons name="alert-circle-outline" size={compact ? 12 : 14} color={colors.textSecondary} />
      <AppText style={[styles.label, styles.unverifiedLabel]}>NOT VERIFIED</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  compact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verified: {
    backgroundColor: 'rgba(34, 229, 139, 0.12)',
    borderColor: 'rgba(34, 229, 139, 0.4)',
  },
  unverified: {
    backgroundColor: 'rgba(146, 146, 157, 0.12)',
    borderColor: 'rgba(146, 146, 157, 0.35)',
  },
  pending: {
    backgroundColor: 'rgba(255, 176, 32, 0.12)',
    borderColor: 'rgba(255, 176, 32, 0.4)',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  verifiedLabel: { color: colors.live },
  unverifiedLabel: { color: colors.textSecondary },
  pendingLabel: { color: colors.warning },
});
