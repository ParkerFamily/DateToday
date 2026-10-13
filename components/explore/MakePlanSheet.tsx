import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { otherUserId } from '@/features/matches/api';
import { useAppWindow } from '@/lib/layout';
import { rs, ScaledSheet } from '@/lib/scale';
import { useBlocksStore } from '@/store/blocks';
import { useMatchesStore } from '@/store/matches';
import { useSessionStore } from '@/store/session';
import type { MatchDoc } from '@/features/matches/api';
import type { LiveMode } from '@/types';
import { repairStorageUrl } from '@/utils/photoUrl';

type Props = {
  visible: boolean;
  onClose: () => void;
  emoji: string;
  title: string;
  subtitle: string | null;
  mode: LiveMode;
  onPickMatch: (match: MatchDoc) => void;
  /** With the mode picked here, which can differ from the screen's when they have both kinds of match. */
  onFind: (forMode: LiveMode) => void;
};

/**
 * "Make this the plan": pick which match it's for, then the regular plan sheet opens prefilled.
 * Only matches of one kind are listed at a time so a date and a Friend Date never get mixed.
 */
export function MakePlanSheet({ visible, onClose, emoji, title, subtitle, mode, onPickMatch, onFind }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useAppWindow();
  const me = useSessionStore((s) => s.userId) ?? '';
  const matches = useMatchesStore((s) => s.matches);
  const blocked = useBlocksStore((s) => s.byId);
  const hidden = useBlocksStore((s) => s.hidden);

  const byMode = useMemo(() => {
    const open = matches.filter((m) => {
      const them = otherUserId(m, me);
      return them && !blocked[them] && !hidden[them];
    });
    const recent = (a: MatchDoc, b: MatchDoc) =>
      (b.lastActivityAt?.getTime() ?? b.createdAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? a.createdAt?.getTime() ?? 0);
    return {
      dating: open.filter((m) => m.mode !== 'friend').sort(recent),
      friend: open.filter((m) => m.mode === 'friend').sort(recent),
    };
  }, [matches, me, blocked, hidden]);

  const [forMode, setForMode] = useState<LiveMode>(mode);
  useEffect(() => {
    if (visible) setForMode(mode);
  }, [visible, mode]);

  // Only ask "who's it for" when there's genuinely a choice.
  const ambiguous = byMode.dating.length > 0 && byMode.friend.length > 0;
  const list = byMode[forMode];
  const friend = forMode === 'friend';
  const accent = friend ? colors.friend : colors.brandBright;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { maxHeight: Math.round(height * 0.82), paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText style={styles.heading}>Make this the plan</AppText>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={rs(22)} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.pick}>
            <View style={styles.pickEmoji}>
              <AppText style={styles.pickEmojiText}>{emoji}</AppText>
            </View>
            <View style={styles.pickText}>
              <AppText style={styles.pickTitle} numberOfLines={2}>
                {title}
              </AppText>
              {subtitle ? (
                <AppText style={styles.pickSub} numberOfLines={1}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          </View>

          {ambiguous ? (
            <View style={styles.askBlock}>
              <AppText style={styles.label}>Who are you making this plan for?</AppText>
              <View style={styles.segment}>
                {(['dating', 'friend'] as const).map((m) => {
                  const on = forMode === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setForMode(m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.segmentOption, on && (m === 'friend' ? styles.segmentFriendOn : styles.segmentOn)]}
                    >
                      <Ionicons
                        name={m === 'friend' ? 'people' : 'heart'}
                        size={rs(14)}
                        color={on ? (m === 'friend' ? colors.friend : colors.brandBright) : colors.textSecondary}
                      />
                      <AppText style={[styles.segmentText, on && styles.segmentTextOn]}>
                        {m === 'friend' ? 'Friend Date' : 'Dating'}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <AppText style={[styles.label, styles.listLabel]}>
            {friend ? 'Send it to a Friend Date match' : 'Send it to a match'}
          </AppText>
          {list.length ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {list.map((m) => {
                const them = m.users[otherUserId(m, me)];
                const photo = repairStorageUrl(them?.mainPhotoUrl ?? null);
                const name = (them?.displayName ?? 'Your match').trim().split(/\s+/)[0];
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => onPickMatch(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`Plan this with ${name}`}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarEmpty]}>
                        <Ionicons name="person" size={rs(18)} color={colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.rowText}>
                      <AppText style={styles.rowName} numberOfLines={1}>
                        {name}
                      </AppText>
                      <AppText style={styles.rowSub} numberOfLines={1}>
                        {m.nextDate ? 'You already have a plan · send a new one' : friend ? 'Friend Date' : 'Matched'}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={rs(18)} color={accent} />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.empty}>
              <AppText style={styles.emptyTitle}>
                {friend ? 'No Friend Date matches yet' : 'No matches to send it to yet'}
              </AppText>
              <AppText style={styles.emptyBody}>Find someone who’s down for this tonight.</AppText>
            </View>
          )}

          <Pressable
            onPress={() => onFind(forMode)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.find, { borderColor: accent }, pressed && styles.pressed]}
          >
            <Ionicons name={friend ? 'people' : 'flash'} size={rs(16)} color={accent} />
            <AppText style={[styles.findText, { color: accent }]}>Find someone for this</AppText>
          </Pressable>
          <AppText style={styles.note}>You’ll review the plan before anything is sent.</AppText>
        </View>
      </View>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5, 3, 7, 0.6)' },
  sheet: {
    borderTopLeftRadius: radii.surface,
    borderTopRightRadius: radii.surface,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    backgroundColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  heading: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickEmoji: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.16)',
  },
  pickEmojiText: { fontSize: 22, lineHeight: 28 },
  pickText: { flex: 1, minWidth: 0, gap: 2 },
  pickTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  pickSub: { color: colors.textSecondary, fontSize: 13 },
  askBlock: { marginTop: 16, gap: 8 },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  listLabel: { marginTop: 16, marginBottom: 6 },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentOption: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentOn: { borderColor: colors.brandBright, backgroundColor: 'rgba(168,85,247,0.14)' },
  segmentFriendOn: { borderColor: colors.friend, backgroundColor: 'rgba(94,234,212,0.1)' },
  segmentText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  segmentTextOn: { color: colors.text },
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: 6, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.border },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: colors.textSecondary, fontSize: 12 },
  empty: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    gap: 2,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyBody: { color: colors.textSecondary, fontSize: 13 },
  find: {
    marginTop: 14,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  findText: { fontSize: 15, fontWeight: '800' },
  note: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
  },
  pressed: { opacity: 0.8 },
});
