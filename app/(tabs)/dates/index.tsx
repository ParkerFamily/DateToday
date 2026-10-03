import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { BlockLabel, LiveAtmosphere, livePad } from '@/components/ui/LiveChrome';
import { Screen } from '@/components/ui/Screen';
import { colors, radii, spacing } from '@/constants/theme';
import { otherUserId, proposalSummary, type MatchDoc } from '@/features/matches/api';
import { LikesStrip } from '@/components/matches/LikesStrip';
import { useMatchesStore, useVisibleMatches } from '@/store/matches';
import { useSessionStore } from '@/store/session';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TypingDots } from '@/components/chat/TypingDots';
import { useTheirChatState } from '@/features/matches/useTheirChatState';
import { ScaledSheet, rs } from '@/lib/scale';

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ uri, size: sizeProp }: { uri: string | null | undefined; size: number }) {
  const size = rs(sizeProp);
  const style = { width: size, height: size, borderRadius: size / 2 };
  return uri ? (
    <Image source={{ uri }} style={[styles.avatar, style]} />
  ) : (
    <View style={[styles.avatar, styles.avatarEmpty, style]}>
      <Ionicons name="person" size={size * 0.45} color={colors.textSecondary} />
    </View>
  );
}

function NewMatchItem({ match, uid, onPress }: { match: MatchDoc; uid: string; onPress: () => void }) {
  const theirId = otherUserId(match, uid);
  const other = match.users[theirId];
  const { typing } = useTheirChatState(match.id, theirId);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.newItem, pressed && styles.pressed]}>
      <View style={styles.newRing}>
        <Avatar uri={other?.mainPhotoUrl} size={68} />
        {typing ? (
          <View style={styles.newTyping}>
            <TypingDots size={5} color="#fff" />
          </View>
        ) : null}
      </View>
      <AppText style={styles.newName} numberOfLines={1}>
        {other?.displayName ?? 'Match'}
      </AppText>
    </Pressable>
  );
}

function TypingLine() {
  return (
    <View style={styles.typingLine}>
      <AppText style={styles.typingText}>typing</AppText>
      <TypingDots size={5} />
    </View>
  );
}

function DateRow({ match, uid, onPress }: { match: MatchDoc; uid: string; onPress: () => void }) {
  const theirId = otherUserId(match, uid);
  const other = match.users[theirId];
  const { typing } = useTheirChatState(match.id, theirId);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dateCard, pressed && styles.pressed]}>
      <Avatar uri={other?.mainPhotoUrl} size={52} />
      <View style={styles.rowBody}>
        <AppText style={styles.dateEyebrow}>IT’S A DATE</AppText>
        <AppText style={styles.rowName}>{other?.displayName ?? 'Match'}</AppText>
        {typing ? (
          <TypingLine />
        ) : (
          <AppText style={styles.dateLine} numberOfLines={2}>
            {proposalSummary(match.nextDate)}
          </AppText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={rs(18)} color={colors.textSecondary} />
    </Pressable>
  );
}

