import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { friendlyError } from '@/lib/errors';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { flowCopy, icebreakersFor } from '@/constants/flow';
import { colors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { confirmBlockAndReport } from '@/features/safety/blockFlow';
import { canStartPlan } from '@/features/live/planGate';
import { useBlocksStore } from '@/store/blocks';
import { usePrivacyControls } from '@/store/privacyControls';
import { canMessageMatch, isOngoingConversation, recordMessagedMatch } from '@/lib/usage/dailyLimits';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { isPlusActive } from '@/lib/entitlements';
import {
  markMatchRead,
  otherUserId,
  proposalSummary,
  respondToDate,
  cancelDate,
  setTyping,
  subscribeMatch,
  subscribeMessages,
  unmatch,
  type MatchDoc,
  type MatchMessage,
} from '@/features/matches/api';
import {
  flushOutbox,
  removeFromOutbox,
  retryOutboxMessage,
  sendTextMessage,
  useOutbox,
} from '@/features/matches/outbox';
import { useTheirChatState } from '@/features/matches/useTheirChatState';
import { TypingDots } from '@/components/chat/TypingDots';
import { clearActiveChat, dismissNotificationsForMatch, setActiveChat } from '@/features/notifications/push';
import { ScaledSheet, rs } from '@/lib/scale';
import { addDateToCalendar } from '@/features/dates/calendar';

type ListItem =
  | { kind: 'message'; message: MatchMessage }
  | { kind: 'separator'; id: string; label: string }
  | { kind: 'nudge'; id: string };

/** A time header starts a new day or follows a gap of an hour or more. */
const SEPARATOR_GAP_MS = 60 * 60 * 1000;

function separatorLabel(at: Date, now = new Date()): string {
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (days <= 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function markRead(matchId: string, clearUnread = true) {
  return markMatchRead(matchId, usePrivacyControls.getState().readReceipts, clearUnread);
}

const TYPING_PING_MS = 3000;
const TYPING_IDLE_MS = 5000;

/** Sends a typing ping at most every few seconds while drafting; clears on idle, send, blur, or background. */
function useTypingSender(matchId: string) {
  const lastPing = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (lastPing.current === 0) return;
    lastPing.current = 0;
    void setTyping(matchId, false);
  }, [matchId]);

  const onDraftChange = useCallback(
    (text: string) => {
      if (!matchId) return;
      if (!text.trim()) {
        stop();
        return;
      }
      const now = Date.now();
      if (now - lastPing.current > TYPING_PING_MS) {
        lastPing.current = now;
        void setTyping(matchId, true);
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(stop, TYPING_IDLE_MS);
    },
    [matchId, stop],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stop();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [stop]);

  return { onDraftChange, stopTyping: stop };
}

function receiptLabel(message: MatchMessage, theirReadMs: number): string {
  if (message.failed) return '';
  if (message.pending || !message.createdAt) return 'Sending…';
  if (theirReadMs && theirReadMs >= message.createdAt.getTime()) return 'Seen';
  return 'Sent';
}

function openDirections(p: NonNullable<MatchMessage['proposal']>) {
  const label = encodeURIComponent(p.venueName || 'Date spot');
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${p.venueLat},${p.venueLng}&q=${label}`
      : `geo:${p.venueLat},${p.venueLng}?q=${p.venueLat},${p.venueLng}(${label})`;
  void Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.venueLat},${p.venueLng}`),
  );
}

function AddToCalendarLink({ matchId, messageId }: { matchId: string; messageId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      disabled={busy}
      onPress={() => {
        setBusy(true);
        void addDateToCalendar(matchId, messageId).finally(() => setBusy(false));
      }}
    >
      <AppText style={[styles.proposalDirections, busy && styles.proposalLinkBusy]}>
        {busy ? 'Adding…' : 'Add to calendar ›'}
      </AppText>
    </Pressable>
  );
}

