import React, { useState } from 'react';
import { View } from 'react-native';
import {
  ActionButton,
  ConsoleInput,
  ConsoleScreen,
  KV,
  MONO,
  Panel,
  confirmAction,
  notify,
} from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { adminApi, type BroadcastResult } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

export default function AdminBroadcast() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/(tabs)/live');
  const [preview, setPreview] = useState<BroadcastResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);

  const input = { title: title.trim(), body: body.trim(), url: url.trim() || '/(tabs)/live' };
  const ready = Boolean(input.title && input.body);

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPreview(null);
  };

  const dryRun = async () => {
    setBusy('preview');
    try {
      setPreview(await adminApi.broadcast({ ...input, send: false }));
    } catch (e) {
      notify('Didn’t work', friendlyError(e, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!preview) return;
    const ok = await confirmAction(
      'Send broadcast?',
      `"${input.title}" goes to ${preview.willReceive.toLocaleString()} member${preview.willReceive === 1 ? '' : 's'} right now.`,
      'Send',
    );
    if (!ok) return;
    setBusy('send');
    try {
      const r = await adminApi.broadcast({ ...input, send: true });
      notify('Broadcast sent', `Queued for ${r.willReceive.toLocaleString()} member${r.willReceive === 1 ? '' : 's'}.`);
      setTitle('');
      setBody('');
      setPreview(null);
    } catch (e) {
      notify('Didn’t work', friendlyError(e, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ConsoleScreen title="Broadcast" kicker="owner_console / broadcast">
      <AppText style={styles.note}>
        Goes only to members who turned on promotions, max one every few days each. Preview first to see the reach.
      </AppText>
      <Panel title="Message">
        <ConsoleInput value={title} onChangeText={edit(setTitle)} placeholder="title" maxLength={65} autoCapitalize="sentences" />
        <ConsoleInput
          value={body}
          onChangeText={edit(setBody)}
          placeholder="message"
          maxLength={178}
          multiline
          autoCapitalize="sentences"
        />
        <ConsoleInput value={url} onChangeText={edit(setUrl)} placeholder="/(tabs)/live" maxLength={200} />
        <AppText style={styles.count}>{`${body.length}/178`}</AppText>
      </Panel>

      {ready ? (
        <Panel title="Lock screen preview">
          <View style={styles.push}>
            <AppText style={styles.pushApp}>DATETODAY · now</AppText>
            <AppText style={styles.pushTitle}>{input.title}</AppText>
            <AppText style={styles.pushBody} numberOfLines={4}>
              {input.body}
            </AppText>
          </View>
        </Panel>
      ) : null}

      {preview ? (
        <Panel title="Reach">
          <KV k="opted in" v={preview.optedIn.toLocaleString()} />
          <KV k="capped (recent promo)" v={preview.capped.toLocaleString()} tone="muted" />
          <KV k="no device" v={preview.noDevice.toLocaleString()} tone="muted" />
          <KV k="will receive" v={preview.willReceive.toLocaleString()} tone="live" />
        </Panel>
      ) : null}

      <View style={styles.actions}>
        <ActionButton label="Preview reach" icon="eye" busy={busy === 'preview'} disabled={!ready || Boolean(busy)} onPress={() => void dryRun()} />
        <ActionButton
          label="Send"
          icon="megaphone"
          tone="warn"
          busy={busy === 'send'}
          disabled={!preview || !preview.willReceive || Boolean(busy)}
          onPress={() => void send()}
        />
      </View>
    </ConsoleScreen>
  );
}

const styles = ScaledSheet.create({
  note: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  count: {
    fontFamily: MONO,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  push: {
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.elevated,
    gap: 2,
  },
  pushApp: {
    fontFamily: MONO,
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  pushTitle: {
    fontWeight: '700',
    color: colors.text,
  },
  pushBody: {
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