function ThreadRow({ match, uid, onPress }: { match: MatchDoc; uid: string; onPress: () => void }) {
  const theirId = otherUserId(match, uid);
  const other = match.users[theirId];
  const { typing } = useTheirChatState(match.id, theirId);
  const unread = match.unread[uid] ?? 0;
  const mine = match.lastMessage?.senderId === uid;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.thread, pressed && styles.pressed]}>
      <Avatar uri={other?.mainPhotoUrl} size={56} />
      <View style={styles.rowBody}>
        <View style={styles.threadTop}>
          <AppText style={styles.rowName} numberOfLines={1}>
            {other?.displayName ?? 'Match'}
          </AppText>
          <AppText style={styles.time}>{timeAgo(match.lastActivityAt)}</AppText>
        </View>
        <View style={styles.threadTop}>
          {typing ? (
            <View style={styles.flex}>
              <TypingLine />
            </View>
          ) : (
            <AppText style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
              {mine && match.lastMessage?.type === 'text' ? 'You: ' : ''}
              {match.lastMessage?.text}
            </AppText>
          )}
          {unread > 0 ? (
            <View style={styles.unread}>
              <AppText style={styles.unreadText}>{unread > 99 ? '99+' : unread}</AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

type Row =
  | { type: 'section'; key: string; title: string }
  | { type: 'date'; key: string; match: MatchDoc }
  | { type: 'new'; key: string; matches: MatchDoc[] }
  | { type: 'thread'; key: string; match: MatchDoc };

export default function MatchesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = useSessionStore((s) => s.userId) ?? '';
  const loaded = useMatchesStore((s) => s.loaded);
  const error = useMatchesStore((s) => s.error);
  const matches = useVisibleMatches();
  const openChat = (matchId: string) => router.push(`/chat/${matchId}`);

  const rows = useMemo<Row[]>(() => {
    const withDate = matches.filter((m) => m.nextDate);
    const fresh = matches.filter((m) => !m.lastMessage);
    const threads = matches.filter((m) => m.lastMessage);
    const out: Row[] = [];
    if (withDate.length) {
      out.push({ type: 'section', key: 's-dates', title: 'UPCOMING DATES' });
      withDate.forEach((m) => out.push({ type: 'date', key: `d-${m.id}`, match: m }));
    }
    if (fresh.length) {
      out.push({ type: 'section', key: 's-new', title: 'NEW MATCHES' });
      out.push({ type: 'new', key: 'new-row', matches: fresh });
    }
    if (threads.length) {
      out.push({ type: 'section', key: 's-msgs', title: 'MESSAGES' });
      threads.forEach((m) => out.push({ type: 'thread', key: `t-${m.id}`, match: m }));
    }
    return out;
  }, [matches]);

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <LiveAtmosphere />
      <View style={[styles.pad, livePad, { paddingTop: spacing.sm }]}>
        <AppText style={styles.header}>Matches</AppText>
        <AppText style={styles.subheader}>People who liked you back. Chat and plan a date.</AppText>

        <LikesStrip />

        {!loaded ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandBright} />
          </View>
        ) : matches.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 8) + 24, paddingTop: spacing.md }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.panel}>
              <View style={styles.emptyCircle}>
                <Ionicons name="heart-outline" size={rs(28)} color={colors.brandBright} />
              </View>
              <AppText style={styles.emptyTitle}>No matches yet</AppText>
              <AppText style={styles.emptyBody}>
                {error
                  ? 'Couldn’t load your matches. Check your connection.'
                  : 'Go Live and tap Interested on people you like. When they like you back, you’ll match here and can chat and plan a date.'}
              </AppText>
              <Button
                label="GO TO LIVE"
                onPress={() => router.navigate('/(tabs)/live')}
                style={{ marginTop: spacing.sm, alignSelf: 'stretch' }}
              />
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 8) + 24 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: row }) => {
              if (row.type === 'section') return <BlockLabel>{row.title}</BlockLabel>;

              if (row.type === 'new') {
                return (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.newRow}
                  >
                    {row.matches.map((m) => (
                      <NewMatchItem key={m.id} match={m} uid={uid} onPress={() => openChat(m.id)} />
                    ))}
                  </ScrollView>
                );
              }

              const m = row.match;
              if (row.type === 'date') {
                return <DateRow match={m} uid={uid} onPress={() => openChat(m.id)} />;
              }
              return <ThreadRow match={m} uid={uid} onPress={() => openChat(m.id)} />;
            }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  pad: { flex: 1 },
  header: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subheader: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.sm,
    marginTop: 4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  panel: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 10,
    alignItems: 'center',
  },
  emptyCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.1)',
    marginVertical: spacing.sm,
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  avatar: { backgroundColor: colors.card },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  newRow: { gap: 14, paddingVertical: 4, paddingRight: spacing.md },
  newItem: { width: 76, alignItems: 'center', gap: 6 },
  newRing: {
    padding: 2,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.brandBright,
  },
  newName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  newTyping: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.brandBright,
    borderWidth: 2,
    borderColor: colors.background,
  },
  flex: { flex: 1 },
  typingLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typingText: { color: colors.brandBright, fontSize: 14, fontWeight: '700', fontStyle: 'italic' },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: 'rgba(34,229,139,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.35)',
  },
  dateEyebrow: { color: colors.live, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  dateLine: { color: colors.textSecondary, fontSize: 13 },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowName: { color: colors.text, fontSize: 17, fontWeight: '800', flexShrink: 1 },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  threadTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { color: colors.textSecondary, fontSize: 12, marginLeft: 'auto' },
  preview: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  previewUnread: { color: colors.text, fontWeight: '700' },
  unread: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandBright,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
