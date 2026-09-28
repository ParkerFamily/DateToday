import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useBlocksStore } from '@/store/blocks';
import { usePrivacyControls } from '@/store/privacyControls';
import { canMessageMatch, recordMessagedMatch } from '@/lib/usage/dailyLimits';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { isPlusActive } from '@/lib/entitlements';
import {
  markMatchRead,
  otherUserId,
  proposalSummary,
  respondToDate,
  sendMatchMessage,
  setTyping,
  subscribeMatch,
  subscribeMessages,
  type MatchDoc,
  type MatchMessage,
} from '@/features/matches/api';
import { useTheirChatState } from '@/features/matches/useTheirChatState';
import { TypingDots } from '@/components/chat/TypingDots';
import { dismissNotificationsForMatch, setActiveChat } from '@/features/notifications/push';
import {
  generateClientId,
  logMessageEvent,
  mergeMessages,
  type OptimisticMessage,
  type MessageWithStatus,
} from './message-queue';

type ListItem =
  | { kind: 'message'; message: MessageWithStatus }
  | { kind: 'nudge'; id: string };

function markRead(matchId: string) {
  return markMatchRead(matchId, usePrivacyControls.getState().readReceipts);
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

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ conversationId: string; icebreakers?: string }>();
  const matchId = String(params.conversationId ?? '');

  const userId = useSessionStore((s) => s.userId) ?? '';
  const entitlements = useSessionStore((s) => s.entitlements);
  const listRef = useRef<FlatList<ListItem>>(null);
  const sendingRef = useRef(false);

  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [matchState, setMatchState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [messageLocked, setMessageLocked] = useState(false);
  const focusedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!matchId) return;
      let alive = true;
      void canMessageMatch(entitlements, matchId).then((gate) => {
        if (alive) setMessageLocked(!gate.ok);
      });
      return () => {
        alive = false;
      };
    }, [matchId, entitlements]),
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
    setMessagesLoaded(false);
    const unsubMatch = subscribeMatch(
      matchId,
      (m) => {
        setMatch(m);
        setMatchState(m ? 'ready' : 'missing');
      },
      (error) => {
        console.error('[DateToday] ChatScreen: match subscription error', error);
        setMatchState('missing');
      },
    );
    const unsubMessages = subscribeMessages(matchId, (msgs) => {
      setMessages(msgs);
      setMessagesLoaded(true);
      
      // Clean up optimistic messages that have been confirmed by server
      const serverIds = new Set(msgs.map(m => m.id));
      setOptimisticMessages((prev) => {
        const cleaned = prev.filter(opt => {
          // Keep if no serverId yet (still sending/failed)
          if (!opt.serverId) return true;
          // Remove if serverId is in the real messages
          return !serverIds.has(opt.serverId);
        });
        if (cleaned.length !== prev.length) {
          logMessageEvent('optimistic_cleanup', {
            before: prev.length,
            after: cleaned.length,
            removed: prev.length - cleaned.length,
          });
        }
        return cleaned;
      });
    }, (error) => {
      console.error('[DateToday] ChatScreen: messages subscription error', error);
      setMessagesLoaded(true);
    });
    return () => {
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
      }
      const sub = AppState.addEventListener('change', (next) => {
        if (next === 'active' && matchId) {
          void markRead(matchId);
          void dismissNotificationsForMatch(matchId);
        }
      });
      return () => {
        focusedRef.current = false;
        setActiveChat(null);
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
    if (myUnread > 0 || lastTheirsAt > 0) void markRead(matchId);
  }, [myUnread, lastTheirsAt, matchId]);

  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].senderId === userId) return messages[i].id;
    }
    return null;
  }, [messages, userId]);

  // Merge optimistic and real messages
  const mergedMessages = useMemo<MessageWithStatus[]>(() => {
    return mergeMessages(messages, optimisticMessages, userId);
  }, [messages, optimisticMessages, userId]);

  const receiptFor = (message: MessageWithStatus) => {
    if (message.isOptimistic && message.status === 'sending') return 'Sending…';
    if (message.isOptimistic && message.status === 'failed') return 'Failed';
    if (!message.createdAt) return 'Sending…';
    if (theirLastReadAt && theirLastReadAt.getTime() >= message.createdAt.getTime()) return 'Seen';
    return 'Sent';
  };

  const openers = useMemo(() => icebreakersFor({ food: '', name: theirName }), [theirName]);
  const showIcebreakers = matchState === 'ready' && messagesLoaded && mergedMessages.length === 0;
  const mySentCount = mergedMessages.filter((m) => m.senderId === userId && m.type === 'text').length;
  const hasProposal = mergedMessages.some((m) => m.type === 'date_proposal');

  const items = useMemo<ListItem[]>(() => {
    const list: ListItem[] = mergedMessages.map((message) => ({ kind: 'message', message }));
    if (mySentCount >= 3 && !hasProposal && !nudgeDismissed) {
      list.push({ kind: 'nudge', id: 'nudge' });
    }
    return list;
  }, [mergedMessages, mySentCount, hasProposal, nudgeDismissed]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/dates');
  };

  const sendBody = (body: string) => {
    // CRITICAL: Capture the exact input value synchronously before any async operations
    const text = body.trim();
    if (!text) return;

    const clientId = generateClientId();
    const timestamp = Date.now();

    logMessageEvent('send_tap', { clientId, textLength: text.length, timestamp });

    // Immediately add optimistic message
    const optimisticMsg: OptimisticMessage = {
      clientId,
      text,
      status: 'sending',
      createdAt: new Date(),
    };

    setOptimisticMessages((prev) => [...prev, optimisticMsg]);
    setDraft('');
    stopTyping();

    logMessageEvent('optimistic_added', { clientId, cleared_draft: true });

    // Send in background without blocking UI
    void (async () => {
      try {
        const gate = await canMessageMatch(entitlements, matchId);
        if (!gate.ok) {
          // Remove optimistic message and restore draft
          setOptimisticMessages((prev) => prev.filter((m) => m.clientId !== clientId));
          setDraft(text);
          setMessageLocked(true);
          openUpgrade(router, 'message');
          logMessageEvent('gate_failed', { clientId });
          return;
        }

        logMessageEvent('backend_write_start', { clientId, timestamp: Date.now() });

        const serverId = await sendMatchMessage(matchId, text);

        logMessageEvent('backend_ack', { clientId, serverId, timestamp: Date.now() });

        // Update optimistic message with server ID
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.clientId === clientId
              ? { ...m, status: 'sent' as const, serverId }
              : m
          )
        );

        if (!isPlusActive(entitlements)) await recordMessagedMatch(matchId);
      } catch (error) {
        logMessageEvent('send_failed', { clientId, error: String(error) });

        // Mark as failed (don't remove - user can retry)
        setOptimisticMessages((prev) =>
          prev.map((m) =>
            m.clientId === clientId
              ? { ...m, status: 'failed' as const, error: friendlyError(error, 'Try again.') }
              : m
          )
        );
      }
    })();
  };

  const openPlan = () => {
    router.push({
      pathname: '/dates/plan',
      params: {
        name: theirName,
        photo: them?.mainPhotoUrl ?? '',
        conversationId: matchId,
        mode: 'plan',
      },
    });
  };

  const openProfile = () => {
    if (!theirId) return;
    router.push({ pathname: '/profile/[userId]', params: { userId: theirId, fromMatch: '1' } });
  };

  const respond = async (message: MessageWithStatus, status: 'accepted' | 'declined') => {
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
          },
        });
      }
    } catch (error) {
      Alert.alert('Couldn’t update the plan', friendlyError(error, 'Try again.'));
    } finally {
      setRespondingId(null);
    }
  };

  const openChatMenu = () => {
    Alert.alert(theirName, undefined, [
      { text: 'View profile', onPress: openProfile },
      {
        text: 'Block & report',
        style: 'destructive',
        onPress: () => confirmBlockAndReport(router, { uid: theirId, name: theirName }),
      },
      {
        text: 'Report without blocking',
        onPress: () =>
          router.push({
            pathname: '/safety/report',
            params: { userId: theirId, name: theirName },
          }),
      },
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
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={goBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>

          <Pressable style={styles.headerWho} onPress={openProfile} accessibilityRole="button">
            {them?.mainPhotoUrl ? (
              <Image source={{ uri: them.mainPhotoUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, styles.headerAvatarEmpty]}>
                <Ionicons name="person" size={18} color={colors.textSecondary} />
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
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
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
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            !messagesLoaded ? (
              <View style={styles.loadingMessages}>
                <ActivityIndicator color={colors.brandBright} />
                <AppText style={styles.loadingText}>Loading messages…</AppText>
              </View>
            ) : showIcebreakers ? (
              <View style={styles.ice}>
                <AppText style={styles.iceTitle}>
                  YOU MATCHED WITH {theirName.toUpperCase()} · {flowCopy.breakTheIce}
                </AppText>
                {openers.map((line) => (
                  <Pressable
                    key={line}
                    onPress={() => sendBody(line)}
                    style={({ pressed }) => [styles.iceChip, pressed && styles.pressed]}
                  >
                    <AppText style={styles.iceChipText}>{line}</AppText>
                  </Pressable>
                ))}
                <Button label="Plan a date instead ⚡" variant="secondary" onPress={openPlan} />
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.kind === 'nudge') {
              return (
                <View style={styles.nudge}>
                  <AppText style={styles.nudgeTitle}>{flowCopy.feelingVibe}</AppText>
                  <AppText style={styles.nudgeBody}>{flowCopy.feelingVibeBody}</AppText>
                  <Button label={flowCopy.makeAPlan} onPress={openPlan} style={styles.nudgeCta} />
                  <Pressable hitSlop={16} onPress={() => setNudgeDismissed(true)}>
                    <AppText style={styles.writeOwn}>Not yet</AppText>
                  </Pressable>
                </View>
              );
            }

            const message = item.message;
            const mine = message.senderId === userId;

            if (message.type === 'date_proposal') {
              const p = message.proposal;
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
                  {typeof p?.venueLat === 'number' && typeof p?.venueLng === 'number' ? (
                    <Pressable
                      hitSlop={8}
                      onPress={() => {
                        const label = encodeURIComponent(p.venueName || 'Date spot');
                        const url =
                          Platform.OS === 'ios'
                            ? `http://maps.apple.com/?ll=${p.venueLat},${p.venueLng}&q=${label}`
                            : `geo:${p.venueLat},${p.venueLng}?q=${p.venueLat},${p.venueLng}(${label})`;
                        void Linking.openURL(url).catch(() =>
                          Linking.openURL(
                            `https://www.google.com/maps/search/?api=1&query=${p.venueLat},${p.venueLng}`,
                          ),
                        );
                      }}
                    >
                      <AppText style={styles.proposalDirections}>Directions ›</AppText>
                    </Pressable>
                  ) : null}
                  {message.status === 'proposed' ? (
                    mine ? (
                      <AppText style={styles.proposalStatus}>Waiting for {theirName}…</AppText>
                    ) : (
                      <View style={styles.proposalActions}>
                        <Button
                          label={flowCopy.accept}
                          loading={respondingId === message.id}
                          onPress={() => void respond(message, 'accepted')}
                        />
                        <Button label="Suggest something else" variant="secondary" onPress={openPlan} />
                        <Button
                          label={flowCopy.decline}
                          variant="ghost"
                          disabled={respondingId === message.id}
                          onPress={() => void respond(message, 'declined')}
                        />
                      </View>
                    )
                  ) : (
                    <AppText
                      style={[
                        styles.proposalStatus,
                        message.status === 'declined' && styles.proposalDeclined,
                      ]}
                    >
                      {message.status === 'accepted' ? 'It’s a date ⚡' : 'Declined'}
                    </AppText>
                  )}
                </View>
              );
            }

            return (
              <View>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <AppText style={mine ? styles.mineText : undefined}>{message.text}</AppText>
                </View>
                {receiptsOn && message.id === lastMineId ? (
                  <AppText style={styles.receipt}>{receiptFor(message)}</AppText>
                ) : null}
              </View>
            );
          }}
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
            <Ionicons name="sparkles" size={20} color={colors.brandBright} />
            <View style={styles.flex}>
              <AppText style={styles.lockedTitle}>Message {theirName} with DateToday+</AppText>
              <AppText style={styles.lockedBody}>
                Free includes chatting with 1 person a day — you’ve already started today’s.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brandBright} />
          </Pressable>
        ) : (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              onDraftChange(text);
            }}
            onBlur={stopTyping}
            placeholder="Message…"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            onSubmitEditing={() => sendBody(draft)}
            returnKeyType="send"
            maxLength={2000}
            multiline
          />
          <Button
            label="Send"
            onPress={() => sendBody(draft)}
            disabled={!draft.trim()}
            style={styles.send}
          />
        </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  loadingMessages: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  pressed: { opacity: 0.8 },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
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
  proposalActions: { gap: 8, marginTop: 6 },
  proposalStatus: { color: colors.brandBright, fontWeight: '700' },
  proposalDeclined: { color: colors.textSecondary },
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
    paddingBottom: spacing.sm,
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
  send: { minHeight: 48, minWidth: 80, paddingHorizontal: 20, flexGrow: 0, flexShrink: 0 },
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
