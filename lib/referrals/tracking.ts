import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  query, 
  serverTimestamp, 
  setDoc,
  updateDoc,
  where,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import type { Referral, ReferralRewards, ReferralStatus } from '@/types/referrals';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REFERRAL_CODE_KEY = '@datetoday_referral_code';

/**
 * Save referral code from deep link (before user signs up)
 */
export async function savePendingReferralCode(code: string): Promise<void> {
  await AsyncStorage.setItem(REFERRAL_CODE_KEY, code.toUpperCase());
}

/**
 * Get pending referral code (if user came from a referral link)
 */
export async function getPendingReferralCode(): Promise<string | null> {
  return await AsyncStorage.getItem(REFERRAL_CODE_KEY);
}

/**
 * Clear pending referral code after it's been used
 */
export async function clearPendingReferralCode(): Promise<void> {
  await AsyncStorage.removeItem(REFERRAL_CODE_KEY);
}

/**
 * Record a referral when a new user signs up
 */
export async function recordReferral(
  referredUserId: string,
  referralCode: string
): Promise<boolean> {
  try {
    // Find the referrer by code
    const codesQuery = query(
      collection(getDb(), 'referralCodes'),
      where('code', '==', referralCode.toUpperCase())
    );
    const codesSnap = await getDocs(codesQuery);

    if (codesSnap.empty) {
      console.warn('[Referral] Invalid referral code:', referralCode);
      return false;
    }

    const referrerId = codesSnap.docs[0].data().userId as string;

    // Don't allow self-referrals
    if (referrerId === referredUserId) {
      console.warn('[Referral] User cannot refer themselves');
      return false;
    }

    // Create referral record
    const referralRef = doc(collection(getDb(), 'referrals'));
    const referralData: Omit<Referral, 'id'> = {
      referrerId,
      referredUserId,
      referralCode: referralCode.toUpperCase(),
      status: 'pending',
      completedAt: null,
      createdAt: serverTimestamp() as Timestamp,
    };

    await setDoc(referralRef, referralData);

    // Update referrer's referral count
    const rewardsRef = doc(getDb(), 'referralRewards', referrerId);
    const rewardsSnap = await getDoc(rewardsRef);

    if (rewardsSnap.exists()) {
      await updateDoc(rewardsRef, {
        totalReferrals: increment(1),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Initialize rewards doc
      const initialRewards: Omit<ReferralRewards, 'userId'> = {
        totalReferrals: 1,
        completedReferrals: 0,
        rewards: {
          extraLikes: 0,
          revealCredits: 0,
          premiumHoursRemaining: 0,
          premiumExpiresAt: null,
          hasBadge: false,
        },
        milestones: {
          1: false,
          3: false,
          5: false,
          10: false,
        },
        updatedAt: serverTimestamp() as Timestamp,
      };
      await setDoc(rewardsRef, { userId: referrerId, ...initialRewards });
    }

    // Store referral info on referred user's profile
    await updateDoc(doc(getDb(), 'users', referredUserId), {
      referredBy: referrerId,
      referralCode: referralCode.toUpperCase(),
      referredAt: serverTimestamp(),
    });

    console.log('[Referral] Successfully recorded referral:', {
      referrer: referrerId,
      referred: referredUserId,
      code: referralCode,
    });

    return true;
  } catch (error) {
    console.error('[Referral] Error recording referral:', error);
    return false;
  }
}

/**
 * Complete a referral (when referred user completes onboarding)
 */
export async function completeReferral(referredUserId: string): Promise<void> {
  try {
    // Find the referral record
    const referralsQuery = query(
      collection(getDb(), 'referrals'),
      where('referredUserId', '==', referredUserId),
      where('status', '==', 'pending')
    );
    const referralsSnap = await getDocs(referralsQuery);

    if (referralsSnap.empty) {
      return; // No pending referral
    }

    const referralDoc = referralsSnap.docs[0];
    const referralData = referralDoc.data() as Referral;

    // Mark referral as completed
    await updateDoc(referralDoc.ref, {
      status: 'completed',
      completedAt: serverTimestamp(),
    });

    // Update referrer's completed count
    const rewardsRef = doc(getDb(), 'referralRewards', referralData.referrerId);
    const rewardsSnap = await getDoc(rewardsRef);

    if (!rewardsSnap.exists()) return;

    const currentRewards = rewardsSnap.data() as ReferralRewards;
    const newCompletedCount = currentRewards.completedReferrals + 1;

    // Check for milestone rewards
    const updates: Partial<ReferralRewards> = {
      completedReferrals: newCompletedCount,
      updatedAt: serverTimestamp() as Timestamp,
    };

    // Milestone 1: First referral = 5 extra likes
    if (newCompletedCount >= 1 && !currentRewards.milestones[1]) {
      updates.milestones = { ...currentRewards.milestones, 1: true };
      updates.rewards = {
        ...currentRewards.rewards,
        extraLikes: currentRewards.rewards.extraLikes + 5,
      };
    }

    // Milestone 3: 3 referrals = 1 reveal credit
    if (newCompletedCount >= 3 && !currentRewards.milestones[3]) {
      updates.milestones = { ...updates.milestones, ...currentRewards.milestones, 3: true };
      updates.rewards = {
        ...(updates.rewards || currentRewards.rewards),
        revealCredits: currentRewards.rewards.revealCredits + 1,
      };
    }

    // Milestone 5: 5 referrals = 24h premium
    if (newCompletedCount >= 5 && !currentRewards.milestones[5]) {
      const premiumExpiresAt = new Date();
      premiumExpiresAt.setHours(premiumExpiresAt.getHours() + 24);
      
      updates.milestones = { ...updates.milestones, ...currentRewards.milestones, 5: true };
      updates.rewards = {
        ...(updates.rewards || currentRewards.rewards),
        premiumHoursRemaining: 24,
        premiumExpiresAt: premiumExpiresAt.toISOString(),
      };
    }

    // Milestone 10: 10 referrals = exclusive badge
    if (newCompletedCount >= 10 && !currentRewards.milestones[10]) {
      updates.milestones = { ...updates.milestones, ...currentRewards.milestones, 10: true };
      updates.rewards = {
        ...(updates.rewards || currentRewards.rewards),
        hasBadge: true,
      };

      // Add badge to user's profile
      await updateDoc(doc(getDb(), 'users', referralData.referrerId), {
        badges: ['top_inviter'],
      });
    }

    await updateDoc(rewardsRef, updates);

    console.log('[Referral] Completed referral and awarded rewards:', {
      referrer: referralData.referrerId,
      completedCount: newCompletedCount,
      newMilestones: updates.milestones,
    });
  } catch (error) {
    console.error('[Referral] Error completing referral:', error);
  }
}

/**
 * Get referral rewards for the current user
 */
export async function getReferralRewards(): Promise<ReferralRewards | null> {
  try {
    const userId = getFirebaseAuth().currentUser?.uid;
    if (!userId) return null;

    const rewardsRef = doc(getDb(), 'referralRewards', userId);
    const rewardsSnap = await getDoc(rewardsRef);

    if (!rewardsSnap.exists()) {
      return null;
    }

    return rewardsSnap.data() as ReferralRewards;
  } catch (error) {
    console.error('[Referral] Error fetching rewards:', error);
    return null;
  }
}

/**
 * Get list of users referred by current user
 */
export async function getReferredUsers(): Promise<Array<{
  userId: string;
  displayName: string;
  status: ReferralStatus;
  createdAt: Timestamp;
}>> {
  try {
    const userId = getFirebaseAuth().currentUser?.uid;
    if (!userId) return [];

    const referralsQuery = query(
      collection(getDb(), 'referrals'),
      where('referrerId', '==', userId)
    );
    const referralsSnap = await getDocs(referralsQuery);

    const referred = await Promise.all(
      referralsSnap.docs.map(async (referralDoc) => {
        const referralData = referralDoc.data() as Referral;
        const userSnap = await getDoc(doc(getDb(), 'users', referralData.referredUserId));
        const userData = userSnap.data();

        return {
          userId: referralData.referredUserId,
          displayName: userData?.displayName || 'New User',
          status: referralData.status,
          createdAt: referralData.createdAt,
        };
      })
    );

    return referred;
  } catch (error) {
    console.error('[Referral] Error fetching referred users:', error);
    return [];
  }
}

/**
 * Use a reward (like extra likes or reveal credit)
 */
export async function useReferralReward(
  rewardType: 'likes' | 'reveal'
): Promise<boolean> {
  try {
    const userId = getFirebaseAuth().currentUser?.uid;
    if (!userId) return false;

    const rewardsRef = doc(getDb(), 'referralRewards', userId);
    const rewardsSnap = await getDoc(rewardsRef);

    if (!rewardsSnap.exists()) return false;

    const rewards = rewardsSnap.data() as ReferralRewards;

    if (rewardType === 'likes' && rewards.rewards.extraLikes > 0) {
      await updateDoc(rewardsRef, {
        'rewards.extraLikes': increment(-1),
        updatedAt: serverTimestamp(),
      });
      return true;
    }

    if (rewardType === 'reveal' && rewards.rewards.revealCredits > 0) {
      await updateDoc(rewardsRef, {
        'rewards.revealCredits': increment(-1),
        updatedAt: serverTimestamp(),
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error('[Referral] Error using reward:', error);
    return false;
  }
}