/** Owns the draft so typing never re-renders the message list. Clears on the first tap. */
const Composer = memo(function Composer({
  bottomPad,
  onSend,
  onDraftChange,
  onBlur,
}: {
  bottomPad: number;
  onSend: (text: string) => Promise<boolean>;
  onDraftChange: (text: string) => void;
  onBlur: () => void;
}) {
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');

  const update = (text: string) => {
    draftRef.current = text;
    setDraft(text);
  };

  const submit = () => {
    const text = draftRef.current.trim();
    if (!text) return;
    update('');
    void onSend(text).then((ok) => {
      if (!ok && !draftRef.current) update(text);
    });
  };

  return (
    <View style={[styles.composer, { paddingBottom: bottomPad }]}>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          update(text);
          onDraftChange(text);
        }}
        onBlur={onBlur}
        placeholder="Message…"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        maxLength={2000}
        multiline
      />
      <Button label="Send" onPress={submit} disabled={!draft.trim()} style={styles.send} />
    </View>
  );
});

const NudgeCard = memo(function NudgeCard({
  onPlan,
  onDismiss,
}: {
  onPlan: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.nudge}>
      <AppText style={styles.nudgeTitle}>{flowCopy.feelingVibe}</AppText>
      <AppText style={styles.nudgeBody}>{flowCopy.feelingVibeBody}</AppText>
      <Button label={flowCopy.makeAPlan} onPress={onPlan} style={styles.nudgeCta} />
      <Pressable onPress={onDismiss}>
        <AppText style={styles.writeOwn}>Not yet</AppText>
      </Pressable>
    </View>
  );
});

