import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import type { MatchMessage } from '@/features/matches/api';
import { MESSAGE_REACTIONS, type MessageReaction } from '@/features/matches/reactions';
import { ScaledSheet, rs } from '@/lib/scale';

type Props = {
  message: MatchMessage | null;
  myReaction: MessageReaction | null;
  onReact: (emoji: MessageReaction) => void;
  onReport: () => void;
  onClose: () => void;
};

/** Long-press menu on their message: an emoji row (tap your current one to remove it) and Report. */
export function MessageActions({ message, myReaction, onReact, onReport, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const preview = message?.type === 'gif' ? 'GIF' : (message?.text ?? '').replace(/\s+/g, ' ').trim();

  return (
    <Modal visible={Boolean(message)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        {preview ? (
          <AppText style={styles.preview} numberOfLines={3}>
            {preview}
          </AppText>
        ) : null}
        <View style={styles.reactions} accessibilityRole="menu">
          {MESSAGE_REACTIONS.map((emoji) => {
            const selected = emoji === myReaction;
            return (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={selected ? `Remove ${emoji} reaction` : `React ${emoji}`}
                accessibilityState={{ selected }}
                onPress={() => onReact(emoji)}
                style={({ pressed }) => [styles.emojiBtn, selected && styles.emojiSelected, pressed && styles.pressed]}
              >
                <AppText style={styles.emoji}>{emoji}</AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.menu}>
          <Pressable
            accessibilityRole="button"
            onPress={onReport}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <Ionicons name="flag-outline" size={rs(18)} color={colors.danger} />
            <AppText style={styles.reportText}>Report message</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(5, 3, 7, 0.6)',
  },
  preview: {
    maxWidth: '100%',
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  reactions: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emojiBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiSelected: { backgroundColor: 'rgba(168, 85, 247, 0.3)' },
  emoji: { fontSize: 26, lineHeight: 32 },
  menu: {
    alignSelf: 'stretch',
    borderRadius: radii.card,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  reportText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
