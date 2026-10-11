import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import {
  ConsoleScreen,
  ErrorLine,
  Loading,
  NavTile,
  Panel,
  Stat,
  StatGrid,
  MONO,
} from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { adminApi, ago, type Overview } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

export default function AdminHome() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.overview());
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load stats.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const go = (path: string) => router.push(path as Href);

  return (
    <ConsoleScreen title="Owner console" kicker="datetoday // root" refreshing={loading} onRefresh={() => void load()}>
      {error ? <ErrorLine text={error} /> : null}
      {!data && loading ? <Loading /> : null}
      {data ? (
        <>
          <StatGrid>
            <Stat label="Live now" value={data.liveNow} tone="live" sub="out tonight" />
            <Stat label="Accounts" value={data.accounts.total} sub={`${data.accounts.disabled} banned/disabled`} />
            <Stat label="Signups 24h" value={data.accounts.signups24h} tone="brand" sub={`${data.accounts.signups7d} this week`} />
            <Stat label="Active 24h" value={data.accounts.active24h} sub={`${data.accounts.active7d} this week`} />
            <Stat label="Matches" value={data.matches} sub={`+${data.matches24h} in 24h`} />
            <Stat label="Verified" value={data.verified} tone="live" sub={`${pct(data.verified, data.profiles)} of ${data.profiles} profiles`} />
            <Stat label="Open reports" value={data.openReports} tone={data.openReports ? 'danger' : 'muted'} sub="need a look" />
            <Stat label="Plus on" value={data.plusOn} tone="warn" sub="app entitlements" />
          </StatGrid>
          <AppText style={{ fontFamily: MONO, fontSize: 11, color: colors.textSecondary }}>
            {`synced ${ago(data.at)}${data.accounts.truncated ? ' · account stats capped at 25k' : ''}`}
          </AppText>
        </>
      ) : null}

      <Panel title="Control">
        <View style={{ gap: spacing.sm }}>
          <NavTile icon="people" label="Users" detail="search · ban · verify · delete" onPress={() => go('/admin/users')} />
          <NavTile
            icon="flag"
            label="Reports"
            detail="moderation queue"
            tone="danger"
            badge={data?.openReports}
            onPress={() => go('/admin/reports')}
          />
          <NavTile icon="radio" label="Live now" detail="who’s out tonight" tone="live" onPress={() => go('/admin/live')} />
          <NavTile icon="megaphone" label="Broadcast" detail="push to opted-in members" tone="warn" onPress={() => go('/admin/broadcast')} />
          <NavTile icon="options" label="App controls" detail="free likes · priority likes" onPress={() => go('/admin/controls')} />
          <NavTile icon="terminal" label="Activity log" detail="every admin action" tone="muted" onPress={() => go('/admin/log')} />
        </View>
      </Panel>
    </ConsoleScreen>
  );
}
