import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { VerificationTag } from '@/components/ui/VerificationTag';
import {
  BlockLabel,
  FineTuneCard,
  LiveAtmosphere,
  livePad,
  PlusBadge,
} from '@/components/ui/LiveChrome';
import { colors, spacing } from '@/constants/theme';
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

export default function ProfileTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <LiveAtmosphere />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          livePad,
          { paddingBottom: Math.max(insets.bottom, 8) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          {profile?.mainPhotoUrl ? (
            <Image source={{ uri: profile.mainPhotoUrl }} style={styles.heroImage} />
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
            <Ionicons name="camera" size={16} color={colors.text} />
            <AppText style={styles.editBtnText}>Edit</AppText>
          </Pressable>

          <View style={styles.heroCopy}>
            <AppText style={styles.name} numberOfLines={1}>
              {name}
            </AppText>
            <VerificationTag status={verificationStatus} />
            <View style={styles.hoodRow}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
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
              : 'Finish a few steps to go live tonight.'}
          </AppText>
        </View>

        {!readyForLive && openSteps.length > 0 ? (
          <View style={styles.finish}>
            <BlockLabel>Finish profile</BlockLabel>
            {openSteps.slice(0, 4).map((step) => (
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
              label="CONTINUE PROFILE"
              onPress={() =>
                router.push((openSteps[0]?.href ?? '/settings/edit-profile') as never)
              }
              style={{ marginTop: spacing.sm }}
            />
          </View>
        ) : null}

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

const styles = StyleSheet.create({
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
