import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { fetchCompatibility, levelName, type Compatibility } from '@/features/compatibility/quiz';
import { useSessionStore } from '@/store/session';
import { ScaledSheet, rs } from '@/lib/scale';

export function percentColor(p: number) {
  if (p >= 80) return colors.live;
  if (p >= 60) return colors.brandBright;
  return colors.warning;
}

/** Quiz match % with another person; nudges toward the quiz when either side hasn't taken it. */
export function CompatibilityCard({ otherUid }: { otherUid: string }) {
  const router = useRouter();
  const myLevel = useSessionStore((s) => s.profile?.quizLevel ?? 0);
  const [result, setResult] = useState<Compatibility | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCompatibility(otherUid)
      .then((r) => alive && setResult(r))
      .catch(() => alive && setResult(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [otherUid, myLevel]);

  const openQuiz = () => router.push('/settings/quiz' as Href);

  if (loading) {
    return (
      <View style={[styles.card, styles.row]}>
        <ActivityIndicator color={colors.brandBright} size="small" />
        <AppText variant="secondary">Checking compatibility…</AppText>
      </View>
    );
  }
  if (!result) return null;

  if (!result.available) {
    if (result.missing === 'them') {
      return (
        <View style={[styles.card, styles.row]}>
          <Ionicons name="help-circle-outline" size={rs(18)} color={colors.textSecondary} />
          <AppText variant="secondary" style={styles.flex}>
            They haven’t taken the compatibility quiz yet.
          </AppText>
        </View>
      );
    }
    return (
      <Pressable onPress={openQuiz} style={({ pressed }) => [styles.card, styles.cta, pressed && styles.pressed]}>
        <Ionicons name="sparkles" size={rs(22)} color={colors.brandBright} />
        <View style={styles.flex}>
          <AppText style={styles.title}>See your match %</AppText>
          <AppText variant="secondary" style={styles.small}>
            Take the 1-minute compatibility quiz — optional.
          </AppText>
        </View>
        <AppText style={styles.link}>Start</AppText>
      </Pressable>
    );
  }

  const canGoDeeper = result.myLevel < result.theirLevel;
  return (
    <View style={[styles.card, styles.match]}>
      <View style={styles.row}>
        <AppText style={[styles.percent, { color: percentColor(result.percent) }]}>{result.percent}%</AppText>
        <View style={styles.flex}>
          <AppText style={styles.title}>{result.headline}</AppText>
          <View style={styles.levelPill}>
            <AppText style={styles.levelText}>{result.levelName} match</AppText>
          </View>
        </View>
      </View>
      {result.summary ? <AppText style={styles.summary}>{result.summary}</AppText> : null}
      {canGoDeeper ? (
        <Pressable onPress={openQuiz} hitSlop={6}>
          <AppText style={styles.link}>
            They went deeper — take {levelName(result.myLevel + 1)} for a more accurate %
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = ScaledSheet.create({
  card: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: colors.brand },
  match: { gap: 10, borderColor: colors.brand },
  pressed: { opacity: 0.8 },
  flex: { flex: 1, gap: 4 },
  percent: { fontSize: 40, fontWeight: '800', letterSpacing: -1, lineHeight: 46 },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  small: { fontSize: 13 },
  summary: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  link: { color: colors.brandBright, fontWeight: '700', fontSize: 13 },
  levelPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(168,85,247,0.16)',
  },
  levelText: { color: colors.brandBright, fontSize: 11, fontWeight: '700' },
});
