import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  ActionButton,
  Avatar,
  ConsoleInput,
  ConsoleScreen,
  ErrorLine,
  KV,
  Loading,
  MONO,
  NavTile,
  Panel,
  Pill,
  Stat,
  StatGrid,
  confirmAction,
  notify,
} from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { adminApi, ago, stamp, type UserDetail } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

const PROVIDER: Record<string, string> = {
  'google.com': 'Google',
  'apple.com': 'Apple',
  password: 'Email',
  phone: 'Phone',
};

const ACTION_LABEL: Record<string, string> = {
  ban: 'Banned',
  unban: 'Unbanned',
  sign_out_everywhere: 'Signed out everywhere',
  end_live: 'Ended Live',
  set_verification: 'Verification changed',
  push_user: 'Sent a push',
  report_status: 'Report updated',
};

const words = (value: string | null) => (value ? value.replace(/_/g, ' ') : '—');

export default function AdminUser() {
  const router = useRouter();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      setUser(await adminApi.user(uid));
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load this account.'));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) notify(done);
      await load();
    } catch (e) {
      notify('Didn’t work', friendlyError(e, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  if (!user) {
    return (
      <ConsoleScreen title="Account" kicker="owner_console / user" refreshing={loading} onRefresh={() => void load()}>
        {error ? <ErrorLine text={error} /> : <Loading />}
      </ConsoleScreen>
    );
  }

  const name = user.name ?? 'No profile';
  const banned = user.disabled;
  const verified = user.verificationStatus === 'verified';
  const liveNow = Boolean(user.live?.active);
  const locked = user.admin;

  const ban = async () => {
    const ok = await confirmAction(
      `Ban ${name}?`,
      'Disables the account on every sign-in method, signs out all devices, ends Live and hides them from Nearby.',
      'Ban',
    );
    if (ok) await run('ban', () => adminApi.ban(user.uid, reason.trim()), `${name} is banned.`);
  };

  const signOutEverywhere = async () => {
    const ok = await confirmAction(`Sign ${name} out?`, 'Every device has to sign in again.', 'Sign out');
    if (!ok) return;
    await run('signout', async () => {
      const r = await adminApi.signOut(user.uid);
      notify('Signed out', `${r.devices} device${r.devices === 1 ? '' : 's'} signed out.`);
    });
  };

  const remove = async () => {
    const first = await confirmAction(
      `Delete ${name}?`,
      'Permanently deletes the account, profile, photos, matches and messages. This can’t be undone.',
      'Delete',
    );
    if (!first) return;
    const second = await confirmAction('Are you sure?', `Last check: delete ${user.email ?? name} forever.`, 'Delete forever');
    if (!second) return;
    setBusy('delete');
    try {
      await adminApi.deleteUser(user.uid);
      notify('Account deleted');
      router.back();
    } catch (e) {
      notify('Didn’t work', friendlyError(e, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const sendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      notify('Add a title and a message.');
      return;
    }
    await run(
      'push',
      async () => {
        const r = await adminApi.pushUser(user.uid, pushTitle.trim(), pushBody.trim());
        setPushTitle('');
        setPushBody('');
        notify('Sent', `Delivered to ${r.devices} device${r.devices === 1 ? '' : 's'}.`);
      },
    );
  };

  return (
    <ConsoleScreen title={name} kicker="owner_console / user" refreshing={loading} onRefresh={() => void load()}>
      <Panel>
        <View style={styles.hero}>
          <Avatar uri={user.photos[0] ?? null} size={72} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText style={styles.heroName} numberOfLines={1}>
              {name}
              {user.age ? `, ${user.age}` : ''}
            </AppText>
            <AppText style={styles.mono} numberOfLines={1} selectable>
              {user.email ?? 'no email'}
            </AppText>
            <View style={styles.pills}>
              {locked ? <Pill label="owner" tone="brand" /> : null}
              {banned ? <Pill label="banned" tone="danger" /> : <Pill label="active" tone="live" />}
              {liveNow ? <Pill label="live" tone="live" /> : null}
              <Pill label={user.verificationStatus} tone={verified ? 'live' : user.verificationStatus === 'failed' ? 'danger' : 'muted'} />
            </View>
          </View>
        </View>
        <AppText style={styles.uid} selectable>{`uid ${user.uid}`}</AppText>
      </Panel>

      {user.photos.length || user.videos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {user.photos.map((p) => (
            <Image key={p} source={{ uri: p }} style={styles.photo} contentFit="cover" />
          ))}
          {user.videos.length ? (
            <View style={[styles.photo, styles.videoTile]}>
              <AppText style={styles.mono}>{`${user.videos.length} video${user.videos.length === 1 ? '' : 's'}`}</AppText>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {banned && user.moderation?.reason ? (
        <Panel title="Ban">
          <KV k="reason" v={user.moderation.reason} tone="danger" />
          <KV k="since" v={stamp(user.moderation.bannedAt)} />
        </Panel>
      ) : null}

      {locked ? (
        <Panel title="Controls">
          <AppText style={styles.mono}>Owner accounts can’t be actioned from the console.</AppText>
        </Panel>
      ) : (
        <Panel title="Controls">
          {!banned ? (
            <>
              <ConsoleInput value={reason} onChangeText={setReason} placeholder="ban reason (optional)" maxLength={300} />
              <View style={styles.actions}>
                <ActionButton label="Ban" icon="ban" tone="danger" busy={busy === 'ban'} disabled={Boolean(busy)} onPress={() => void ban()} />
              </View>
            </>
          ) : (
            <View style={styles.actions}>
              <ActionButton
                label="Unban"
                icon="checkmark-circle"
                tone="live"
                busy={busy === 'unban'}
                disabled={Boolean(busy)}
                onPress={() => void run('unban', () => adminApi.unban(user.uid), `${name} can sign in again.`)}
              />
            </View>
          )}
          <View style={styles.actions}>
            <ActionButton
              label="Sign out everywhere"
              icon="log-out"
              tone="warn"
              busy={busy === 'signout'}
              disabled={Boolean(busy)}
              onPress={() => void signOutEverywhere()}
            />
            {liveNow ? (
              <ActionButton
                label="End Live"
                icon="radio"
                tone="warn"
                busy={busy === 'live'}
                disabled={Boolean(busy)}
                onPress={() => void run('live', () => adminApi.endLive(user.uid), 'Live ended.')}
              />
            ) : null}
            {verified ? (
              <ActionButton
                label="Remove verified"
                icon="shield-outline"
                busy={busy === 'verify'}
                disabled={Boolean(busy)}
                onPress={() => void run('verify', () => adminApi.setVerification(user.uid, 'unverified'), 'Verification removed.')}
              />
            ) : (
              <ActionButton
                label="Mark verified"
                icon="shield-checkmark"
                tone="live"
                busy={busy === 'verify'}
                disabled={Boolean(busy)}
                onPress={() => void run('verify', () => adminApi.setVerification(user.uid, 'verified'), `${name} is verified.`)}
              />
            )}
          </View>
        </Panel>
      )}

      {!locked ? (
        <Panel title="Push them" right={<AppText style={styles.mono}>{`${user.pushDevices} device${user.pushDevices === 1 ? '' : 's'}`}</AppText>}>
          <ConsoleInput value={pushTitle} onChangeText={setPushTitle} placeholder="title" maxLength={65} autoCapitalize="sentences" />
          <ConsoleInput
            value={pushBody}
            onChangeText={setPushBody}
            placeholder="message"
            maxLength={178}
            multiline
            autoCapitalize="sentences"
          />
          <View style={styles.actions}>
            <ActionButton
              label="Send push"
              icon="paper-plane"
              tone="brand"
              busy={busy === 'push'}
              disabled={Boolean(busy) || !user.pushDevices}
              onPress={() => void sendPush()}
            />
          </View>
        </Panel>
      ) : null}

      <StatGrid>
        <Stat label="Matches" value={user.counts.matches} tone="brand" />
        <Stat label="Likes sent" value={user.counts.likesSent} />
        <Stat label="Likes got" value={user.counts.likesReceived} />
        <Stat label="Reported" value={user.counts.reportsAgainst} tone={user.counts.reportsAgainst ? 'danger' : 'muted'} sub={`filed ${user.counts.reportsBy}`} />
        <Stat label="Blocked by" value={user.counts.blockedBy} tone={user.counts.blockedBy ? 'warn' : 'muted'} sub={`blocks ${user.counts.blocksBy}`} />
      </StatGrid>

      <Panel title="Account">
        <KV k="sign-in" v={user.providers.map((p) => PROVIDER[p] ?? p).join(', ') || '—'} />
        <KV k="email verified" v={user.emailVerified ? 'yes' : 'no'} tone={user.emailVerified ? 'live' : 'warn'} />
        <KV k="joined" v={stamp(user.createdAt)} />
        <KV k="last sign-in" v={ago(user.lastSignInAt)} />
        <KV k="last active" v={ago(user.lastActiveAt)} />
        <KV k="onboarded" v={user.onboardingComplete ? 'yes' : 'no'} tone={user.onboardingComplete ? 'default' : 'warn'} />
      </Panel>

      <Panel title="Profile">
        <KV k="gender" v={words(user.gender)} />
        <KV k="into" v={words(user.interestedIn)} />
        <KV k="looking for" v={words(user.datingIntention)} />
        <KV k="job" v={user.occupation ?? '—'} />
        {user.bio ? <AppText style={styles.bio}>{user.bio}</AppText> : null}
      </Panel>

      <Panel title="Live">
        {user.live ? (
          <>
            <KV k="status" v={liveNow ? 'live now' : 'off'} tone={liveNow ? 'live' : 'muted'} />
            <KV k="area" v={user.live.area ?? '—'} />
            {liveNow ? <KV k="until" v={stamp(user.live.until)} /> : null}
            {user.live.boosted ? <KV k="boost" v="on" tone="warn" /> : null}
          </>
        ) : (
          <KV k="status" v="never went live" tone="muted" />
        )}
      </Panel>

      <Panel title="DateToday+ (read only)">
        <KV
          k="app store"
          v={user.plus.app ? `${user.plus.app.on ? 'on' : 'off'}${user.plus.app.productId ? ` · ${user.plus.app.productId}` : ''}` : '—'}
          tone={user.plus.app?.on ? 'warn' : 'muted'}
        />
        <KV
          k="web"
          v={user.plus.web ? `${user.plus.web.on ? 'on' : 'off'}${user.plus.web.plan ? ` · ${user.plus.web.plan}` : ''}${user.plus.web.status ? ` · ${user.plus.web.status}` : ''}` : '—'}
          tone={user.plus.web?.on ? 'warn' : 'muted'}
        />
      </Panel>

      <Panel title={`Devices (${user.devices.length})`}>
        {user.devices.length ? (
          user.devices.map((d, i) => (
            <View key={`${d.label}-${i}`} style={styles.device}>
              <View style={{ flex: 1 }}>
                <AppText style={[styles.deviceName, d.signedOut && { color: colors.textSecondary }]} numberOfLines={1}>
                  {d.label}
                </AppText>
                <AppText style={styles.mono} numberOfLines={1}>
                  {`${d.platform} · ${d.place || 'unknown place'} · ${ago(d.lastActiveAt)}`}
                </AppText>
              </View>
              {d.signedOut ? <Pill label="signed out" /> : <Pill label="active" tone="live" />}
            </View>
          ))
        ) : (
          <AppText style={styles.mono}>no tracked devices yet</AppText>
        )}
      </Panel>

      {user.reports.length ? (
        <Panel title={`Reports against (${user.reports.length})`}>
          <View style={{ gap: spacing.sm }}>
            {user.reports.map((r) => (
              <NavTile
                key={r.id}
                icon="flag"
                tone={r.status === 'open' ? 'danger' : 'muted'}
                label={r.reason ?? 'Report'}
                detail={`${r.status} · by ${r.reporter.name ?? 'someone'} · ${ago(r.createdAt)}`}
                onPress={() => router.push(`/admin/report/${r.id}` as Href)}
              />
            ))}
          </View>
        </Panel>
      ) : null}

      {user.log.length ? (
        <Panel title="Owner actions">
          {user.log.map((l, i) => (
            <KV key={`${l.action}-${l.at}-${i}`} k={ago(l.at)} v={ACTION_LABEL[l.action] ?? l.action} />
          ))}
        </Panel>
      ) : null}

      {!locked ? (
        <Panel title="Danger zone" style={{ borderColor: colors.danger }}>
          <AppText style={styles.mono}>Deletes the account and everything in it. No undo.</AppText>
          <View style={styles.actions}>
            <ActionButton
              label="Delete account"
              icon="trash"
              tone="danger"
              busy={busy === 'delete'}
              disabled={Boolean(busy)}
              onPress={() => void remove()}
            />
          </View>
        </Panel>
      ) : null}
    </ConsoleScreen>
  );
}

const styles = ScaledSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  mono: {
    fontFamily: MONO,
    fontSize: 12,
    color: colors.textSecondary,
  },
  uid: {
    fontFamily: MONO,
    fontSize: 11,
    color: colors.textSecondary,
    opacity: 0.7,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  photo: {
    width: 96,
    height: 128,
    borderRadius: radii.input,
    backgroundColor: colors.elevated,
  },
  videoTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bio: {
    color: colors.text,
    lineHeight: 20,
    paddingTop: 4,
  },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  deviceName: {
    color: colors.text,
    fontWeight: '600',
  },
});
