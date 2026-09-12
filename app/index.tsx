import { Redirect } from 'expo-router';
import { useSessionStore } from '@/store/session';
import { hasEnteredApp } from '@/utils/accountEntry';
import { isBackendConfigured } from '@/lib/env';

/**
 * Cold-start entry. Prefer tabs for finished accounts — never bounce a
 * completed user through welcome/onboarding just because `/` reloaded.
 */
export default function Index() {
  const userId = useSessionStore((s) => s.userId);
  const profile = useSessionStore((s) => s.profile);

  if (!isBackendConfigured()) {
    return <Redirect href="/(auth)/welcome" />;
  }
  if (!userId) {
    return <Redirect href="/(auth)/welcome" />;
  }
  if (hasEnteredApp(profile)) {
    return <Redirect href="/(tabs)/live" />;
  }
  return <Redirect href="/(onboarding)/name" />;
}
