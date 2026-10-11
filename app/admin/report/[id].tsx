import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  ActionButton,
  ConsoleInput,
  ConsoleScreen,
  ErrorLine,
  KV,
  Loading,
  MONO,
  NavTile,
  Panel,
  Pill,
  notify,
} from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { adminApi, stamp, type ReportLine, type ReportRow, type ReportStatus } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

const STATUS_TONE = { open: 'danger', under_review: 'warn', actioned: 'live', closed: 'muted' } as const;

function lineText(line: { type: string; text: string | null; gifId?: string | null }) {
  if (line.type === 'gif') return '[gif]';
  if (line.type === 'image') return '[photo]';
  return line.text ?? `[${line.type}]`;
}

export default function AdminReport() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<ReportRow | null>(null);
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<ReportStatus | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await adminApi.report(id);
      setReport(r.report);
      setLines(r.conversation);
      setNote((n) => n || r.report.adminNote || '');
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load this report.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (status: ReportStatus) => {
    if (!report) return;
    setBusy(status);
    try {
      await adminApi.resolveReport(report.id, status, note.trim() || undefined);
      await load();
    } catch (e) {
      notify('Didn’t work', friendlyError(e, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  if (!report) {
    return (
      <ConsoleScreen title="Report" kicker="owner_console / report" refreshing={loading} onRefresh={() => void load()}>
        {error ? <ErrorLine text={error} /> : <Loading />}
      </ConsoleScreen>
    );
  }

  return (
    <ConsoleScreen title="Report" kicker="owner_console / report" refreshing={loading} onRefresh={() => void load()}>
      <Panel title="Case" right={<Pill label={report.status.replace('_', ' ')} tone={STATUS_TONE[report.status]} />}>
        <KV k="reason" v={report.reason ?? '—'} tone="danger" />
        <KV k="type" v={report.contentType ?? 'profile'} />
        <KV k="filed" v={stamp(report.createdAt)} />
        {report.details ? <AppText style={styles.details}>{report.details}</AppText> : null}
      </Panel>

      <View style={{ gap: spacing.sm }}>
        {report.reported.uid ? (
          <NavTile
            icon="person"
            tone="danger"
            label={`Reported: ${report.reported.name ?? 'Unknown'}`}
            detail="open account · ban · sign out"
            onPress={() => router.push(`/admin/user/${report.reported.uid}` as Href)}
          />
        ) : null}
        {report.reporter.uid ? (
          <NavTile
            icon="person-outline"
            tone="muted"
            label={`Reporter: ${report.reporter.name ?? 'Unknown'}`}
            onPress={() => router.push(`/admin/user/${report.reporter.uid}` as Href)}
          />
        ) : null}
      </View>

      {report.reportedMessage ? (
        <Panel title="Flagged message" style={{ borderColor: colors.danger }}>
          <AppText style={styles.flagged}>{lineText(report.reportedMessage)}</AppText>
        </Panel>
      ) : null}

      {lines.length ? (
        <Panel title={`Chat evidence (${lines.length})`}>
          {lines.map((l, i) => (
            <View key={`${l.at}-${i}`} style={[styles.line, l.reported && styles.lineFlagged]}>
              <AppText style={[styles.lineFrom, { color: l.mine ? colors.textSecondary : colors.brandBright }]}>
                {l.mine ? 'reporter' : l.from ?? 'them'}
              </AppText>
              <AppText style={styles.lineText}>{lineText(l)}</AppText>
            </View>
          ))}
        </Panel>
      ) : (
        <AppText style={styles.muted}>no chat evidence attached</AppText>
      )}

      <Panel title="Decision">
        <ConsoleInput value={note} onChangeText={setNote} placeholder="note (optional)" multiline maxLength={500} autoCapitalize="sentences" />
        <View style={styles.actions}>
          <ActionButton label="Reviewing" tone="warn" busy={busy === 'under_review'} disabled={Boolean(busy)} onPress={() => void resolve('under_review')} />
          <ActionButton label="Actioned" tone="live" busy={busy === 'actioned'} disabled={Boolean(busy)} onPress={() => void resolve('actioned')} />
          <ActionButton label="Close" tone="muted" busy={busy === 'closed'} disabled={Boolean(busy)} onPress={() => void resolve('closed')} />
          {report.status !== 'open' ? (
            <ActionButton label="Reopen" tone="danger" busy={busy === 'open'} disabled={Boolean(busy)} onPress={() => void resolve('open')} />
          ) : null}
        </View>
      </Panel>
    </ConsoleScreen>
  );
}

const styles = ScaledSheet.create({
  details: {
    color: colors.text,
    lineHeight: 20,
    paddingTop: 4,
  },
  flagged: {
    fontFamily: MONO,
    fontSize: 14,
    color: colors.text,
  },
  line: {
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  lineFlagged: {
    backgroundColor: 'rgba(255, 71, 87, 0.14)',
  },
  lineFrom: {
    fontFamily: MONO,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  lineText: {
    color: colors.text,
  },
  muted: {
    fontFamily: MONO,
    fontSize: 12,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
