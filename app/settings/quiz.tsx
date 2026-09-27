import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import {
  MAX_QUIZ_LEVEL,
  QUIZ_LEVELS,
  loadMyQuiz,
  questionsForLevel,
  saveQuiz,
  type QuizAnswers,
} from '@/features/compatibility/quiz';

type Mode = { kind: 'menu' } | { kind: 'questions'; level: number; index: number } | { kind: 'done'; level: number };

export default function CompatibilityQuizScreen() {
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [level, setLevel] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: 'menu' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMyQuiz()
      .then((q) => {
        setAnswers(q.answers);
        setLevel(q.level);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const finishLevel = async (taken: number, next: QuizAnswers) => {
    const newLevel = Math.max(level, taken);
    try {
      setSaving(true);
      await saveQuiz(next, newLevel);
      setLevel(newLevel);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMode({ kind: 'done', level: taken });
    } catch (error) {
      Alert.alert('Quiz didn’t save', friendlyError(error, 'Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const answer = (option: number) => {
    if (mode.kind !== 'questions' || saving) return;
    const questions = questionsForLevel(mode.level);
    const q = questions[mode.index];
    const next = { ...answers, [q.id]: option };
    setAnswers(next);
    void Haptics.selectionAsync();
    if (mode.index + 1 < questions.length) {
      setTimeout(() => setMode({ ...mode, index: mode.index + 1 }), 160);
    } else {
      void finishLevel(mode.level, next);
    }
  };

  if (mode.kind === 'questions') {
    const questions = questionsForLevel(mode.level);
    const q = questions[mode.index];
    const picked = answers[q.id];
    return (
      <Screen padded={false}>
        <View style={styles.content}>
          <SettingsHeader
            title={QUIZ_LEVELS[mode.level - 1].name}
            onBack={() =>
              mode.index > 0 ? setMode({ ...mode, index: mode.index - 1 }) : setMode({ kind: 'menu' })
            }
          />
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((mode.index + 1) / questions.length) * 100}%` }]} />
          </View>
          <AppText variant="secondary" style={styles.counter}>
            {mode.index + 1} of {questions.length}
          </AppText>
          <AppText variant="title" style={styles.question}>
            {q.text}
          </AppText>
          <View style={styles.options}>
            {q.options.map((label, i) => (
              <Pressable
                key={label}
                onPress={() => answer(i)}
                disabled={saving}
                style={({ pressed }) => [
                  styles.option,
                  picked === i && styles.optionOn,
                  pressed && styles.optionPressed,
                ]}
              >
                <AppText style={[styles.optionText, picked === i && styles.optionTextOn]}>{label}</AppText>
                {picked === i ? <Ionicons name="checkmark-circle" size={20} color={colors.brandBright} /> : null}
              </Pressable>
            ))}
          </View>
          {saving ? <ActivityIndicator color={colors.brandBright} style={styles.saving} /> : null}
        </View>
      </Screen>
    );
  }

  if (mode.kind === 'done') {
    const hasNext = mode.level < MAX_QUIZ_LEVEL;
    return (
      <Screen padded={false}>
        <View style={[styles.content, styles.doneWrap]}>
          <Ionicons name="sparkles" size={44} color={colors.brandBright} />
          <AppText variant="hero" style={styles.center}>
            {QUIZ_LEVELS[mode.level - 1].name} done
          </AppText>
          <AppText variant="secondary" style={styles.center}>
            Your match % now shows on the profiles of people who’ve taken the quiz too.
            {hasNext ? ' Go deeper for a more accurate match.' : ' That’s the whole thing — nice.'}
          </AppText>
          <View style={styles.doneButtons}>
            {hasNext ? (
              <Button
                label={`Go deeper · ${QUIZ_LEVELS[mode.level].name}`}
                onPress={() => setMode({ kind: 'questions', level: mode.level + 1, index: 0 })}
              />
            ) : null}
            <Button
              label="Done"
              variant={hasNext ? 'ghost' : 'primary'}
              onPress={() => setMode({ kind: 'menu' })}
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Compatibility quiz" />
        <AppText variant="secondary" style={styles.intro}>
          Optional. Answer a few quick questions and see your match % with anyone who’s taken it too. They see
          your % and a short summary — never your individual answers.
        </AppText>
        {loading ? (
          <ActivityIndicator color={colors.brandBright} />
        ) : (
          QUIZ_LEVELS.map((l) => {
            const done = level >= l.level;
            const locked = l.level > level + 1;
            return (
              <Pressable
                key={l.level}
                disabled={locked}
                onPress={() => setMode({ kind: 'questions', level: l.level, index: 0 })}
                style={({ pressed }) => [
                  styles.levelCard,
                  done && styles.levelDone,
                  locked && styles.levelLocked,
                  pressed && styles.optionPressed,
                ]}
              >
                <View style={styles.levelBadge}>
                  <AppText style={styles.levelNum}>{l.level}</AppText>
                </View>
                <View style={styles.levelText}>
                  <AppText style={styles.levelName}>{l.name}</AppText>
                  <AppText variant="secondary" style={styles.levelBlurb}>
                    {locked ? `Finish ${QUIZ_LEVELS[l.level - 2].name} first` : l.blurb}
                  </AppText>
                </View>
                <AppText style={[styles.levelAction, done && styles.levelActionDone]}>
                  {locked ? '' : done ? 'Done ✓ · Edit' : 'Start'}
                </AppText>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  intro: { marginBottom: spacing.sm, lineHeight: 21 },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  levelDone: { borderColor: colors.brand },
  levelLocked: { opacity: 0.45 },
  levelBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.16)',
  },
  levelNum: { color: colors.brandBright, fontWeight: '800', fontSize: 16 },
  levelText: { flex: 1, gap: 2 },
  levelName: { color: colors.text, fontWeight: '700', fontSize: 16 },
  levelBlurb: { fontSize: 13 },
  levelAction: { color: colors.brandBright, fontWeight: '700', fontSize: 14 },
  levelActionDone: { color: colors.textSecondary },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.brandBright },
  counter: { fontSize: 13 },
  question: { marginTop: spacing.sm, marginBottom: spacing.sm },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionOn: { borderColor: colors.brandBright, backgroundColor: 'rgba(168,85,247,0.12)' },
  optionPressed: { opacity: 0.8 },
  optionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  optionTextOn: { color: colors.brandBright },
  saving: { marginTop: spacing.md },
  doneWrap: { alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  doneButtons: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
});
