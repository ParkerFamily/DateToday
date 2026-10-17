import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, Share, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import {
  clearPendingInvite,
  inviteMessage,
  inviteSummary,
  pendingInvite,
  redeemInvite,
  type InviteSummary,
} from '@/features/referrals/api';
import { deviceContactsSupported, textInvite } from '@/features/safety/contactBlocks';
import { refreshLikes } from '@/store/matches';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet, rs } from '@/lib/scale';

const STEPS = [
  { icon: 'share-outline', text: 'Share your code or invite link with a friend.' },
  { icon: 'person-add-outline', text: 'They sign up and enter your code in Invite Friends within 2 weeks.' },
  { icon: 'gift-outline', text: 'They get bonus Likes right away, and you unlock rewards as friends join.' },
] as const;

export default function InviteScreen() {
  const router = useRouter();
  const canPickContacts = deviceContactsSupported();
  const [data, setData] = useState<InviteSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await inviteSummary());
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load your invite code.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void pendingInvite().then((saved) => saved && setCode((c) => c || saved));
  }, [load]);

  const share = async () => {
    if (!data) return;
    // Put the link only in the message so iMessage doesn't paste it twice (message + url).
    try {
      await Share.share({ message: inviteMessage(data) });
    } catch {
      // Closing the share sheet isn't an error worth showing.
    }
  };

  const inviteContacts = async () => {
    if (!data) return;
    if (canPickContacts) {
      router.push('/settings/contacts-picker?mode=invite' as Href);
      return;
    }
    try {
      await textInvite(inviteMessage(data));
    } catch {
      await share();
    }
  };

  const copy = async () => {
    if (!data || Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(data.code).catch(() => undefined);
    Alert.alert('Copied', `${data.code} is on your clipboard.`);
  };

  const redeem = async () => {
    setRedeeming(true);
    try {
      const r = await redeemInvite(code);
      await clearPendingInvite();
      void refreshLikes();
      Alert.alert('Invite applied 🎁', `You got ${r.friendLikes} bonus Likes.`);
      setCode('');
      await load();
    } catch (e) {
      Alert.alert('Couldn’t use that code', friendlyError(e, 'Check it and try again.'));
    } finally {
      setRedeeming(false);
    }
  };

  const nextProgress = data?.next ? Math.min(1, data.invited / data.next.at) : 1;

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => void load()} tintColor={colors.brandBright} />}
      >
        <SettingsHeader title="Invite Friends" />
        <AppText variant="secondary" style={styles.sub}>
          Bring friends to DateToday. They get {data?.friendLikes ?? 5} bonus Likes, and you unlock rewards as they join.
        </AppText>

        {!data && loading ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.brandBright} />
          </View>
        ) : null}
        {error && !data ? (
          <View style={styles.errorBox}>
            <AppText variant="secondary">{error}</AppText>
            <Button label="Try again" variant="secondary" onPress={() => void load()} />
          </View>
        ) : null}

        {data ? (
          <>
            <View style={styles.codeCard}>
              <LinearGradient
                colors={['rgba(168,85,247,0.30)', 'rgba(124,58,237,0.06)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.codeGlow}
                pointerEvents="none"
              />
              <AppText style={styles.codeLabel}>YOUR INVITE CODE</AppText>
              <AppText style={styles.code} selectable accessibilityLabel={`Your invite code ${data.code.split('').join(' ')}`}>
                {data.code}
              </AppText>
              <View style={styles.codeActions}>
                <Button label="Share invite" onPress={() => void share()} />
                {Platform.OS !== 'web' ? (
                  <Button
                    label={canPickContacts ? 'Invite contacts' : 'Text a friend'}
                    variant="secondary"
                    onPress={() => void inviteContacts()}
                  />
                ) : null}
                {Platform.OS === 'web' ? (
                  <Button label="Copy code" variant="secondary" onPress={() => void copy()} />
                ) : null}
              </View>
            </View>

            <View style={styles.stats}>
              <View style={styles.stat}>
                <AppText style={styles.statValue}>{data.invited}</AppText>
                <AppText style={styles.statLabel}>{data.invited === 1 ? 'friend joined' : 'friends joined'}</AppText>
              </View>
              <View style={styles.stat}>
                <AppText style={[styles.statValue, { color: colors.brandBright }]}>+{data.rewards.likes}</AppText>
                <AppText style={styles.statLabel}>Likes earned</AppText>
              </View>
              <View style={styles.stat}>
                <AppText style={[styles.statValue, { color: colors.live }]}>+{data.rewards.reveals}</AppText>
                <AppText style={styles.statLabel}>Like Reveals</AppText>
              </View>
            </View>

            <AppText variant="label" style={styles.section}>
              REWARDS
            </AppText>
            <View style={styles.card}>
              {data.next ? (
                <View style={styles.nextBlock}>
                  <AppText style={styles.nextText}>
                    {data.next.left} more {data.next.left === 1 ? 'friend' : 'friends'} to unlock {data.next.label}
                  </AppText>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.round(nextProgress * 100)}%` }]} />
                  </View>
                </View>
              ) : (
                <AppText style={styles.nextText}>You’ve unlocked every reward. Legend. 🏆</AppText>
              )}
              {data.milestones.map((m, i) => (
                <View key={m.at} style={[styles.milestone, i === data.milestones.length - 1 && styles.milestoneLast]}>
                  <View style={[styles.mark, m.reached && styles.markOn]}>
                    {m.reached ? (
                      <Ionicons name="checkmark" size={rs(14)} color={colors.white} />
                    ) : (
                      <AppText style={styles.markText}>{m.at}</AppText>
                    )}
                  </View>
                  <View style={styles.flex}>
                    <AppText style={[styles.milestoneLabel, !m.reached && styles.dim]}>{m.label}</AppText>
                    <AppText variant="secondary" style={styles.milestoneSub}>
                      {m.at === 1 ? '1 friend joins' : `${m.at} friends join`}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>

            {data.canRedeem ? (
              <>
                <AppText variant="label" style={styles.section}>
                  GOT A FRIEND’S CODE?
                </AppText>
                <View style={[styles.card, styles.redeem]}>
                  <TextField
                    placeholder="8-character code"
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={20}
                    editable={!redeeming}
                  />
                  <Button
                    label={redeeming ? 'Applying…' : `Get ${data.friendLikes} bonus Likes`}
                    disabled={redeeming || code.replace(/[^A-Za-z0-9]/g, '').length < 8}
                    onPress={() => void redeem()}
                  />
                </View>
              </>
            ) : data.invitedBy ? (
              <AppText variant="secondary" style={styles.joinedWith}>
                You joined with {data.invitedBy}’s invite.
              </AppText>
            ) : null}

            <AppText variant="label" style={styles.section}>
              HOW IT WORKS
            </AppText>
            <View style={styles.card}>
              {STEPS.map((s, i) => (
                <View key={s.icon} style={[styles.step, i === STEPS.length - 1 && styles.milestoneLast]}>
                  <Ionicons name={s.icon} size={rs(20)} color={colors.brandBright} />
                  <AppText style={styles.stepText}>{s.text}</AppText>
                </View>
              ))}
            </View>
            <AppText variant="secondary" style={styles.note}>
              Rewards are free Likes and Like Reveals. Codes work once per new account and only from a friend’s own
              phone.
            </AppText>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sub: {
    marginBottom: spacing.lg,
  },
  busy: {
    paddingVertical: spacing.xl,
  },
  errorBox: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  codeCard: {
    borderRadius: radii.surface,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  codeGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  codeLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  code: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  codeActions: {
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 2,
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  nextBlock: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  nextText: {
    color: colors.text,
    fontWeight: '700',
    paddingVertical: spacing.xs,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brandBright,
  },
  milestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  milestoneLast: {
    borderBottomWidth: 0,
  },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  markOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brandBright,
  },
  markText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 13,
  },
  milestoneLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  milestoneSub: {
    fontSize: 13,
  },
  dim: {
    color: colors.textSecondary,
  },
  redeem: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  joinedWith: {
    marginTop: spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepText: {
    flex: 1,
    color: colors.text,
  },
  note: {
    fontSize: 13,
    marginTop: spacing.md,
  },
});
