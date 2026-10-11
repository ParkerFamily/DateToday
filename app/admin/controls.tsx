import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import {
  ActionButton,
  ConsoleScreen,
  ErrorLine,
  KV,
  Loading,
  MONO,
  Panel,
  confirmAction,
  notify,
} from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { adminApi, type FreeLikesConfig, type PriorityLikesConfig } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <View style={styles.stepRow}>
      <AppText style={styles.stepLabel}>{label}</AppText>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Less ${label}`} onPress={() => set(value - step)} style={styles.stepBtn} hitSlop={6}>
          <AppText style={styles.stepBtnText}>−</AppText>
        </Pressable>
        <AppText style={styles.stepValue}>{value}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`More ${label}`} onPress={() => set(value + step)} style={styles.stepBtn} hitSlop={6}>
          <AppText style={styles.stepBtnText}>+</AppText>
        </Pressable>
      </View>
    </View>
  );
}

export default function AdminControls() {
  const [saved, setSaved] = useState<FreeLikesConfig | null>(null);
  const [draft, setDraft] = useState<FreeLikesConfig | null>(null);
  const [priority, setPriority] = useState<PriorityLikesConfig | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await adminApi.config();
      setSaved(c.freeLikes);
      setDraft(c.freeLikes);
      setPriority(c.priorityLikes);
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = Boolean(saved && draft && JSON.stringify(saved) !== JSON.stringify(draft));

  const save = async () => {
    if (!draft) return;
    if (saved?.enabled && !draft.enabled) {
      const ok = await confirmAction('Turn off the Like cap?', 'Free members get unlimited Likes until you turn it back on.', 'Turn off');
      if (!ok) return;
    }
    setBusy(true);
    try {
      await adminApi.setFreeLikes(draft);
      await load();
      notify('Saved', 'Live for everyone within a few minutes.');
    } catch (e) {
      notify('Didn’t work', friendlyError(e, 'Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const patch = (p: Partial<FreeLikesConfig>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <ConsoleScreen title="App controls" kicker="owner_console / config" refreshing={loading} onRefresh={() => void load()}>
      {error ? <ErrorLine text={error} /> : null}
      {!draft && loading ? <Loading /> : null}
      {draft ? (
        <Panel title="Free Likes">
          <View style={styles.stepRow}>
            <AppText style={styles.stepLabel}>Like cap for free members</AppText>
            <Switch
              value={draft.enabled}
              onValueChange={(enabled) => patch({ enabled })}
              trackColor={{ true: colors.live, false: colors.border }}
              thumbColor={colors.white}
            />
          </View>
          <Stepper label="Starter Likes" value={draft.starter} min={0} max={1000} step={5} onChange={(starter) => patch({ starter })} />
          <Stepper label="Verified bonus" value={draft.verifiedBonus} min={0} max={100} onChange={(verifiedBonus) => patch({ verifiedBonus })} />
          <Stepper label="Video bonus" value={draft.videoBonus} min={0} max={100} onChange={(videoBonus) => patch({ videoBonus })} />
          <AppText style={styles.note}>
            {draft.enabled
              ? `Free members get ${draft.starter} Likes, +${draft.verifiedBonus} when verified, +${draft.videoBonus} for both videos.`
              : 'Cap is off: free members can Like without limit.'}
          </AppText>
          <View style={styles.actions}>
            <ActionButton label="Save" icon="save" tone="live" busy={busy} disabled={!dirty || busy} onPress={() => void save()} />
            {dirty ? <ActionButton label="Reset" tone="muted" disabled={busy} onPress={() => setDraft(saved)} /> : null}
          </View>
        </Panel>
      ) : null}
      {priority ? (
        <Panel title="Priority Likes (DateToday+, read only)">
          <KV k="enabled" v={priority.enabled ? 'yes' : 'no'} tone={priority.enabled ? 'live' : 'muted'} />
          <KV k="per day" v={priority.dailyLimit} />
          <KV k="note length" v={`${priority.noteMaxChars} chars`} />
        </Panel>
      ) : null}
    </ConsoleScreen>
  );
}

const styles = ScaledSheet.create({
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  stepLabel: {
    flex: 1,
    color: colors.text,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  stepBtnText: {
    fontFamily: MONO,
    fontSize: 18,
    color: colors.live,
  },
  stepValue: {
    minWidth: 44,
    textAlign: 'center',
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  note: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: 4,
  },
});
