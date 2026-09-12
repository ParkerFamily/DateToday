import React, { useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { colors, spacing } from '@/constants/theme';

/**
 * Chat & messaging preferences that DateToday can honor today.
 */
export default function ChatSettingsScreen() {
  const router = useRouter();
  const [messageNotifs, setMessageNotifs] = useState(true);
  const [planNotifs, setPlanNotifs] = useState(true);
  const [readReceipts, setReadReceipts] = useState(false);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Chat & messaging" />
        <AppText variant="secondary" style={styles.sub}>
          Control how chats and plans notify you. Blocking someone removes them from discovery,
          dates, and chat until you unblock.
        </AppText>

        <SettingsGroup title="Notifications">
          <View style={styles.toggleRow}>
            <AppText style={styles.toggleLabel}>Message alerts</AppText>
            <Switch
              value={messageNotifs}
              onValueChange={setMessageNotifs}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
          </View>
          <View style={[styles.toggleRow, styles.toggleLast]}>
            <AppText style={styles.toggleLabel}>Plan updates</AppText>
            <Switch
              value={planNotifs}
              onValueChange={setPlanNotifs}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
          </View>
        </SettingsGroup>

        <SettingsGroup title="Privacy">
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <AppText style={styles.toggleLabel}>Read receipts</AppText>
              <AppText variant="secondary" style={styles.hint}>
                Coming with DateToday+ messaging — preference saved locally for now.
              </AppText>
            </View>
            <Switch
              value={readReceipts}
              onValueChange={setReadReceipts}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
          </View>
          <SettingsRow
            label="Blocked users"
            last
            onPress={() => router.push('/settings/blocked')}
          />
        </SettingsGroup>

        <SettingsGroup title="Safety">
          <SettingsRow label="Report a problem" onPress={() => router.push('/safety/report')} />
          <SettingsRow
            label="Community Guidelines"
            onPress={() => router.push('/legal/guidelines')}
          />
          <SettingsRow
            label="System notification settings"
            last
            onPress={() => void Linking.openSettings()}
          />
        </SettingsGroup>

        <SettingsRow
          label="How blocking works"
          onPress={() =>
            Alert.alert(
              'Blocking',
              'Blocked people are hidden from Discover, your dates list, and chat. They won’t be notified that you blocked them. Unblock anytime in Blocked users.',
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sub: {
    marginBottom: spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  toggleLast: {
    borderBottomWidth: 0,
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
  },
});
