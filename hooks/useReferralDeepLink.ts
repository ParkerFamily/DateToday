import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { parseReferralCode } from '@/lib/referrals/codes';
import { savePendingReferralCode } from '@/lib/referrals/tracking';

/**
 * Hook to handle referral deep links
 * Listens for deep links and saves referral codes for later use during signup
 */
export function useReferralDeepLink() {
  useEffect(() => {
    // Handle initial URL (app opened via deep link)
    void (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleReferralUrl(initialUrl);
      }
    })();

    // Handle subsequent URLs (deep links while app is open)
    const subscription = Linking.addEventListener('url', (event) => {
      handleReferralUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);
}

function handleReferralUrl(url: string) {
  const referralCode = parseReferralCode(url);
  
  if (referralCode) {
    console.log('[Referral] Deep link detected with code:', referralCode);
    void savePendingReferralCode(referralCode);
  }
}
