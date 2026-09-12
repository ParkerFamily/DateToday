import { Redirect } from 'expo-router';

/** Legacy route → new pick → record flow */
export default function VideoPromptLegacyRedirect() {
  return <Redirect href="/(onboarding)/video-pick" />;
}
