import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { ScaledSheet } from '@/lib/scale';
import {
  PRIORITY_LIKE_DEFAULTS,
  PRIORITY_NOTE_IDEAS,
  loadPriorityLikeConfig,
  priorityNoteProblem,
} from '@/features/matches/priorityLike';

export const PRIORITY = colors.brandBright;
export const PRIORITY_TEXT = '#D8B4FE';

type Props = {
  visible: boolean;
  name: string;
  onClose: () => void;
  /** Resolves on success; throw an Error with a user-facing message to keep the sheet open. */
  onSend: (note: string | null) => Promise<void>;
};

/** Composer for a Priority Like: one optional short note, no back-and-forth before matching. */
export function PriorityLikeSheet({ visible, name, onClose, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  const [maxChars, setMaxChars] = useState(PRIORITY_LIKE_DEFAULTS.noteMaxChars);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNote('');
    setError(null);
    void loadPriorityLikeConfig().then((c) => setMaxChars(c.noteMaxChars));
  }, [visible]);

  const problem = priorityNoteProblem(note, maxChars);
  const length = [...note.trim()].length;

  const send = async () => {
    if (problem || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(note.trim() || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send right now.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + spacing.xl }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>⚡ Priority Like</Text>
          <Text style={styles.title}>Show {name} you want to meet</Text>
          <Text style={styles.body}>
            They’ll see you first, with your note. Chat opens if they like you back.
          </Text>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.replace(/\n/g, ' '))}
            placeholder="Add a short note (optional)"
            placeholderTextColor={colors.textSecondary}
            maxLength={maxChars}
            style={styles.input}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={send}
            accessibilityLabel="Priority Like note"
          />
          <View style={styles.metaRow}>
            <Text style={[styles.meta, problem && styles.metaError]} numberOfLines={2}>
              {problem ?? 'No links, numbers or handles.'}
            </Text>
            <Text style={styles.meta}>
              {length}/{maxChars}
            </Text>
          </View>
          <View style={styles.ideas}>
            {PRIORITY_NOTE_IDEAS.map((idea) => (
              <Pressable
                key={idea}
                onPress={() => setNote(idea)}
                style={({ pressed }) => [styles.idea, pressed && styles.ideaPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.ideaText}>{idea}</Text>
              </Pressable>
            ))}
          </View>
          {error && !problem ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Send Priority Like ⚡" onPress={send} loading={sending} disabled={!!problem} />
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={sending} />
        </View>
      </View>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.elevated,
    borderRadius: radii.surface,
    borderWidth: 1,
    borderColor: PRIORITY,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: PRIORITY,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  eyebrow: { ...typography.label, color: PRIORITY_TEXT },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  meta: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  metaError: { color: colors.danger },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  idea: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  ideaPressed: { borderColor: PRIORITY },
  ideaText: { ...typography.caption, color: colors.text },
  error: { ...typography.caption, color: colors.danger },
});
