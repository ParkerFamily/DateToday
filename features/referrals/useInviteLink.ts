import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { savePendingInvite } from '@/features/referrals/api';

const INVITE_PATH = /(?:^|[/?&])(?:invite\/|c=)([A-Za-z0-9]{8})(?![A-Za-z0-9])/;

/** Remembers the code from an invite link (datetoday://invite/CODE), even before sign-up. */
export function useInviteLink() {
  useEffect(() => {
    const keep = (url: string | null) => {
      const code = url?.match(INVITE_PATH)?.[1];
      if (code) void savePendingInvite(code);
    };
    void Linking.getInitialURL().then(keep).catch(() => undefined);
    const sub = Linking.addEventListener('url', (e) => keep(e.url));
    return () => sub.remove();
  }, []);
}
