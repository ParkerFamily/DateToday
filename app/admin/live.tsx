import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Avatar, ConsoleScreen, Empty, ErrorLine, Loading, MONO, Pill } from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { adminApi, ago, type LiveRow } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

function left(until: number) {
  const m = Math.max(0, Math.round((until - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
}

export default function AdminLive() {
  const router = useRouter();
  const [rows, setRows] = useState<LiveRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await adminApi.live());
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load Live.'));
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
    <ConsoleScreen title={rows ? `Live · ${rows.length}` : 'Live'} kicker="owner_console / live" refreshing={loading} onRefresh={() => void load()}>
      {error ? <ErrorLine text={error} /> : null}
      {rows === null && loading ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty text="nobody is live right now" /> : null}
      <View style={{ gap: spacing.sm }}>
        {rows?.map((r) => (
          <Pressable
            key={r.uid}
            accessibilityRole="button"
            accessibilityLabel={r.name ?? 'Live member'}
            onPress={() => router.push(`/admin/user/${r.uid}` as Href)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          >
            <View>
              <Avatar uri={r.photo} size={52} />
              <View style={styles.dot} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText style={styles.name} numberOfLines={1}>
                {r.name ?? 'Member'}
                {r.age ? `, ${r.age}` : ''}
              </AppText>
              <AppText style={styles.meta} numberOfLines={1}>
                {r.area ?? 'no area set'}
              </AppText>
              <AppText style={styles.meta} numberOfLines={1}>
                {`started ${ago(r.startedAt)} · ${left(r.until)}`}
              </AppText>
            </View>
            <View style={styles.pills}>
              {r.boosted ? <Pill label="boost" tone="warn" /> : null}
              {r.travel ? <Pill label="travel" tone="brand" /> : null}
              {r.verified ? <Pill label="verified" tone="live" /> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </ConsoleScreen>
  );
}

const styles = ScaledSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.live,
    borderWidth: 2,
    borderColor: colors.card,
  },
  name: {
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontFamily: MONO,
    fontSize: 11,
    color: colors.textSecondary,
  },
  pills: {
    alignItems: 'flex-end',
    gap: 4,
  },
});
