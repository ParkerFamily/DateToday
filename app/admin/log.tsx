import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ConsoleScreen, Empty, ErrorLine, Loading, MONO } from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { adminApi, stamp, type LogEntry } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

const TONE: Record<string, string> = {
  ban: colors.danger,
  delete_account: colors.danger,
  unban: colors.live,
  set_verification: colors.live,
  broadcast: colors.warning,
  set_config: colors.warning,
  sign_out_everywhere: colors.warning,
  end_live: colors.warning,
};

function summary(e: LogEntry) {
  const d = e.detail as Record<string, unknown>;
  switch (e.action) {
    case 'ban':
      return d.reason ? `reason: ${String(d.reason)}` : '';
    case 'set_verification':
      return `→ ${String(d.status)}`;
    case 'push_user':
    case 'broadcast':
      return `"${String(d.title ?? '')}"${typeof d.sent === 'number' ? ` · ${d.sent} sent` : ''}`;
    case 'report_status':
      return `→ ${String(d.status)}`;
    case 'set_config':
      return String(d.key ?? '');
    case 'sign_out_everywhere':
      return `${String(d.devices ?? 0)} devices`;
    case 'delete_account':
      return d.email ? String(d.email) : '';
    default:
      return '';
  }
}

export default function AdminLog() {
  const router = useRouter();
  const [rows, setRows] = useState<LogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await adminApi.log());
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load the log.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ConsoleScreen title="Activity log" kicker="owner_console / audit" refreshing={loading} onRefresh={() => void load()}>
      {error ? <ErrorLine text={error} /> : null}
      {rows === null && loading ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty text="no owner actions yet" /> : null}
      <View style={styles.term}>
        {rows?.map((e) => {
          const extra = summary(e);
          const canOpen = Boolean(e.targetUid) && e.action !== 'delete_account';
          return (
            <Pressable
              key={e.id}
              disabled={!canOpen}
              onPress={() => router.push(`/admin/user/${e.targetUid}` as Href)}
              style={({ pressed }) => [styles.line, pressed && { opacity: 0.7 }]}
            >
              <AppText style={styles.time}>{stamp(e.at)}</AppText>
              <AppText style={styles.text}>
                <AppText style={[styles.action, { color: TONE[e.action] ?? colors.brandBright }]}>{e.action}</AppText>
                {e.targetName || e.targetUid ? ` ${e.targetName ?? e.targetUid}` : ''}
                {extra ? <AppText style={styles.extra}>{`  ${extra}`}</AppText> : null}
              </AppText>
              {e.byEmail ? <AppText style={styles.by}>{`by ${e.byEmail}`}</AppText> : null}
            </Pressable>
          );
        })}
      </View>
    </ConsoleScreen>
  );
}

const styles = ScaledSheet.create({
  term: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#050507',
    paddingVertical: spacing.xs,
  },
  line: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#141219',
    gap: 2,
  },
  time: {
    fontFamily: MONO,
    fontSize: 10,
    color: colors.textSecondary,
  },
  text: {
    fontFamily: MONO,
    fontSize: 13,
    color: colors.text,
  },
  action: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '700',
  },
  extra: {
    fontFamily: MONO,
    fontSize: 12,
    color: colors.textSecondary,
  },
  by: {
    fontFamily: MONO,
    fontSize: 10,
    color: colors.textSecondary,
    opacity: 0.7,
  },
});
