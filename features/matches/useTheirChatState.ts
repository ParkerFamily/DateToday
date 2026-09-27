import { useEffect, useRef, useState } from 'react';
import { subscribeMemberState } from '@/features/matches/api';
import { usePrivacyControls } from '@/store/privacyControls';

/** How long a typing ping stays visible without a refresh (measured on this device, so clock skew doesn't matter). */
const TYPING_VISIBLE_MS = 6500;
/** Ignore typing pings older than this by server time (e.g. they closed the app mid-sentence). */
const TYPING_STALE_MS = 30000;

/**
 * The other person's read receipt + typing state for one match. Reciprocal like the rules:
 * with read receipts off you see neither, and nothing is subscribed.
 */
export function useTheirChatState(matchId: string, theirId: string) {
  const receiptsOn = usePrivacyControls((s) => s.readReceipts);
  const [lastReadAt, setLastReadAt] = useState<Date | null>(null);
  const [typing, setTypingVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchId = receiptsOn ? theirId : '';

  useEffect(() => {
    if (!matchId || !watchId) return;
    const unsub = subscribeMemberState(matchId, watchId, (state) => {
      setLastReadAt(state.lastReadAt);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const fresh =
        state.typingAt != null && Math.abs(Date.now() - state.typingAt.getTime()) < TYPING_STALE_MS;
      setTypingVisible(fresh);
      if (fresh) hideTimer.current = setTimeout(() => setTypingVisible(false), TYPING_VISIBLE_MS);
    });
    return () => {
      unsub();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setTypingVisible(false);
      setLastReadAt(null);
    };
  }, [matchId, watchId]);

  return { lastReadAt, typing };
}