const MessageRow = memo(function MessageRow({
  matchId,
  message,
  mine,
  myId,
  theirName,
  receipt,
  responding,
  onRespond,
  onPlan,
  onRetry,
}: {
  matchId: string;
  message: MatchMessage;
  mine: boolean;
  myId: string | undefined;
  theirName: string;
  receipt: string | null;
  responding: boolean;
  onRespond: (message: MatchMessage, status: 'accepted' | 'declined' | 'canceled') => Promise<void>;
  onPlan: () => void;
  onRetry: (message: MatchMessage) => void;
}) {
  if (message.type === 'date_proposal') {
    const p = message.proposal;
    const startsMs = p?.startsAt ? Date.parse(p.startsAt) : NaN;
    const expired = Number.isFinite(startsMs) && startsMs < Date.now() - 60 * 60 * 1000;
    return (
      <View style={[styles.proposal, mine ? styles.proposalMine : styles.proposalTheirs]}>
        <AppText style={styles.proposalEyebrow}>
          {mine ? 'YOU SUGGESTED A DATE' : `${theirName.toUpperCase()} SUGGESTED A DATE`}
        </AppText>
        <AppText style={styles.proposalVenue}>{p?.venueName || 'Somewhere fun'}</AppText>
        {p?.venueAddress || p?.neighborhood ? (
          <AppText style={styles.proposalMeta} numberOfLines={1}>
            {[p?.venueAddress, p?.neighborhood].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        <AppText style={styles.proposalMeta}>
          {[p?.activityLabel, p?.whenLabel].filter(Boolean).join(' · ')}
        </AppText>
        {(p && typeof p.venueLat === 'number' && typeof p.venueLng === 'number') ||
        (message.status === 'accepted' && !expired && !message.pending) ? (
          <View style={styles.proposalLinks}>
            {p && typeof p.venueLat === 'number' && typeof p.venueLng === 'number' ? (
              <Pressable hitSlop={8} onPress={() => openDirections(p)}>
                <AppText style={styles.proposalDirections}>Directions ›</AppText>
              </Pressable>
            ) : null}
            {message.status === 'accepted' && !expired && !message.pending ? (
              <AddToCalendarLink matchId={matchId} messageId={message.id} />
            ) : null}
          </View>
        ) : null}
        {message.status === 'proposed' && expired ? (
          <AppText style={[styles.proposalStatus, styles.proposalDeclined]}>This plan’s time has passed</AppText>
        ) : message.status === 'proposed' ? (
          mine ? (
            <AppText style={styles.proposalStatus}>Waiting for {theirName}…</AppText>
          ) : (
            <View style={styles.proposalActions}>
              <Button
                label={flowCopy.accept}
                loading={responding}
                onPress={() => void onRespond(message, 'accepted')}
              />
              <Button label="Suggest something else" variant="secondary" onPress={onPlan} />
              <Button
                label={flowCopy.decline}
                variant="ghost"
                disabled={responding}
                onPress={() => void onRespond(message, 'declined')}
              />
            </View>
          )
        ) : message.status === 'canceled' ? (
          <AppText style={[styles.proposalStatus, styles.proposalDeclined]}>
            {message.canceledBy && message.canceledBy === myId
              ? 'You canceled this date'
              : `${theirName} canceled this date`}
          </AppText>
        ) : (
          <View style={styles.proposalLinks}>
            <AppText
              style={[styles.proposalStatus, message.status === 'declined' && styles.proposalDeclined]}
            >
              {message.status === 'accepted' ? 'It’s a date ⚡' : 'Declined'}
            </AppText>
            {message.status === 'accepted' && !expired && !message.pending ? (
              <Pressable
                hitSlop={8}
                disabled={responding}
                onPress={() => void onRespond(message, 'canceled')}
                accessibilityRole="button"
                accessibilityLabel="Cancel this date"
              >
                <AppText style={styles.proposalCancel}>Cancel date</AppText>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs, message.failed && styles.bubbleFailed]}>
        <AppText style={mine ? styles.mineText : undefined}>{message.text}</AppText>
      </View>
      {message.failed ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onRetry(message)}>
          <AppText style={styles.failedLabel}>Not delivered · Tap to retry</AppText>
        </Pressable>
      ) : receipt ? (
        <AppText style={styles.receipt}>{receipt}</AppText>
      ) : null}
    </View>
  );
},
// Snapshots rebuild every message object; a proposal's details never change after it's sent.
(a, b) =>
  a.message.id === b.message.id &&
  a.message.text === b.message.text &&
  a.message.status === b.message.status &&
  a.message.failed === b.message.failed &&
  a.mine === b.mine &&
  a.myId === b.myId &&
  a.theirName === b.theirName &&
  a.receipt === b.receipt &&
  a.responding === b.responding &&
  a.onRespond === b.onRespond &&
  a.onPlan === b.onPlan &&
  a.onRetry === b.onRetry);

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ conversationId: string; icebreakers?: string }>();
  const matchId = String(params.conversationId ?? '');

  const userId = useSessionStore((s) => s.userId) ?? '';
  const entitlements = useSessionStore((s) => s.entitlements);
  const listRef = useRef<FlatList<ListItem>>(null);
  const nearBottomRef = useRef(true);

  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [matchState, setMatchState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [serverMessages, setServerMessages] = useState<MatchMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [messageLocked, setMessageLocked] = useState(false);
  const focusedRef = useRef(false);
  const outboxItems = useOutbox((s) => s.items);

  // Server messages plus anything still in the outbox, so an unconfirmed message never disappears.
  const messages = useMemo<MatchMessage[]>(() => {
    const queued = outboxItems.filter((o) => o.matchId === matchId);
    if (!queued.length) return serverMessages;
    const failed = new Set(queued.filter((o) => o.failed).map((o) => o.id));
    const onServer = new Set(serverMessages.map((m) => m.id));
    const merged = serverMessages.map((m) => (m.pending && failed.has(m.id) ? { ...m, failed: true } : m));
    const local: MatchMessage[] = queued
      .filter((o) => !onServer.has(o.id))
      .map((o) => ({
        id: o.id,
        senderId: o.senderId,
        type: 'text',
        text: o.text,
        createdAt: new Date(o.queuedAt),
        pending: true,
        failed: Boolean(o.failed),
      }));
    return local.length ? [...merged, ...local] : merged;
  }, [serverMessages, outboxItems, matchId]);

  useEffect(() => {
    for (const o of outboxItems) {
      if (o.matchId !== matchId) continue;
      if (serverMessages.some((m) => m.id === o.id && !m.pending)) removeFromOutbox(o.id);
    }
  }, [serverMessages, outboxItems, matchId]);

  const ongoing = useMemo(() => isOngoingConversation(serverMessages, userId), [serverMessages, userId]);
  const ongoingRef = useRef(ongoing);
  ongoingRef.current = ongoing;

  useFocusEffect(
    useCallback(() => {
      if (!matchId) return;
      let alive = true;
      void canMessageMatch(entitlements, matchId, { ongoing }).then((gate) => {
        if (alive) setMessageLocked(!gate.ok);
      });
      return () => {
        alive = false;
      };
    }, [matchId, entitlements, ongoing]),
  );

  const theirId = match ? otherUserId(match, userId) : '';
  const them = match?.users[theirId];
  const theirName = them?.displayName ?? 'Match';
  const isBlocked = useBlocksStore((s) => Boolean(theirId && s.byId[theirId]));
  const blockedMe = useBlocksStore((s) => Boolean(theirId && s.hidden[theirId]));
  const receiptsOn = usePrivacyControls((s) => s.readReceipts);
  const { lastReadAt: theirLastReadAt, typing: theyAreTyping } = useTheirChatState(matchId, theirId);
  const { onDraftChange, stopTyping } = useTypingSender(receiptsOn ? matchId : '');

  useEffect(() => {
    if (!matchId) {
      setMatchState('missing');
      return;
    }
    // A listener that errors stops for good, so transient failures resubscribe instead of
    // leaving the chat silently frozen.
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let unsubMatch = () => {};
    let unsubMessages = () => {};
    const retryLater = (fn: () => void) => {
      if (alive) timers.push(setTimeout(() => alive && fn(), 3000));
    };
    const listenMatch = () => {
      unsubMatch = subscribeMatch(
        matchId,
        (m) => {
          setMatch(m);
          setMatchState(m ? 'ready' : 'missing');
        },
        (error) => {
          if ((error as { code?: string }).code === 'permission-denied') setMatchState('missing');
          else retryLater(listenMatch);
        },
      );
    };
    const listenMessages = () => {
      unsubMessages = subscribeMessages(
        matchId,
        (rows) => {
          setServerMessages(rows);
          setMessagesLoaded(true);
        },
        (error) => {
          if ((error as { code?: string }).code !== 'permission-denied') retryLater(listenMessages);
        },
      );
    };
    listenMatch();
    listenMessages();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      unsubMatch();
      unsubMessages();
    };
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setActiveChat(matchId);
      if (matchId) {
        if (AppState.currentState === 'active') void markRead(matchId);
        void dismissNotificationsForMatch(matchId);
        void flushOutbox(matchId);
      }
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active' && matchId) {
          void markRead(matchId);
          void dismissNotificationsForMatch(matchId);
          void flushOutbox(matchId);
        }
      });
      return () => {
        focusedRef.current = false;
        clearActiveChat(matchId);
        sub.remove();
        stopTyping();
      };
    }, [matchId, stopTyping]),
  );

  const myUnread = match?.unread[userId] ?? 0;
  const lastTheirsAt = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].senderId !== userId) return messages[i].createdAt?.getTime() ?? 0;
    }
    return 0;
  }, [messages, userId]);
  useEffect(() => {
    // Only while actually looking at the chat, so "Seen" is never sent from a backgrounded screen.
    if (!focusedRef.current || AppState.currentState !== 'active' || !matchId) return;
    if (myUnread > 0 || lastTheirsAt > 0) void markRead(matchId, myUnread > 0);
  }, [myUnread, lastTheirsAt, matchId]);

  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].senderId === userId) return messages[i].id;
    }
    return null;
  }, [messages, userId]);

  const openers = useMemo(() => icebreakersFor({ food: '', name: theirName }), [theirName]);
  // Wait for the first snapshot so openers don't flash over an existing conversation.
  const showIcebreakers = matchState === 'ready' && messagesLoaded && messages.length === 0;
  const mySentCount = messages.filter((m) => m.senderId === userId && m.type === 'text').length;
  const hasProposal = messages.some((m) => m.type === 'date_proposal');

  const items = useMemo<ListItem[]>(() => {
    const list: ListItem[] = [];
    let prevMs = 0;
    for (const message of messages) {
      const at = message.createdAt;
      const ms = at?.getTime() ?? 0;
      if (at && (!prevMs || ms - prevMs >= SEPARATOR_GAP_MS || new Date(prevMs).toDateString() !== at.toDateString())) {
        list.push({ kind: 'separator', id: `sep_${message.id}`, label: separatorLabel(at) });
      }
      if (ms) prevMs = ms;
      list.push({ kind: 'message', message });
    }
    if (mySentCount >= 3 && !hasProposal && !nudgeDismissed) {
      list.push({ kind: 'nudge', id: 'nudge' });
    }
    return list;
  }, [messages, mySentCount, hasProposal, nudgeDismissed]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/dates');
  };

  const entitlementsRef = useRef(entitlements);
  entitlementsRef.current = entitlements;
  const lastSentRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  /**
   * Resolves false when the message wasn't queued, so the composer can restore it. Once queued it
   * lives in the outbox until the server has it; delivery problems show on the bubble with a retry.
   */
  const sendBody = useCallback(
    async (body: string): Promise<boolean> => {
      const text = body.trim();
      if (!text || !matchId) return false;
      // A double tap on an icebreaker can fire the same send twice.
      const now = Date.now();
      if (lastSentRef.current.text === text && now - lastSentRef.current.at < 1000) return true;
      lastSentRef.current = { text, at: now };
      stopTyping();

      const ent = entitlementsRef.current;
      const gate = await canMessageMatch(ent, matchId, { ongoing: ongoingRef.current });
      if (!gate.ok) {
        lastSentRef.current = { text: '', at: 0 };
        setMessageLocked(true);
        openUpgrade(router, 'message');
        return false;
      }
      nearBottomRef.current = true;
      const queued = await sendTextMessage(matchId, text);
      if (!queued) {
        lastSentRef.current = { text: '', at: 0 };
        Alert.alert('Message not sent', 'You’re signed out. Log in again and retry.');
        return false;
      }
      if (!isPlusActive(ent)) await recordMessagedMatch(matchId);
      return true;
    },
    [matchId, router, stopTyping],
  );

  const retryMessage = useCallback((message: MatchMessage) => {
    void retryOutboxMessage(message.id).catch(() => undefined);
  }, []);

  const confirmUnmatch = () => {
    Alert.alert(
      `Unmatch ${theirName}?`,
      'They’ll disappear from your matches and this chat will be deleted for both of you. They won’t be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmatch',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await unmatch(matchId);
                void dismissNotificationsForMatch(matchId);
                goBack();
              } catch (error) {
                Alert.alert('Couldn’t unmatch', friendlyError(error, 'Try again.'));
              }
            })();
          },
        },
      ],
    );
  };

  const themPhoto = them?.mainPhotoUrl ?? '';
  const openPlan = useCallback(() => {
    // A date idea starts a conversation too, so it shares the free one-chat-a-day limit.
    if (messageLocked) {
      openUpgrade(router, 'message');
      return;
    }
    if (!canStartPlan(router)) return;
    router.push({
      pathname: '/dates/plan',
      params: {
        name: theirName,
        photo: themPhoto,
        conversationId: matchId,
        mode: 'plan',
        ongoing: ongoing ? '1' : '',
      },
    });
  }, [router, theirName, themPhoto, matchId, messageLocked, ongoing]);

  const openProfile = () => {
    if (!theirId) return;
    router.push({ pathname: '/profile/[userId]', params: { userId: theirId, fromMatch: '1' } });
  };

  const cancelPlannedDate = useCallback(
    (message: MatchMessage) =>
      new Promise<void>((resolve) => {
        Alert.alert('Cancel this date?', `${theirName} will get a notification that it’s off.`, [
          { text: 'Keep it', style: 'cancel', onPress: () => resolve() },
          {
            text: 'Cancel date',
            style: 'destructive',
            onPress: () => {
              setRespondingId(message.id);
              cancelDate(matchId, message.id)
                .catch((error) => Alert.alert('Couldn’t cancel the date', friendlyError(error, 'Try again.')))
                .finally(() => {
                  setRespondingId(null);
                  resolve();
                });
            },
          },
        ], { cancelable: true, onDismiss: () => resolve() });
      }),
    [matchId, theirName],
  );

  const respond = useCallback(
    async (message: MatchMessage, status: 'accepted' | 'declined' | 'canceled') => {
      if (status === 'canceled') return cancelPlannedDate(message);
      setRespondingId(message.id);
      try {
        await respondToDate(matchId, message.id, status);
        if (status === 'accepted') {
          router.push({
            pathname: '/dates/its-a-date',
            params: {
              name: theirName,
              venue: message.proposal?.venueName ?? '',
              when: message.proposal?.whenLabel ?? '',
              activity: message.proposal?.activityLabel ?? '',
              conversationId: matchId,
              messageId: message.id,
            },
          });
        }
      } catch (error) {
        Alert.alert('Couldn’t update the plan', friendlyError(error, 'Try again.'));
      } finally {
        setRespondingId(null);
      }
    },
    [matchId, router, theirName, cancelPlannedDate],
  );

  // Follow the conversation only while the reader is at the bottom; someone scrolled up reading
  // history gets a "New messages" pill instead of being yanked down. Only a new message animates.
  const scrolledCountRef = useRef(0);
  const [newBelow, setNewBelow] = useState(false);
  const itemCount = items.length;
  const lastIsMine = messages.length > 0 && messages[messages.length - 1].senderId === userId;
  const scrollToEnd = useCallback(() => {
    const grew = scrolledCountRef.current > 0 && itemCount > scrolledCountRef.current;
    scrolledCountRef.current = itemCount;
    if (nearBottomRef.current || (grew && lastIsMine)) {
      listRef.current?.scrollToEnd({ animated: grew });
    } else if (grew) {
      setNewBelow(true);
    }
  }, [itemCount, lastIsMine]);

  const onListScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const near = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 120;
      nearBottomRef.current = near;
      if (near) setNewBelow(false);
    },
    [],
  );

  const jumpToLatest = () => {
    nearBottomRef.current = true;
    setNewBelow(false);
    listRef.current?.scrollToEnd({ animated: true });
  };

  const theirReadMs = theirLastReadAt?.getTime() ?? 0;
  const dismissNudge = useCallback(() => setNudgeDismissed(true), []);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'nudge') {
        return <NudgeCard onPlan={openPlan} onDismiss={dismissNudge} />;
      }
      if (item.kind === 'separator') {
        return <AppText style={styles.separator}>{item.label}</AppText>;
      }
      const message = item.message;
      const mine = message.senderId === userId;
      // "Sending…" shows on any of my unconfirmed messages; Sent/Seen only on the latest.
      const receipt =
        mine && message.pending && !message.failed
          ? 'Sending…'
          : receiptsOn && message.id === lastMineId
            ? receiptLabel(message, theirReadMs)
            : null;
      return (
        <MessageRow
          matchId={matchId}
          message={message}
          mine={mine}
          myId={userId}
          theirName={theirName}
          receipt={receipt || null}
          responding={respondingId === message.id}
          onRespond={respond}
          onPlan={openPlan}
          onRetry={retryMessage}
        />
      );
    },
    [openPlan, dismissNudge, receiptsOn, lastMineId, userId, theirName, theirReadMs, respondingId, respond, retryMessage, matchId],
  );

  const openChatMenu = () => {
    const blockAndReport = () => confirmBlockAndReport(router, { uid: theirId, name: theirName });
    const reportOnly = () =>
      router.push({
        pathname: '/safety/report',
        params: { userId: theirId, name: theirName, matchId },
      });
    // Android alerts render at most 3 buttons, so the safety actions move to a second step there.
    if (Platform.OS === 'android') {
      Alert.alert(
        theirName,
        undefined,
        [
          { text: 'View profile', onPress: openProfile },
          { text: 'Unmatch', onPress: confirmUnmatch },
          {
            text: 'Block or report…',
            onPress: () =>
              Alert.alert(
                `Block or report ${theirName}?`,
                undefined,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Report only', onPress: reportOnly },
                  { text: 'Block & report', onPress: blockAndReport },
                ],
                { cancelable: true },
              ),
          },
        ],
        { cancelable: true },
      );
      return;
    }
    Alert.alert(theirName, undefined, [
      { text: 'View profile', onPress: openProfile },
      { text: 'Unmatch', style: 'destructive', onPress: confirmUnmatch },
      { text: 'Block & report', style: 'destructive', onPress: blockAndReport },
      { text: 'Report without blocking', onPress: reportOnly },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (matchState !== 'ready' || isBlocked || blockedMe) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <View style={[styles.blockedGate, { paddingTop: insets.top + 24 }]}>
          {matchState === 'loading' ? (
            <ActivityIndicator color={colors.brandBright} />
          ) : (
            <>
              <AppText variant="hero">Chat unavailable</AppText>
              <AppText variant="secondary" style={styles.blockedCopy}>
                {isBlocked
                  ? `You blocked ${theirName}.`
                  : 'This match is no longer available.'}
              </AppText>
              <Button label="Back" onPress={goBack} />
              {isBlocked ? (
                <Button
                  label="Manage blocked users"
                  variant="ghost"
                  onPress={() => router.push('/settings/blocked')}
                />
              ) : null}
            </>
          )}
        </View>
      </Screen>
    );
  }

  const subtitle = match?.nextDate
    ? `It’s a date · ${proposalSummary(match.nextDate)}`
    : 'You matched · plan something';

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={8}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={goBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={rs(26)} color={colors.text} />
          </Pressable>

          <Pressable style={styles.headerWho} onPress={openProfile} accessibilityRole="button">
            {them?.mainPhotoUrl ? (
              <Image source={{ uri: them.mainPhotoUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, styles.headerAvatarEmpty]}>
                <Ionicons name="person" size={rs(18)} color={colors.textSecondary} />
              </View>
            )}
            <View style={styles.headerText}>
              <AppText style={styles.title} numberOfLines={1}>
                {theirName}
              </AppText>
              <AppText style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </AppText>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chat options"
            onPress={openChatMenu}
            style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
          >
            <Ionicons name="ellipsis-horizontal" size={rs(22)} color={colors.text} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plan a date"
            onPress={openPlan}
            style={({ pressed }) => [styles.planBtn, pressed && styles.pressed]}
          >
            <AppText style={styles.planLabel}>Plan ⚡</AppText>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => (item.kind === 'message' ? item.message.id : item.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
          onScroll={onListScroll}
          scrollEventThrottle={64}
          ListHeaderComponent={
            <>
              {match?.priorityLike ? (
                <View style={styles.priorityCard} accessibilityRole="summary">
                  <AppText style={styles.priorityEyebrow}>
                    ⚡ PRIORITY LIKE · {match.priorityLike.fromUid === userId ? 'YOU SENT' : `FROM ${theirName.toUpperCase()}`}
                  </AppText>
                  <AppText style={styles.priorityText}>
                    {match.priorityLike.note
                      ? `“${match.priorityLike.note}”`
                      : match.priorityLike.fromUid === userId
                        ? `You told ${theirName} you want to meet.`
                        : `${theirName} wants to meet you.`}
                  </AppText>
                </View>
              ) : null}
              {showIcebreakers ? (
                <View style={styles.ice}>
                  <AppText style={styles.iceTitle}>
                    YOU MATCHED WITH {theirName.toUpperCase()} · {flowCopy.breakTheIce}
                  </AppText>
                  {openers.map((line) => (
                    <Pressable
                      key={line}
                      onPress={() => void sendBody(line)}
                      style={({ pressed }) => [styles.iceChip, pressed && styles.pressed]}
                    >
                      <AppText style={styles.iceChipText}>{line}</AppText>
                    </Pressable>
                  ))}
                  <Button label="Plan a date instead ⚡" variant="secondary" onPress={openPlan} />
                </View>
              ) : null}
            </>
          }
          renderItem={renderItem}
          initialNumToRender={20}
          windowSize={9}
          ListFooterComponent={
            theyAreTyping ? (
              <View style={styles.typingRow} accessibilityLiveRegion="polite">
                <View style={styles.typingBubble}>
                  <TypingDots size={7} color={colors.textSecondary} />
                </View>
                <AppText style={styles.typingLabel}>{theirName} is typing…</AppText>
              </View>
            ) : null
          }
        />

        {newBelow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Jump to new messages"
            onPress={jumpToLatest}
            style={({ pressed }) => [styles.newBelow, pressed && styles.pressed]}
          >
            <AppText style={styles.newBelowText}>New messages ↓</AppText>
          </Pressable>
        ) : null}

        {messageLocked ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => openUpgrade(router, 'message')}
            style={({ pressed }) => [
              styles.lockedComposer,
              { paddingBottom: Math.max(insets.bottom, 12) },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="sparkles" size={rs(20)} color={colors.brandBright} />
            <View style={styles.flex}>
              <AppText style={styles.lockedTitle}>Message {theirName} with DateToday+</AppText>
              <AppText style={styles.lockedBody}>
                Free includes chatting with 1 person a day — you’ve already started today’s.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={rs(18)} color={colors.brandBright} />
          </Pressable>
        ) : (
          <Composer
            bottomPad={Math.max(insets.bottom, 12)}
            onSend={sendBody}
            onDraftChange={onDraftChange}
            onBlur={stopTyping}
          />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerWho: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card },
  headerAvatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  planBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,58,237,0.28)',
    borderWidth: 1,
    borderColor: colors.brandBright,
  },
  planLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockedGate: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  blockedCopy: { marginBottom: spacing.md },
  pressed: { opacity: 0.8 },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  priorityCard: {
    gap: 4,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: 'rgba(168,85,247,0.1)',
    borderWidth: 1.5,
    borderColor: colors.brandBright,
  },
  priorityEyebrow: { color: '#D8B4FE', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  priorityText: { color: colors.text, fontSize: 15, fontStyle: 'italic', lineHeight: 21 },
  ice: {
    gap: 10,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iceTitle: { color: colors.brandBright, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  iceChip: {
    padding: 12,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iceChipText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  writeOwn: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    paddingVertical: 8,
  },
  nudge: {
    gap: 8,
    padding: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: 'rgba(124,58,237,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    marginVertical: spacing.sm,
  },
  nudgeTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  nudgeBody: { color: colors.textSecondary, fontSize: 14 },
  nudgeCta: { marginTop: 4 },
  proposal: {
    gap: 8,
    padding: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.35)',
    marginVertical: spacing.sm,
    width: '88%',
  },
  proposalMine: { alignSelf: 'flex-end' },
  proposalTheirs: { alignSelf: 'flex-start' },
  proposalEyebrow: { color: colors.live, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  proposalVenue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  proposalMeta: { color: colors.textSecondary, fontSize: 15 },
  proposalDirections: { color: colors.brandBright, fontSize: 14, fontWeight: '800', marginTop: 2 },
  proposalLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: 4 },
  proposalLinkBusy: { opacity: 0.6 },
  proposalActions: { gap: 8, marginTop: 6 },
  proposalStatus: { color: colors.brandBright, fontWeight: '700' },
  proposalDeclined: { color: colors.textSecondary },
  proposalCancel: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.card,
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(124, 58, 237, 0.35)',
    borderColor: colors.brand,
    borderWidth: 1,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
  },
  mineText: { color: colors.text },
  bubbleFailed: { opacity: 0.6 },
  failedLabel: {
    alignSelf: 'flex-end',
    color: '#FF6B6B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    marginRight: 4,
  },
  separator: {
    alignSelf: 'center',
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  newBelow: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 96,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  newBelowText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  receipt: {
    alignSelf: 'flex-end',
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    marginRight: 4,
  },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  typingBubble: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typingLabel: { color: colors.textSecondary, fontSize: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    width: '100%',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: radii.input,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: 13,
    paddingBottom: 13,
    color: colors.text,
    fontSize: 16,
  },
  send: { minHeight: 48, width: 88, flexGrow: 0, flexShrink: 0 },
  lockedComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(168,85,247,0.45)',
    backgroundColor: 'rgba(124,58,237,0.14)',
  },
  lockedTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  lockedBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
