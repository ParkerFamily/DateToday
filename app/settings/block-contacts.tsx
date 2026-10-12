import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import {
  blockTypedContact,
  contactBlockSummary,
  deviceContactsSupported,
  removeContactBlocks,
  setMyContactPhone,
  type ContactBlockSummary,
} from '@/features/safety/contactBlocks';
import { friendlyError } from '@/lib/errors';
import { typedContactKey } from '@/lib/contactKey';
import { ScaledSheet, rs } from '@/lib/scale';

const PAGE = 100;

export default function BlockContactsScreen() {
  const router = useRouter();
  const [data, setData] = useState<ContactBlockSummary | null>(null);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const canPick = deviceContactsSupported();

  const load = useCallback(async () => {
    try {
      setData(await contactBlockSummary());
      setError('');
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t load your blocked contacts.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = data?.entries ?? [];
    return q ? all.filter((e) => e.label.toLowerCase().includes(q)) : all;
  }, [data, search]);

  const addTyped = async () => {
    setAdding(true);
    try {
      await blockTypedContact(typed);
      setTyped('');
      await load();
    } catch (e) {
      Alert.alert('Couldn’t block', friendlyError(e, 'Check it and try again.'));
    } finally {
      setAdding(false);
    }
  };

  const remove = (ids: string[], title: string) => {
    Alert.alert(title, 'They may appear in discovery again, and see you, unless something else keeps you apart.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: () => {
          void (async () => {
            setBusyId(ids.length === 1 ? ids[0] : 'all');
            try {
              for (let i = 0; i < ids.length; i += 250) await removeContactBlocks(ids.slice(i, i + 250));
              await load();
            } catch (e) {
              Alert.alert('Couldn’t unblock', friendlyError(e, 'Try again.'));
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const savePhone = async (value: string | null) => {
    setSavingPhone(true);
    try {
      const r = await setMyContactPhone(value);
      setData((d) => (d ? { ...d, phoneLast4: r.phoneLast4 } : d));
      setPhone('');
    } catch (e) {
      Alert.alert('Couldn’t save your number', friendlyError(e, 'Check it and try again.'));
    } finally {
      setSavingPhone(false);
    }
  };

  const total = data?.entries.length ?? 0;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsHeader title="Block contacts" />
        <AppText variant="secondary" style={styles.sub}>
          Choose people you don’t want to see on DateToday. They won’t see you either, and nobody is told.
        </AppText>

        <View style={styles.card}>
          {canPick ? (
            <Button
              label="Choose from contacts"
              onPress={() => router.push('/settings/contacts-picker?mode=block' as Href)}
            />
          ) : Platform.OS !== 'web' ? (
            <View style={styles.notice}>
              <Ionicons name="sparkles-outline" size={rs(18)} color={colors.brandBright} />
              <AppText variant="secondary" style={styles.flex}>
                Picking from your contacts comes with the next app update. Type a number or email for now.
              </AppText>
            </View>
          ) : null}
          <TextField
            placeholder="Phone number or email"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!adding}
            onSubmitEditing={() => typedContactKey(typed) && void addTyped()}
            returnKeyType="done"
          />
          <Button
            label={adding ? 'Blocking…' : 'Block'}
            variant={canPick ? 'secondary' : 'primary'}
            disabled={adding || !typedContactKey(typed)}
            onPress={() => void addTyped()}
          />
        </View>

        <View style={styles.privacy}>
          <Ionicons name="lock-closed-outline" size={rs(16)} color={colors.textSecondary} />
          <AppText variant="secondary" style={[styles.flex, styles.small]}>
            Numbers and emails are turned into a one-way code on your phone. DateToday never uploads your contacts.
          </AppText>
        </View>

        {!data && !error ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.brandBright} />
          </View>
        ) : null}
        {error && !data ? (
          <View style={styles.errorBox}>
            <AppText variant="secondary">{error}</AppText>
            <Button label="Try again" variant="secondary" onPress={() => void load()} />
          </View>
        ) : null}

        {data ? (
          <>
            <AppText variant="label" style={styles.section}>
              YOUR NUMBER (OPTIONAL)
            </AppText>
            <View style={[styles.card, styles.cardPad]}>
              <AppText variant="secondary" style={styles.small}>
                People who block your number won’t see you, and you won’t see them. It’s never shown on your
                profile.
              </AppText>
              {data.phoneLast4 ? (
                <View style={styles.row}>
                  <AppText style={styles.rowLabel}>•••• {data.phoneLast4}</AppText>
                  <Pressable onPress={() => void savePhone(null)} disabled={savingPhone} hitSlop={8}>
                    <AppText color={colors.brandBright}>{savingPhone ? '…' : 'Remove'}</AppText>
                  </Pressable>
                </View>
              ) : (
                <>
                  <TextField
                    placeholder="Your phone number"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    editable={!savingPhone}
                  />
                  <Button
                    label={savingPhone ? 'Saving…' : 'Save number'}
                    variant="secondary"
                    disabled={savingPhone || phone.replace(/\D/g, '').length < 7}
                    onPress={() => void savePhone(phone)}
                  />
                </>
              )}
            </View>

            <View style={styles.listHead}>
              <AppText variant="label" style={styles.sectionInline}>
                BLOCKED CONTACTS · {total}
              </AppText>
              {total > 1 ? (
                <Pressable
                  onPress={() => remove(data.entries.map((e) => e.id), `Unblock all ${total}?`)}
                  disabled={busyId !== null}
                  hitSlop={8}
                >
                  <AppText color={colors.brandBright} style={styles.small}>
                    {busyId === 'all' ? 'Unblocking…' : 'Unblock all'}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            {total > 15 ? (
              <TextField
                placeholder="Search blocked contacts"
                value={search}
                onChangeText={(t) => {
                  setSearch(t);
                  setShown(PAGE);
                }}
                autoCorrect={false}
              />
            ) : null}
            {total === 0 ? (
              <AppText variant="secondary" style={styles.empty}>
                No one yet. People you add show up here.
              </AppText>
            ) : (
              <View style={[styles.card, entries.length ? null : styles.cardPad]}>
                {entries.length === 0 ? <AppText variant="secondary">No matches.</AppText> : null}
                {entries.slice(0, shown).map((e, i, list) => (
                  <View key={e.id} style={[styles.row, styles.entry, i === list.length - 1 && styles.entryLast]}>
                    <Ionicons name="person-circle-outline" size={rs(26)} color={colors.textSecondary} />
                    <AppText style={[styles.rowLabel, styles.flex]} numberOfLines={1}>
                      {e.label}
                    </AppText>
                    <Pressable
                      onPress={() => remove([e.id], `Unblock ${e.label}?`)}
                      disabled={busyId !== null}
                      hitSlop={8}
                    >
                      <AppText color={colors.brandBright}>{busyId === e.id ? '…' : 'Unblock'}</AppText>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            {entries.length > shown ? (
              <Button label="Show more" variant="ghost" onPress={() => setShown((n) => n + PAGE)} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sub: {
    marginBottom: spacing.xs,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardPad: {
    padding: spacing.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  small: {
    fontSize: 13,
  },
  busy: {
    paddingVertical: spacing.lg,
  },
  errorBox: {
    gap: spacing.md,
  },
  section: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionInline: {
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  entry: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryLast: {
    borderBottomWidth: 0,
  },
  empty: {
    marginBottom: spacing.md,
  },
});
