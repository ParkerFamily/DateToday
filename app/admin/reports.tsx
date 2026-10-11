import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ConsoleScreen, Empty, ErrorLine, Loading, MONO, NavTile } from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { adminApi, ago, type ReportRow, type ReportStatus } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

const FILTERS: { key: ReportStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'open' },
  { key: 'under_review', label: 'reviewing' },
  { key: 'actioned', label: 'actioned' },
  { key: 'closed', label: 'closed' },
  { key: 'all', label: 'all' },
];

export default function AdminReports() {
  const router = useRouter();
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open');
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (status: ReportStatus | 'all') => {
    setLoading(true);
    try {
      setRows(await adminApi.reports(status));
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load reports.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(filter);
    }, [filter, load]),
  );

  return (
    <ConsoleScreen title="Reports" kicker="owner_console / reports" refreshing={loading} onRefresh={() => void load(filter)}>
      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setRows(null);
                setFilter(f.key);
              }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <AppText style={[styles.chipText, on && { color: colors.background }]}>{f.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? <ErrorLine text={error} /> : null}
      {rows === null && loading ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty text={filter === 'open' ? 'queue is clear' : 'nothing here'} /> : null}
      <View style={{ gap: spacing.sm }}>
        {rows?.map((r) => (
          <NavTile
            key={r.id}
            icon={r.reportedMessage ? 'chatbubble-ellipses' : 'flag'}
            tone={r.status === 'open' ? 'danger' : r.status === 'under_review' ? 'warn' : 'muted'}
            label={`${r.reported.name ?? 'Someone'} · ${r.reason ?? 'report'}`}
            detail={`${r.status} · by ${r.reporter.name ?? 'someone'} · ${ago(r.createdAt)}`}
            onPress={() => router.push(`/admin/report/${r.id}` as Href)}
          />
        ))}
      </View>
    </ConsoleScreen>
  );
}

const styles = ScaledSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.live,
    borderColor: colors.live,
  },
  chipText: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
