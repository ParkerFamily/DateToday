import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, spacing } from '@/constants/theme';
import {
  blockDeviceContacts,
  deviceContactsSupported,
  loadDeviceContacts,
  textInvite,
  type DeviceContact,
} from '@/features/safety/contactBlocks';
import { inviteMessage, inviteSummary } from '@/features/referrals/api';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet, rs } from '@/lib/scale';

export default function ContactsPickerScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const invite = mode === 'invite';
  const [contacts, setContacts] = useState<DeviceContact[] | null>(null);
  const [problem, setProblem] = useState<'denied' | 'unsupported' | 'error' | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [invited, setInvited] = useState<Record<string, true>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!deviceContactsSupported()) {
      setProblem('unsupported');
      return;
    }
    loadDeviceContacts()
      .then((rows) => (rows === 'denied' ? setProblem('denied') : setContacts(rows)))
      .catch(() => setProblem('error'));
    if (invite) void inviteSummary().then((d) => setMessage(inviteMessage(d)), () => undefined);
  }, [invite]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return (contacts ?? []).filter((c) => {
      if (invite && !c.phones.length) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.emails.some((e) => e.toLowerCase().includes(q)) ||
        (digits.length >= 3 && c.phones.some((p) => p.replace(/\D/g, '').includes(digits)))
      );
    });
  }, [contacts, search, invite]);

  const count = Object.keys(selected).length;
  const allShownSelected = list.length > 0 && list.every((c) => selected[c.id]);

  const toggleAll = () =>
    setSelected((prev) => {
      const next = { ...prev };
      list.forEach((c) => (allShownSelected ? delete next[c.id] : (next[c.id] = true)));
      return next;
    });

  const block = async () => {
    setBusy(true);
    try {
      const picked = (contacts ?? []).filter((c) => selected[c.id]);
      const r = await blockDeviceContacts(picked);
      Alert.alert(
        r.added === 1 ? 'Contact blocked' : `${r.added} contacts blocked`,
        'If they’re on DateToday, you won’t see each other.',
      );
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t block', friendlyError(e, 'Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async (c: DeviceContact) => {
    if (!message) return;
    try {
      await textInvite(message, [c.phones[0]]);
    } catch {
      await Share.share({ message }).catch(() => undefined);
    }
    setInvited((prev) => ({ ...prev, [c.id]: true }));
  };

  const onRow = (c: DeviceContact) => {
    if (invite) {
      void sendInvite(c);
      return;
    }
    setSelected((prev) => {
      const next = { ...prev };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = true;
      return next;
    });
  };

  const title = invite ? 'Invite contacts' : 'Block contacts';

  if (problem || !contacts) {
    return (
      <Screen padded={false}>
        <View style={styles.content}>
          <SettingsHeader title={title} />
          {problem === 'denied' ? (
            <View style={styles.message}>
              <AppText variant="secondary">
                DateToday needs access to your contacts to show them here. Your contacts stay on your phone.
              </AppText>
              <Button label="Open Settings" onPress={() => void Linking.openSettings()} />
            </View>
          ) : problem === 'unsupported' ? (
            <AppText variant="secondary" style={styles.message}>
              Picking from your contacts comes with the next app update.
            </AppText>
          ) : problem === 'error' ? (
            <AppText variant="secondary" style={styles.message}>
              Couldn’t read your contacts. Try again in a moment.
            </AppText>
          ) : (
            <View style={styles.busy}>
              <ActivityIndicator color={colors.brandBright} />
            </View>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['top', 'left', 'right', 'bottom']}>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <SettingsHeader title={title} />
            <AppText variant="secondary">
              {invite
                ? 'Tap someone to text them your invite link.'
                : 'Select people you don’t want to see. If they’re on DateToday, you won’t see each other.'}
            </AppText>
            <TextField
              placeholder="Search contacts"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!invite && list.length > 0 ? (
              <Pressable onPress={toggleAll} hitSlop={8} style={styles.selectAll}>
                <AppText color={colors.brandBright}>{allShownSelected ? 'Deselect all' : 'Select all'}</AppText>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <AppText variant="secondary" style={styles.message}>
            {search ? 'No matches.' : invite ? 'No contacts with a phone number.' : 'No contacts found.'}
          </AppText>
        }
        renderItem={({ item: c }) => {
          const on = invite ? Boolean(invited[c.id]) : Boolean(selected[c.id]);
          return (
            <Pressable
              onPress={() => onRow(c)}
              accessibilityRole={invite ? 'button' : 'checkbox'}
              accessibilityState={invite ? undefined : { checked: on }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.avatar}>
                <AppText style={styles.initial}>{c.name.slice(0, 1).toUpperCase()}</AppText>
              </View>
              <View style={styles.flex}>
                <AppText style={styles.name} numberOfLines={1}>
                  {c.name}
                </AppText>
                <AppText variant="secondary" style={styles.detail} numberOfLines={1}>
                  {c.phones[0] ?? c.emails[0]}
                </AppText>
              </View>
              {invite ? (
                <AppText color={on ? colors.textSecondary : colors.brandBright} style={styles.action}>
                  {on ? 'Invited' : 'Invite'}
                </AppText>
              ) : (
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={rs(24)}
                  color={on ? colors.brandBright : colors.textSecondary}
                />
              )}
            </Pressable>
          );
        }}
      />
      {!invite ? (
        <View style={styles.footer}>
          <Button
            label={busy ? 'Blocking…' : count ? `Block ${count} ${count === 1 ? 'contact' : 'contacts'}` : 'Select contacts'}
            disabled={busy || count === 0}
            onPress={() => void block()}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  selectAll: {
    alignSelf: 'flex-end',
  },
  message: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  busy: {
    paddingVertical: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: colors.text,
    fontWeight: '800',
  },
  flex: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontWeight: '700',
  },
  detail: {
    fontSize: 13,
  },
  action: {
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
