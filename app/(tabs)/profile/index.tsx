import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { QuizPromoCard } from '@/components/profile/QuizPromoCard';
import { vibeLabel } from '@/constants/copy';
import {
  BlockLabel,
  FineTuneCard,
  LiveAtmosphere,
  livePad,
  PlusBadge,
} from '@/components/ui/LiveChrome';
import { colors, spacing } from '@/constants/theme';
import { isPlusActive } from '@/lib/entitlements';
import { syncVerificationStatus } from '@/features/verification/persistVerification';
import { useSessionStore } from '@/store/session';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { useContentLayout } from '@/lib/layout';
import type { ProfileCompletionRequirements } from '@/types';
import { ScaledSheet, rs } from '@/lib/scale';

type ChecklistKey = keyof ProfileCompletionRequirements;

const CHECKLIST: { key: ChecklistKey; label: string; href: string }[] = [
  { key: 'gender', label: 'Add gender', href: '/settings/edit-profile' },
  { key: 'age', label: 'Confirm 18+', href: '/settings/age' },
  { key: 'mainPhoto', label: 'Add photo', href: '/settings/media' },
  { key: 'videos', label: 'Record video prompts', href: '/settings/media' },
  { key: 'preference', label: "Who you're into", href: '/settings/preferences' },
  { key: 'location', label: 'Enable location', href: '/settings/location' },
];

const VERIFY_COPY: Record<string, { label: string; sub: string }> = {
  unverified: { label: 'Verify your ID', sub: 'Get the verified badge · takes 2 min' },
  failed: { label: 'Retry ID verification', sub: 'Last try didn’t go through' },
  pending: { label: 'Verification in review', sub: 'We’ll let you know soon' },
  manual_review: { label: 'Verification in review', sub: 'We’ll let you know soon' },
};

