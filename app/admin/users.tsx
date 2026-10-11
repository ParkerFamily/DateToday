import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  Avatar,
  ConsoleInput,
  ConsoleScreen,
  Empty,
  ErrorLine,
  Loading,
  MONO,
  Pill,
} from '@/components/admin/ConsoleUI';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { adminApi, ago, type UserRow } from '@/features/admin/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

export default function AdminUsers() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const search = useCallback(async (q: string) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const found = await adminApi.users(q.trim());
      if (id !== seq.current) return;
      setRows(found);
      setError('');
    } catch (e) {
      if (id === seq.current) setError(friendlyError(e, 'Search failed.'));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), query ? 350 : 0);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <ConsoleScreen title="Users" kicker="owner_console / users" refreshing={loading} onRefresh={() => void search(query)}>
      <ConsoleInput
        value={query}
        onChangeText={setQuery}
        placeholder="email, name or uid"
        returnKeyType="search"
        onSubmitEditing={() => void search(query)}
        accessibilityLabel="Search users"
      />
      <AppText style={styles.hint}>{query.trim() ? `results for "${query.trim()}"` : 'newest signups'}</AppText>
      {error ? <ErrorLine text={error} /> : null}
      {rows === null && loading ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty text="no users found" /> : null}
      <View style={{ gap: spacing.sm }}>
        {rows?.map((u) => (
          <Pressable
            key={u.uid}
            accessibilityRole="button"
            accessibilityLabel={u.name ?? u.email ?? 'User'}
            onPress={() => router.push(`/admin/user/${u.uid}` as Href)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
          >
            <Avatar uri={u.photo} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText style={styles.name} numberOfLines={1}>
                {u.name ?? 'No profile'}
                {u.age ? `, ${u.age}` : ''}
              </AppText>
              <AppText style={styles.meta} numberOfLines={1}>
                {u.email ?? 'no email'}
              </AppText>
              <AppText style={styles.meta} numberOfLines={1}>
                {`joined ${ago(u.createdAt)} · seen ${ago(u.lastActiveAt)}`}
              </AppText>
            </View>
            <View style={styles.pills}>
              {u.admin ? <Pill label="owner" tone="brand" /> : null}
              {u.disabled ? <Pill label="banned" tone="danger" /> : null}
              {u.live ? <Pill label="live" tone="live" /> : null}
              {u.verified ? <Pill label="verified" tone="live" /> : null}
              {!u.exists ? <Pill label="no profile" tone="warn" /> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </ConsoleScreen>
  );
}

const styles = ScaledSheet.create({
  hint: {
    fontFamily: MONO,
    fontSize: 11,
    color: colors.textSecondary,
  },
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
