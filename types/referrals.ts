import type { Timestamp } from 'firebase/firestore';

export type ReferralStatus = 'pending' | 'completed' | 'invalid';

export interface ReferralCode {
  userId: string;
  code: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredUserId: string;
  referralCode: string;
  status: ReferralStatus;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface ReferralRewards {
  userId: string;
  totalReferrals: number;
  completedReferrals: number;
  rewards: {
    extraLikes: number;
    revealCredits: number;
    premiumHoursRemaining: number;
    premiumExpiresAt: string | null;
    hasBadge: boolean;
  };
  milestones: {
    1: boolean;  // 5 extra likes
    3: boolean;  // 1 reveal credit
    5: boolean;  // 24h premium
    10: boolean; // exclusive badge
  };
  updatedAt: Timestamp;
}

export interface ReferralRewardTier {
  referrals: number;
  reward: {
    type: 'likes' | 'reveal' | 'premium' | 'badge';
    amount?: number;
    label: string;
    description: string;
  };
}

export const REFERRAL_REWARD_TIERS: ReferralRewardTier[] = [
  {
    referrals: 1,
    reward: {
      type: 'likes',
      amount: 5,
      label: '5 Extra Likes',
      description: '5 bonus likes to use anytime',
    },
  },
  {
    referrals: 3,
    reward: {
      type: 'reveal',
      amount: 1,
      label: 'See Who Likes You',
      description: '1 free reveal to see who liked you',
    },
  },
  {
    referrals: 5,
    reward: {
      type: 'premium',
      amount: 24,
      label: '24 Hours Premium',
      description: 'Unlock DateToday+ features for 24 hours',
    },
  },
  {
    referrals: 10,
    reward: {
      type: 'badge',
      label: 'Top Inviter Badge',
      description: 'Exclusive profile badge for bringing friends',
    },
  },
];
