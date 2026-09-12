import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { flowCopy, icebreakersFor } from '@/constants/flow';
import { ACTIVITY_EMOJI } from '@/constants/tonightVibe';
import { colors, radii, spacing } from '@/constants/theme';
import type { ChatMessage } from '@/types';
import { useSessionStore } from '@/store/session';
import { blockUser } from '@/features/safety/api';
import { useBlocksStore } from '@/store/blocks';
import { canSendOutgoingMessage, recordOutgoingMessage } from '@/lib/usage/dailyLimits';
import { commerceConfig } from '@/constants/config';
import { isPlusActive } from '@/lib/entitlements';

type ListItem =
  | { kind: 'message'; message: ChatMessage }
  | {
      kind: 'proposal';
      id: string;
      venue: string;
      time: string;
      activity: string;
      food?: string;
      status: 'pending' | 'accepted' | 'declined';
    }
  | { kind: 'nudge'; id: string };

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    conversationId: string;
    name?: string;
    photo?: string;
    food?: string;
    activities?: string;
    icebreakers?: string;
    proposalVenue?: string;
    proposalTime?: string;
    proposalActivity?: string;
  }>();

  const userId = useSessionStore((s) => s.userId) ?? 'local';
  const liveSession = useSessionStore((s) => s.liveSession);
  const entitlements = useSessionStore((s) => s.entitlements);
  const listRef = useRef<FlatList<ListItem>>(null);
  const theirName = params.name ?? 'Match';
  const theirId = String(params.conversationId);
  const isBlocked = useBlocksStore((s) => Boolean(s.byId[theirId]));
  const food = typeof params.food === 'string' ? params.food : '';
  const activities = useMemo(() => {
    if (typeof params.activities === 'string' && params.activities.length) {
      return params.activities.split(',').filter(Boolean);
    }
    return liveSession?.activities ?? ['drinks', 'dinner'];
  }, [params.activities, liveSession?.activities]);

  const vibeLine = activities
    .map((a) => `${ACTIVITY_EMOJI[a] ?? ''} ${a.charAt(0).toUpperCase() + a.slice(1)}`.trim())
    .join(' · ');

  const openers = useMemo(() => icebreakersFor({ food, name: theirName }), [food, theirName]);
  const [showIcebreakers, setShowIcebreakers] = useState(params.icebreakers === '1');
  const [draft, setDraft] = useState('');
  const [sentCount, setSentCount] = useState(0);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const [items, setItems] = useState<ListItem[]>(() => {
    const seed: ListItem[] = [];
    if (params.proposalVenue) {
      seed.push({
        kind: 'proposal',
        id: 'proposal-incoming',
        venue: String(params.proposalVenue),
        time: String(params.proposalTime ?? '8:30'),
        activity: String(params.proposalActivity ?? 'Dinner'),
        food: food || undefined,
        status: 'pending',
      });
    }
    return seed;
  });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/dates');
  };

  const appendMessage = (body: string) => {
    const next: ChatMessage = {
      id: `${Date.now()}`,
      conversationId: String(params.conversationId),
      senderId: userId,
      body,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    };
    setItems((prev) => {
      const list: ListItem[] = [...prev, { kind: 'message', message: next }];
      const nextCount = sentCount + 1;
      if (nextCount >= 3 && !nudgeDismissed && !prev.some((i) => i.kind === 'nudge')) {
        list.push({ kind: 'nudge', id: `nudge-${Date.now()}` });
      }
      return list;
    });
    setSentCount((c) => c + 1);
    setShowIcebreakers(false);
    setDraft('');
  };

  const sendBody = (body: string) => {
    const text = body.trim();
    if (!text) return;
    void (async () => {
      const gate = await canSendOutgoingMessage(entitlements);
      if (!gate.ok) {
        Alert.alert(
          'Daily message limit',
          `Free accounts get ${gate.limit} outgoing messages per day. Unlimited with DateToday+.`,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Get DateToday+', onPress: () => router.push('/paywall') },
          ],
        );
        return;
      }
      if (!isPlusActive(entitlements)) {
        await recordOutgoingMessage();
      }
      appendMessage(text);
    })();
  };

  const send = () => {
    sendBody(draft);
  };

  const openPlan = () => {
    router.push({
      pathname: '/dates/plan',
      params: {
        name: theirName,
        photo: params.photo ?? '',
        food,
        conversationId: String(params.conversationId),
        mode: food ? 'spot' : 'plan',
      },
    });
  };

  const openChatMenu = () => {
    Alert.alert(theirName, 'Chat settings', [
      {
        text: 'Chat & messaging settings',
        onPress: () => router.push('/settings/chat'),
      },
      {
        text: 'Report',
        onPress: () =>
          router.push({
            pathname: '/safety/report',
            params: { userId: theirId, name: theirName },
          }),
      },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            `Block ${theirName}?`,
            'They’ll disappear from Discover, dates, and chat. They won’t be notified.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Block',
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    try {
                      await blockUser(theirId, 'chat_block', theirName);
                      Alert.alert('Blocked', `${theirName} won’t show up again.`, [
                        { text: 'OK', onPress: goBack },
                      ]);
                    } catch (error) {
                      Alert.alert(
                        'Couldn’t block',
                        error instanceof Error ? error.message : 'Try again',
                      );
                    }
                  })();
                },
              },
            ],
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const acceptProposal = (item: Extract<ListItem, { kind: 'proposal' }>) => {
    setItems((prev) =>
      prev.map((row) =>
        row.kind === 'proposal' && row.id === item.id ? { ...row, status: 'accepted' } : row,
      ),
    );
    router.push({
      pathname: '/dates/its-a-date',
      params: {
        name: theirName,
        venue: item.venue,
        time: item.time,
        activity: item.activity,
        conversationId: String(params.conversationId),
      },
    });
  };

  return (
    <Screen padded={false} edges={['left', 'right']}>
      {isBlocked ? (
        <View style={[styles.blockedGate, { paddingTop: insets.top + 24 }]}>
          <AppText variant="hero">Chat unavailable</AppText>
          <AppText variant="secondary" style={styles.blockedCopy}>
            You blocked {theirName}. They won’t appear in discovery or dates.
          </AppText>
          <Button label="Back" onPress={goBack} />
          <Button
            label="Manage blocked users"
            variant="ghost"
            onPress={() => router.push('/settings/blocked')}
          />
        </View>
      ) : (
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
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>

          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <AppText style={styles.title} numberOfLines={1}>
                {theirName}
              </AppText>
              <VerificationTag status="verified" compact />
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <AppText style={styles.liveText}>LIVE</AppText>
              </View>
            </View>
            <AppText style={styles.subtitle} numberOfLines={1}>
              {vibeLine || 'Free tonight'}
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chat settings"
            onPress={openChatMenu}
            style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Make a plan"
            onPress={openPlan}
            style={({ pressed }) => [styles.planBtn, pressed && styles.pressed]}
          >
            <AppText style={styles.planLabel}>Plan ⚡</AppText>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) =>
            item.kind === 'message' ? item.message.id : item.id
          }
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            showIcebreakers ? (
              <View style={styles.ice}>
                <AppText style={styles.iceTitle}>{flowCopy.breakTheIce}</AppText>
                {openers.map((line) => (
                  <Pressable
                    key={line}
                    onPress={() => sendBody(line)}
                    style={({ pressed }) => [styles.iceChip, pressed && styles.pressed]}
                  >
                    <AppText style={styles.iceChipText}>{line}</AppText>
                  </Pressable>
                ))}
                <Pressable onPress={() => setShowIcebreakers(false)}>
                  <AppText style={styles.writeOwn}>{flowCopy.writeMyOwn}</AppText>
                </Pressable>
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
                  <Pressable
                    onPress={() => {
                      setNudgeDismissed(true);
                      setItems((prev) => prev.filter((i) => i.kind !== 'nudge'));
                    }}
                  >
                    <AppText style={styles.writeOwn}>Not yet</AppText>
                  </Pressable>
                </View>
              );
            }
            if (item.kind === 'proposal') {
              return (
                <View style={styles.proposal}>
                  <AppText style={styles.proposalEyebrow}>{flowCopy.dateProposal}</AppText>
                  <AppText style={styles.proposalVenue}>
                    {item.food ? `${ACTIVITY_EMOJI.dinner ?? '🍽'} ` : ''}
                    {item.venue}
                  </AppText>
                  <AppText style={styles.proposalMeta}>
                    🕣 {item.time} PM · {item.activity}
                  </AppText>
                  {item.status === 'pending' ? (
                    <View style={styles.proposalActions}>
                      <Button
                        label={flowCopy.accept}
                        onPress={() => acceptProposal(item)}
                        style={styles.proposalBtn}
                      />
                      <Button
                        label={flowCopy.change}
                        variant="secondary"
                        onPress={openPlan}
                        style={styles.proposalBtn}
                      />
                      <Button
                        label={flowCopy.decline}
                        variant="ghost"
                        onPress={() =>
                          setItems((prev) =>
                            prev.map((row) =>
                              row.kind === 'proposal' && row.id === item.id
                                ? { ...row, status: 'declined' }
                                : row,
                            ),
                          )
                        }
                      />
                    </View>
                  ) : (
                    <AppText style={styles.proposalStatus}>
                      {item.status === 'accepted' ? 'Accepted ⚡' : 'Declined'}
                    </AppText>
                  )}
                </View>
              );
            }

            const mine = item.message.senderId === userId;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <AppText style={mine ? styles.mineText : undefined}>{item.message.body}</AppText>
              </View>
            );
          }}
        />

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Button label="Send" onPress={send} style={styles.send} />
        </View>
      </KeyboardAvoidingView>
      )}
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
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    maxWidth: '55%',
  },
  verified: {
    color: colors.live,
    fontWeight: '800',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(34,229,139,0.14)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  liveText: {
    color: colors.live,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
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
  planLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
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
  blockedCopy: {
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.8 },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    flexGrow: 1,
  },
  ice: {
    gap: 10,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iceTitle: {
    color: colors.brandBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  iceChip: {
    padding: 12,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iceChipText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
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
  nudgeTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  nudgeBody: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  nudgeCta: {
    marginTop: 4,
  },
  proposal: {
    gap: 8,
    padding: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.35)',
    marginVertical: spacing.sm,
  },
  proposalEyebrow: {
    color: colors.live,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  proposalVenue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  proposalMeta: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  proposalActions: {
    gap: 8,
    marginTop: 6,
  },
  proposalBtn: {
    alignSelf: 'stretch',
  },
  proposalStatus: {
    color: colors.brandBright,
    fontWeight: '700',
  },
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
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderRadius: radii.input,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  send: {
    minHeight: 48,
    width: 88,
    flexGrow: 0,
    flexShrink: 0,
  },
});
