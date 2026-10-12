import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Share, Alert, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { getReferralCode, generateReferralLink } from '@/lib/referrals/codes';
import { getReferralRewards, getReferredUsers } from '@/lib/referrals/tracking';
import type { ReferralRewards } from '@/types/referrals';
import { REFERRAL_REWARD_TIERS } from '@/types/referrals';
import { Ionicons } from '@expo/vector-icons';

export default function InviteScreen() {
  const userId = useSessionStore((s) => s.userId);
  const profile = useSessionStore((s) => s.profile);
  
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [rewards, setRewards] = useState<ReferralRewards | null>(null);
  const [referredCount, setReferredCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    
    void (async () => {
      try {
        const [code, rewardsData, referred] = await Promise.all([
          getReferralCode(userId),
          getReferralRewards(),
          getReferredUsers(),
        ]);
        
        setReferralCode(code);
        setRewards(rewardsData);
        setReferredCount(referred.length);
      } catch (error) {
        console.error('[Invite] Error loading referral data:', error);
        Alert.alert('Error', 'Could not load referral information');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const copyCode = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    Alert.alert('Copied!', 'Referral code copied to clipboard');
  };

  const shareInvite = async () => {
    if (!referralCode) return;
    
    const { universalLink } = generateReferralLink(referralCode);
    const message = `Join me on DateToday! Use my code ${referralCode} or click: ${universalLink}`;
    
    try {
      await Share.share({
        message,
        title: 'Join DateToday',
        url: universalLink,
      });
    } catch (error) {
      console.error('[Invite] Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <SettingsHeader title="Invite Friends" />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brandBright} />
        </View>
      </Screen>
    );
  }

  const completedReferrals = rewards?.completedReferrals ?? 0;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Invite Friends & Earn Rewards" />

        <View style={styles.section}>
          <AppText variant="secondary" style={styles.lead}>
            Invite friends to DateToday and unlock exclusive rewards when they join!
          </AppText>
        </View>

        {/* Referral Code Card */}
        <View style={styles.codeCard}>
          <AppText variant="label" style={styles.codeLabel}>
            Your Referral Code
          </AppText>
          <View style={styles.codeRow}>
            <AppText style={styles.code}>{referralCode}</AppText>
            <Pressable style={styles.copyBtn} onPress={copyCode}>
              <Ionicons name="copy-outline" size={20} color={colors.brandBright} />
            </Pressable>
          </View>
          <AppText variant="secondary" style={styles.codeHint}>
            Share this code with friends or use the share button below
          </AppText>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <AppText style={styles.statValue}>{referredCount}</AppText>
            <AppText variant="secondary" style={styles.statLabel}>
              Total Invites
            </AppText>
          </View>
          <View style={styles.statCard}>
            <AppText style={styles.statValue}>{completedReferrals}</AppText>
            <AppText variant="secondary" style={styles.statLabel}>
              Completed
            </AppText>
          </View>
        </View>

        {/* Share Button */}
        <Pressable style={styles.shareBtn} onPress={shareInvite}>
          <Ionicons name="share-social" size={24} color="#fff" />
          <AppText style={styles.shareBtnText}>Share Invite Link</AppText>
        </Pressable>

        {/* Rewards Progress */}
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>Your Rewards</AppText>
          
          {rewards && (
            <View style={styles.currentRewards}>
              {rewards.rewards.extraLikes > 0 && (
                <View style={styles.rewardItem}>
                  <Ionicons name="heart" size={20} color={colors.brandBright} />
                  <AppText style={styles.rewardText}>
                    {rewards.rewards.extraLikes} Extra Likes
                  </AppText>
                </View>
              )}
              {rewards.rewards.revealCredits > 0 && (
                <View style={styles.rewardItem}>
                  <Ionicons name="eye" size={20} color={colors.brandBright} />
                  <AppText style={styles.rewardText}>
                    {rewards.rewards.revealCredits} Reveal Credits
                  </AppText>
                </View>
              )}
              {rewards.rewards.premiumExpiresAt && (
                <View style={styles.rewardItem}>
                  <Ionicons name="star" size={20} color={colors.brandBright} />
                  <AppText style={styles.rewardText}>
                    {rewards.rewards.premiumHoursRemaining}h Premium
                  </AppText>
                </View>
              )}
              {rewards.rewards.hasBadge && (
                <View style={styles.rewardItem}>
                  <Ionicons name="ribbon" size={20} color={colors.brandBright} />
                  <AppText style={styles.rewardText}>Top Inviter Badge</AppText>
                </View>
              )}
              
              {!rewards.rewards.extraLikes && 
               !rewards.rewards.revealCredits && 
               !rewards.rewards.premiumExpiresAt && 
               !rewards.rewards.hasBadge && (
                <AppText variant="secondary" style={styles.noRewards}>
                  No rewards yet. Invite friends to unlock rewards!
                </AppText>
              )}
            </View>
          )}
        </View>

        {/* Reward Tiers */}
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>Reward Milestones</AppText>
          
          {REFERRAL_REWARD_TIERS.map((tier, index) => {
            const isUnlocked = completedReferrals >= tier.referrals;
            const isCurrent = 
              completedReferrals < tier.referrals &&
              (index === 0 || completedReferrals >= REFERRAL_REWARD_TIERS[index - 1].referrals);
            
            return (
              <View
                key={tier.referrals}
                style={[
                  styles.tierCard,
                  isUnlocked && styles.tierUnlocked,
                  isCurrent && styles.tierCurrent,
                ]}
              >
                <View style={styles.tierLeft}>
                  <View style={[
                    styles.tierBadge,
                    isUnlocked && styles.tierBadgeUnlocked,
                  ]}>
                    {isUnlocked ? (
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    ) : (
                      <AppText style={styles.tierNumber}>{tier.referrals}</AppText>
                    )}
                  </View>
                  <View style={styles.tierInfo}>
                    <AppText style={styles.tierLabel}>{tier.reward.label}</AppText>
                    <AppText variant="secondary" style={styles.tierDesc}>
                      {tier.reward.description}
                    </AppText>
                  </View>
                </View>
                {!isUnlocked && (
                  <AppText variant="secondary" style={styles.tierProgress}>
                    {completedReferrals}/{tier.referrals}
                  </AppText>
                )}
              </View>
            );
          })}
        </View>

        {/* How It Works */}
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>How It Works</AppText>
          
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <AppText style={styles.stepNumberText}>1</AppText>
            </View>
            <AppText style={styles.stepText}>
              Share your referral code or link with friends
            </AppText>
          </View>
          
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <AppText style={styles.stepNumberText}>2</AppText>
            </View>
            <AppText style={styles.stepText}>
              They sign up using your code
            </AppText>
          </View>
          
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <AppText style={styles.stepNumberText}>3</AppText>
            </View>
            <AppText style={styles.stepText}>
              You both get rewards when they complete their profile!
            </AppText>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  codeCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brandBright,
  },
  codeLabel: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  code: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.brandBright,
    letterSpacing: 2,
  },
  copyBtn: {
    padding: spacing.sm,
  },
  codeHint: {
    marginTop: spacing.sm,
    fontSize: 13,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  statCard: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.brandBright,
  },
  statLabel: {
    marginTop: spacing.xs,
    fontSize: 13,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.brandBright,
    borderRadius: 12,
  },
  shareBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  currentRewards: {
    gap: spacing.sm,
  },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  rewardText: {
    fontSize: 15,
    fontWeight: '600',
  },
  noRewards: {
    textAlign: 'center',
    padding: spacing.lg,
  },
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tierUnlocked: {
    backgroundColor: `${colors.brandBright}10`,
    borderColor: colors.brandBright,
  },
  tierCurrent: {
    borderColor: colors.brandBright,
    borderWidth: 2,
  },
  tierLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  tierBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierBadgeUnlocked: {
    backgroundColor: colors.brandBright,
  },
  tierNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  tierInfo: {
    flex: 1,
  },
  tierLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  tierDesc: {
    fontSize: 13,
  },
  tierProgress: {
    fontSize: 14,
    fontWeight: '600',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    paddingTop: 4,
  },
});
