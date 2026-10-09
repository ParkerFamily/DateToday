import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { matchAllowance } from '@/lib/entitlements';
import { matchesCreatedToday } from '@/lib/usage/dailyLimits';
import { useMatchesStore } from '@/store/matches';
import { useSessionStore } from '@/store/session';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { View } from 'react-native';
import { ScaledSheet, rs } from '@/lib/scale';

export function DailyLikesCounter() {
  const entitlements = useSessionStore((s) => s.entitlements);
  const matches = useMatchesStore((s) => s.matches);
  
  const { limit, used, remaining } = useMemo(() => {
    const allowance = matchAllowance(entitlements);
    if (allowance === 'unlimited') {
      return { limit: 'unlimited', used: 0, remaining: 'unlimited' };
    }
    const usedCount = matchesCreatedToday(matches);
    return {
      limit: allowance,
      used: usedCount,
      remaining: Math.max(0, allowance - usedCount),
    };
  }, [entitlements, matches]);

  if (limit === 'unlimited') {
    return null;
  }

  const progress = limit > 0 ? remaining / limit : 0;
  const isLow = remaining <= 3 && remaining > 0;
  const isEmpty = remaining === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons 
          name="heart" 
          size={rs(16)} 
          color={isEmpty ? colors.danger : isLow ? colors.warning : colors.brandBright} 
        />
        <AppText style={styles.title}>Daily Likes</AppText>
        <AppText style={[styles.count, isEmpty && styles.countEmpty, isLow && styles.countLow]}>
          {remaining} of {limit} left
        </AppText>
      </View>
      
      <View style={styles.progressTrack}>
        <View 
          style={[
            styles.progressFill, 
            { width: `${progress * 100}%` },
            isEmpty && styles.progressEmpty,
            isLow && styles.progressLow,
          ]} 
        />
      </View>
      
      <AppText style={styles.subtitle}>
        {isEmpty 
          ? 'Out of likes for today. Upgrade for unlimited.'
          : isLow
            ? `${remaining} ${remaining === 1 ? 'like' : 'likes'} left — upgrade for unlimited`
            : 'Your free likes reset tomorrow.'}
      </AppText>
    </View>
  );
}

const styles = ScaledSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: 'rgba(9,9,11,0.75)',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  count: {
    color: colors.brandBright,
    fontSize: 15,
    fontWeight: '800',
  },
  countLow: {
    color: colors.warning,
  },
  countEmpty: {
    color: colors.danger,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brandBright,
    borderRadius: 3,
  },
  progressLow: {
    backgroundColor: colors.warning,
  },
  progressEmpty: {
    backgroundColor: colors.danger,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