export default function ProfileTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contentWidth, isWide } = useContentLayout();
  const profile = useSessionStore((s) => s.profile);
  const entitlements = useSessionStore((s) => s.entitlements);
  const { percent, requirements, readyForLive } = useProfileCompletion();
  const plus = isPlusActive(entitlements);

  useFocusEffect(
    useCallback(() => {
      void syncVerificationStatus().catch(() => undefined);
    }, []),
  );

  const openSteps = useMemo(
    () => CHECKLIST.filter((step) => !requirements[step.key]),
    [requirements],
  );

  const missingStepsText = useMemo(() => {
    if (openSteps.length === 0) return '';
    if (openSteps.length === 1) return openSteps[0].label;
    if (openSteps.length === 2) return `${openSteps[0].label} and ${openSteps[1].label}`;
    return `${openSteps.length} more steps`;
  }, [openSteps]);

  const verified = profile?.verificationStatus === 'verified';
  const verificationStatus = profile?.verificationStatus ?? 'unverified';
  const name = profile?.displayName ?? 'Your profile';
  const verifyCopy = VERIFY_COPY[verificationStatus] ?? VERIFY_COPY.unverified;
  const showSteps = !readyForLive && openSteps.length > 0;

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <LiveAtmosphere />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          livePad,
          { paddingBottom: Math.max(insets.bottom, 8) + 24 },
          isWide && { width: contentWidth, alignSelf: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          {profile?.mainPhotoUrl ? (
            <Image 
              source={{ uri: profile.mainPhotoUrl }} 
              style={styles.heroImage}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={200}
            />
          ) : (
            <LinearGradient
              colors={['rgba(124,58,237,0.35)', '#0C0C10']}
              style={styles.heroImage}
            >
              <AppText style={styles.heroInitial}>{(name[0] ?? 'Y').toUpperCase()}</AppText>
            </LinearGradient>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(9,9,11,0.4)', '#09090B']}
            locations={[0.25, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <Pressable
            style={styles.editBtn}
            onPress={() => router.push('/settings/media')}
            accessibilityLabel="Edit photo"
          >
            <Ionicons name="camera" size={rs(16)} color={colors.text} />
            <AppText style={styles.editBtnText}>Edit</AppText>
          </Pressable>

          <View style={styles.heroCopy}>
            <AppText style={styles.name} numberOfLines={1}>
              {name}
            </AppText>
            <VerificationTag status={verificationStatus} />
            <View style={styles.hoodRow}>
              <Ionicons name="location-outline" size={rs(14)} color={colors.textSecondary} />
              <AppText style={styles.hood}>
                {profile?.neighborhoodLabel ?? 'Add your neighborhood'}
              </AppText>
            </View>
            <Button
              label="VIEW MY PROFILE →"
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
            <View style={[styles.barFill, { width: `${Math.max(4, percent)}%` }]} />
          </View>
          <AppText style={styles.readyNote}>
            {readyForLive
              ? 'Ready to go live tonight.'
              : openSteps.length > 0
                ? `Missing ${openSteps.length} ${openSteps.length === 1 ? 'step' : 'steps'}: ${openSteps.map(s => s.label).join(', ')}`
                : 'Finish a few steps to go live tonight.'}
          </AppText>
        </View>

        {showSteps || !verified ? (
          <View style={styles.finish}>
            <BlockLabel>COMPLETE YOUR PROFILE</BlockLabel>
            {!verified ? (
              <Pressable
                style={styles.checkRow}
                onPress={() => router.push('/settings/verification')}
                accessibilityRole="button"
              >
                <View style={styles.verifyIcon}>
                  <Ionicons
                    name={verificationStatus === 'pending' || verificationStatus === 'manual_review' ? 'time-outline' : 'shield-checkmark'}
                    size={rs(14)}
                    color={colors.brandBright}
                  />
                </View>
                <View style={styles.verifyCopy}>
                  <AppText style={[styles.checkLabel, styles.verifyLabel]}>{verifyCopy.label}</AppText>
                  <AppText style={styles.verifySub}>{verifyCopy.sub}</AppText>
                </View>
                <AppText style={styles.chevron}>›</AppText>
              </Pressable>
            ) : null}
            {(showSteps ? openSteps : []).slice(0, 4).map((step) => (
              <Pressable
                key={step.key}
                style={styles.checkRow}
                onPress={() => router.push(step.href as never)}
              >
                <View style={styles.checkDot} />
                <AppText style={styles.checkLabel}>{step.label}</AppText>
                <AppText style={styles.chevron}>›</AppText>
              </Pressable>
            ))}
            <Button
              label={showSteps ? 'CONTINUE PROFILE' : 'VERIFY NOW'}
              onPress={() =>
                router.push(
                  ((showSteps ? openSteps[0]?.href : null) ?? '/settings/verification') as never,
                )
              }
              style={{ marginTop: spacing.sm }}
            />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={profile?.bio?.trim() ? 'Edit bio' : 'Add a bio'}
          onPress={() => router.push({ pathname: '/settings/edit-profile', params: { open: 'bio' } })}
          style={({ pressed }) => [styles.bioCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.strengthTop}>
            <AppText style={styles.strengthTitle}>Bio</AppText>
            <AppText style={styles.bioEdit}>{profile?.bio?.trim() ? 'Edit' : 'Add'} ›</AppText>
          </View>
          {vibeLabel(profile?.datingIntention) ? (
            <AppText style={styles.bioVibe}>{vibeLabel(profile?.datingIntention)}</AppText>
          ) : null}
          <AppText
            style={profile?.bio?.trim() ? styles.bioText : styles.bioEmpty}
            numberOfLines={4}
          >
            {profile?.bio?.trim() || 'Write a line or two about you — people read this before they tap ♥.'}
          </AppText>
        </Pressable>

        <QuizPromoCard />

        <View style={styles.block}>
          <BlockLabel>Account</BlockLabel>
          <FineTuneCard
            title="Edit Profile"
            body="Update your photos, bio, and details"
            onPress={() => router.push('/settings/edit-profile')}
          />
          <FineTuneCard
            title="Dating Preferences"
            body="Who you're looking for"
            onPress={() => router.push('/settings/preferences')}
          />
          <FineTuneCard
            title="Verification"
            body={verified ? "You're verified" : 'Build trust and get verified'}
            onPress={() => router.push('/settings/verification')}
          />
          <Pressable style={styles.fineTune} onPress={() => router.push('/paywall')}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.fineTuneTitleRow}>
                <AppText style={styles.fineTuneTitle}>DateToday+</AppText>
                <PlusBadge />
              </View>
              <AppText style={styles.fineTuneBody}>
                {plus ? 'Active on this account' : 'Unlock premium features'}
              </AppText>
            </View>
            <AppText style={styles.chevron}>›</AppText>
          </Pressable>
        </View>

        <View style={styles.block}>
          <BlockLabel>App</BlockLabel>
          <FineTuneCard
            title="Safety & Privacy"
            body="Your safety comes first"
            onPress={() => router.push('/safety')}
          />
          <FineTuneCard
            title="Notifications"
            body="Manage your alerts"
            onPress={() => router.push('/settings/notifications')}
          />
          <FineTuneCard
            title="Settings"
            body="App preferences"
            onPress={() => router.push('/settings')}
          />
        </View>

        <View style={styles.block}>
          <BlockLabel>Support</BlockLabel>
          <FineTuneCard
            title="Help & Support"
            body="Get help or contact us"
            onPress={() => router.push('/legal/guidelines')}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  heroCard: {
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
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
  editBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(9,9,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  editBtnText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  heroCopy: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: 8,
  },
  name: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  hoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hood: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  viewProfile: {
    marginTop: 4,
  },
  strength: {
    gap: 10,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.brandBright,
  },
  readyNote: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  bioCard: {
    gap: 8,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  bioEdit: { color: colors.brandBright, fontWeight: '800', fontSize: 14 },
  bioVibe: { color: colors.brandBright, fontSize: 13, fontWeight: '700' },
  bioText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  bioEmpty: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  finish: {
    gap: 4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  checkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
  },
  verifyIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.16)',
  },
  verifyCopy: {
    flex: 1,
    gap: 2,
  },
  verifyLabel: {
    flex: 0,
  },
  verifySub: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  checkLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  block: {
    gap: 10,
  },
  fineTune: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  fineTuneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fineTuneTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  fineTuneBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 22,
    fontWeight: '300',
  },
});
