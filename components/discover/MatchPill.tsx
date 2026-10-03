import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { percentColor } from '@/components/profile/CompatibilityCard';
import { colors, radii } from '@/constants/theme';
import { cachedCompatibility } from '@/features/compatibility/quiz';
import { useSessionStore } from '@/store/session';
import { ScaledSheet, rs } from '@/lib/scale';

/** Match % on a feed card, or a nudge to take the quiz when they already have. */
export function MatchPill({ otherUid, theirLevel }: { otherUid: string; theirLevel: number }) {
  const router = useRouter();
  const myLevel = useSessionStore((s) => s.profile?.quizLevel ?? 0);
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    if (!theirLevel || !myLevel) return;
    let alive = true;
    cachedCompatibility(otherUid, theirLevel)
      .then((r) => alive && setPercent(r.available ? r.percent : null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [otherUid, theirLevel, myLevel]);

  if (!theirLevel) return null;

  if (!myLevel) {
    return (
      <Pressable
        onPress={() => router.push('/settings/quiz' as Href)}
        hitSlop={6}
        style={[styles.pill, styles.nudge]}
      >
        <Ionicons name="heart-circle" size={rs(14)} color="#F9A8D4" />
        <AppText style={styles.nudgeText}>See your match %</AppText>
      </Pressable>
    );
  }

  if (percent == null) return null;
  const tint = percentColor(percent);
  return (
    <Pressable
      onPress={() => router.push(`/profile/${otherUid}` as Href)}
      hitSlop={6}
      style={[styles.pill, { borderColor: tint }]}
    >
      <Ionicons name="heart-circle" size={rs(14)} color={tint} />
      <AppText style={[styles.text, { color: tint }]}>{percent}% match</AppText>
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(9,9,11,0.6)',
  },
  text: { fontSize: 12, fontWeight: '800' },
  nudge: { borderColor: 'rgba(244,114,182,0.6)' },
  nudgeText: { color: colors.text, fontSize: 12, fontWeight: '700' },
});
