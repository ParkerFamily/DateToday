import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { colors, radii, spacing } from '@/constants/theme';
import { isPlusActive } from '@/lib/entitlements';
import { useSessionStore } from '@/store/session';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import type { ProfileCompletionRequirements } from '@/types';

type ChecklistKey = keyof ProfileCompletionRequirements;

const CHECKLIST: { key: ChecklistKey; label: string; href: string }[] = [
  { key: 'gender', label: 'Add gender', href: '/settings/edit-profile' },
  { key: 'age', label: 'Confirm 18+', href: '/settings/age' },
  { key: 'mainPhoto', label: 'Add photo', href: '/settings/media' },
  { key: 'videos', label: 'Record video prompts', href: '/settings/media' },
  { key: 'preference', label: "Who you're into", href: '/settings/preferences' },
  { key: 'location', label: 'Enable location', href: '/settings/location' },
];

function MenuRow({
  label,
  onPress,
  last,
}: {
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={[styles.menuRow, last && styles.menuRowLast]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <AppText style={styles.menuLabel}>{label}</AppText>
      <AppText variant="secondary">›</AppText>
    </Pressable>
  );
}

export default function ProfileTabScreen() {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile);
  const entitlements = useSessionStore((s) => s.entitlements);
  const { percent, requirements, readyForLive } = useProfileCompletion();
  const plus = isPlusActive(entitlements);

  const openSteps = useMemo(
    () => CHECKLIST.filter((step) => !requirements[step.key]),
    [requirements],
  );

  const verified = profile?.verificationStatus === 'verified';
  const verificationStatus = profile?.verificationStatus ?? 'unverified';
  const name = profile?.displayName ?? 'Your profile';

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {profile?.mainPhotoUrl ? (
            <Image source={{ uri: profile.mainPhotoUrl }} style={styles.heroImage} />
          ) : (
            <LinearGradient
              colors={['#1A1228', '#0C0C10']}
              style={styles.heroImage}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
            >
              <AppText style={styles.heroInitial}>
                {(name[0] ?? 'Y').toUpperCase()}
              </AppText>
            </LinearGradient>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(9,9,11,0.55)', colors.background]}
            locations={[0.35, 0.72, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.heroCopy}>
            <AppText style={styles.name}>{name}</AppText>
            <VerificationTag status={verificationStatus} />
            <AppText variant="secondary">
              {profile?.neighborhoodLabel ?? 'Add your neighborhood'}
            </AppText>
            <Button
              label="VIEW MY PROFILE"
              variant="secondary"
              onPress={() => router.push(`/profile/${profile?.userId ?? 'me'}`)}
              style={styles.viewProfile}
            />
          </View>
        </View>

        <View style={styles.strength}>
          <View style={styles.strengthTop}>
            <AppText style={styles.strengthTitle}>Profile strength</AppText>
            <AppText style={styles.strengthPct}>{percent}%</AppText>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${percent}%` }]} />
          </View>
          {plus ? (
            <AppText variant="caption">DateToday+</AppText>
          ) : null}
        </View>

        {!readyForLive && openSteps.length > 0 ? (
          <View style={styles.finish}>
            <AppText style={styles.finishTitle}>Finish your profile</AppText>
            {openSteps.slice(0, 4).map((step) => (
              <Pressable
                key={step.key}
                style={styles.checkRow}
                onPress={() => router.push(step.href as never)}
              >
                <View style={styles.checkDot} />
                <AppText style={styles.checkLabel}>{step.label}</AppText>
                <AppText variant="secondary">›</AppText>
              </Pressable>
            ))}
            <Button
              label="CONTINUE PROFILE"
              onPress={() =>
                router.push((openSteps[0]?.href ?? '/settings/edit-profile') as never)
              }
              style={styles.continueBtn}
            />
          </View>
        ) : (
          <AppText variant="secondary" style={styles.readyNote}>
            Ready to go live tonight.
          </AppText>
        )}

        <View style={styles.menu}>
          <MenuRow
            label="Edit Profile"
            onPress={() => router.push('/settings/edit-profile')}
          />
          <MenuRow
            label={verified ? 'Verification · Verified' : 'Get verified'}
            onPress={() => router.push('/settings/verification')}
          />
          <MenuRow label="Settings" last onPress={() => router.push('/settings')} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    height: 340,
    marginBottom: spacing.lg,
    justifyContent: 'flex-end',
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInitial: {
    color: colors.text,
    fontSize: 72,
    fontWeight: '800',
    opacity: 0.35,
  },
  heroCopy: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 8,
  },
  name: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  viewProfile: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    minWidth: 180,
  },
  strength: {
    paddingHorizontal: spacing.lg,
    gap: 10,
    marginBottom: spacing.lg,
  },
  strengthTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strengthTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  strengthPct: {
    color: colors.brandBright,
    fontWeight: '800',
    fontSize: 16,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.brandBright,
  },
  finish: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.md,
    borderRadius: radii.surface,
    backgroundColor: colors.elevated,
    gap: 4,
  },
  finishTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  checkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
  },
  checkLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  continueBtn: {
    marginTop: spacing.md,
  },
  readyNote: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  menu: {
    marginHorizontal: spacing.lg,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
