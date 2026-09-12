import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import { listBlockedUsers, unblockUser, type BlockedUser } from '@/features/safety/api';
import { useBlocksStore } from '@/store/blocks';

export default function BlockedUsersScreen() {
  const localBlocks = useBlocksStore((s) => s.byId);
  const [rows, setRows] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await listBlockedUsers());
    } catch (error) {
      // Local cache still applies for hide behavior.
      setRows(
        Object.values(useBlocksStore.getState().byId).map((e) => ({
          id: e.blockedId,
          blockedId: e.blockedId,
          displayName: e.displayName ?? null,
          reason: e.reason ?? null,
          createdAt: e.blockedAt,
        })),
      );
      Alert.alert('Couldn’t sync blocks', error instanceof Error ? error.message : 'Showing local list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onUnblock = (blockedId: string) => {
    Alert.alert('Unblock?', 'They may appear in discovery and chat again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: () => {
          void (async () => {
            try {
              setBusyId(blockedId);
              await unblockUser(blockedId);
              setRows((prev) => prev.filter((r) => r.blockedId !== blockedId));
            } catch (error) {
              Alert.alert('Couldn’t unblock', error instanceof Error ? error.message : 'Try again.');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const displayRows =
    rows.length > 0
      ? rows
      : Object.values(localBlocks).map((e) => ({
          id: e.blockedId,
          blockedId: e.blockedId,
          displayName: e.displayName ?? null,
          reason: e.reason ?? null,
          createdAt: e.blockedAt,
        }));

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Blocked users" />
        <AppText variant="secondary">
          Blocked people stay out of discovery, dates, and chat. They are not told you blocked them.
        </AppText>

        {loading ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.brandBright} />
          </View>
        ) : displayRows.length === 0 ? (
          <AppText variant="secondary" style={styles.empty}>
            No blocked users yet.
          </AppText>
        ) : (
          <View style={styles.list}>
            {displayRows.map((row) => (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardText}>
                  <AppText style={styles.id}>{row.displayName || 'Blocked user'}</AppText>
                  <AppText variant="secondary" style={styles.meta}>
                    {row.blockedId}
                  </AppText>
                  {row.reason ? (
                    <AppText variant="secondary">Reason: {row.reason}</AppText>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => onUnblock(row.blockedId)}
                  disabled={busyId === row.blockedId}
                  hitSlop={8}
                >
                  <AppText color={colors.brandBright}>
                    {busyId === row.blockedId ? '…' : 'Unblock'}
                  </AppText>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Button label="Refresh" variant="secondary" onPress={() => void load()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  busy: {
    paddingVertical: spacing.lg,
  },
  empty: {
    marginVertical: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  id: {
    color: colors.text,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
  },
});
