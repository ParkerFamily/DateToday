import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors, radii } from '@/constants/theme';
import { levelName, MAX_QUIZ_LEVEL } from '@/features/compatibility/quiz';
import { useSessionStore } from '@/store/session';
import { ScaledSheet, rs } from '@/lib/scale';

function copyFor(level: number) {
  if (level <= 0) {
    return {
      title: 'What’s your match %?',
      body: 'Take the 1-minute compatibility quiz and see your % with everyone out tonight.',
      cta: 'Take quiz',
    };
  }
  if (level < MAX_QUIZ_LEVEL) {
    return {
      title: `Compatibility · ${levelName(level)} done`,
      body: `Your match % shows on people’s cards. Go ${levelName(level + 1)} for a sharper read.`,
      cta: 'Go deeper',
    };
  }
  return {
    title: 'Compatibility quiz complete',
    body: 'Your most accurate match % shows on every card.',
    cta: 'Answers',
  };
}

/** Surfaces the quiz outside Settings; `hideWhenTaken` keeps busy screens clean once it's done. */
export function QuizPromoCard({ hideWhenTaken = false }: { hideWhenTaken?: boolean }) {
  const router = useRouter();
  const level = useSessionStore((s) => s.profile?.quizLevel ?? 0);
  if (hideWhenTaken && level > 0) return null;
  const { title, body, cta } = copyFor(level);

  return (
    <Pressable
      onPress={() => router.push('/settings/quiz' as Href)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={['rgba(236,72,153,0.32)', 'rgba(124,58,237,0.22)', 'rgba(12,12,16,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.icon}>
          <Ionicons name="heart-circle" size={rs(26)} color="#F9A8D4" />
        </View>
        <View style={styles.copy}>
          <AppText style={styles.title}>{title}</AppText>
          <AppText style={styles.body}>{body}</AppText>
          {level > 0 ? (
            <View style={styles.dots}>
              {Array.from({ length: MAX_QUIZ_LEVEL }, (_, i) => (
                <View key={i} style={[styles.dot, i < level && styles.dotOn]} />
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.cta}>
          <AppText style={styles.ctaText}>{cta}</AppText>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  wrap: {
    borderRadius: radii.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.45)',
  },
  pressed: { opacity: 0.85 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(236,72,153,0.18)',
  },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  dots: { flexDirection: 'row', gap: 4, marginTop: 4 },
  dot: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  dotOn: { backgroundColor: '#F472B6' },
  cta: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radii.pill,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ctaText: { color: colors.white, fontSize: 12, fontWeight: '800' },
});
