import { useEffect } from 'react';
import { Alert } from 'react-native';
import { clearPendingInvite, pendingInvite, redeemInvite } from '@/features/referrals/api';
import { useSessionStore } from '@/store/session';
import { refreshLikes } from '@/store/matches';

const FINAL = new Set(['used', 'too_old', 'same_device', 'not_found', 'own_code']);

/** After sign-up: apply the code from an invite link the new member opened earlier. */
export function usePendingInvite() {
  const userId = useSessionStore((s) => s.userId);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void (async () => {
      const code = await pendingInvite();
      if (!code || !live) return;
      try {
        const r = await redeemInvite(code);
        await clearPendingInvite();
        void refreshLikes();
        Alert.alert('Invite applied 🎁', `You got ${r.friendLikes} bonus Likes for joining with a friend’s invite.`);
      } catch (error) {
        const reason = (error as { code?: string | null }).code;
        if (reason && FINAL.has(reason)) await clearPendingInvite();
      }
    })();
    return () => {
      live = false;
    };
  }, [userId]);
}
