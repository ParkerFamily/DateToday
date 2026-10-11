import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { colors, radii, spacing } from '@/constants/theme';
import {
  placeLabel,
  signOutDevice,
  signOutOtherDevices,
  subscribeDevices,
  type SignedInDevice,
} from '@/features/security/devices';
import { useSessionStore } from '@/store/session';
import { isBackendConfigured } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { ScaledSheet } from '@/lib/scale';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function activeLabel(at: number, now: number) {
  if (!at) return '';
  const ago = now - at;
  if (ago < 15 * MINUTE) return 'Active now';
  if (ago < HOUR) return `Active ${Math.floor(ago / MINUTE)} min ago`;
  if (ago < DAY) return `Active ${Math.floor(ago / HOUR)}h ago`;
  if (ago < 30 * DAY) return `Active ${Math.floor(ago / DAY)}d ago`;
  return `Active ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function signedInLabel(at: number) {
  if (!at) return '';
  return `Signed in ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function iconFor(device: SignedInDevice): keyof typeof Ionicons.glyphMap {
  if (device.platform === 'web') return 'globe-outline';
  if (/ipad|tablet|tab /i.test(device.deviceLabel)) return 'tablet-portrait-outline';
  return 'phone-portrait-outline';
}

export default function DevicesScreen() {
  const userId = useSessionStore((s) => s.userId);
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!userId || !isBackendConfigured()) {
      setDevices([]);
      return;
    }
    return subscribeDevices(
      userId,
      (next) => {
        setFailed(false);
        setDevices(next);
        setNow(Date.now());
      },
      () => setFailed(true),
    );
  }, [userId]);

  const others = (devices ?? []).filter((d) => !d.current);

  const confirmSignOut = (device: SignedInDevice) => {
    Alert.alert(`Sign out ${device.deviceLabel}?`, 'It will need to sign in again to use your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(device.id);
            try {
              await signOutDevice(device.id);
            } catch (error) {
              Alert.alert('Couldn’t sign out', friendlyError(error, 'Try again.'));
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const confirmSignOutOthers = () => {
    Alert.alert(
      'Sign out of all other devices?',
      'Every other phone and browser will need to sign in again. This device stays signed in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out others',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId('all');
              try {
                const count = await signOutOtherDevices();
                Alert.alert(
                  'Done',
                  count === 1 ? '1 other device was signed out.' : `${count} other devices were signed out.`,
                );
              } catch (error) {
                Alert.alert('Couldn’t sign out', friendlyError(error, 'Try again.'));
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader title="Devices" />
        <AppText variant="secondary">
          Phones and browsers signed in to your account. Locations are approximate, based on the device’s network.
        </AppText>

        {devices === null ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.brandBright} />
          </View>
        ) : failed && devices.length === 0 ? (
          <AppText variant="secondary" style={styles.empty}>
            Couldn’t load your devices. Check your connection and try again.
          </AppText>
        ) : (
          <View style={styles.list}>
            {devices.map((device) => {
              const place = placeLabel(device.location);
              const status = device.needsCode ? 'Waiting for sign-in code' : activeLabel(device.lastActiveAt, now);
              return (
                <View key={device.id} style={styles.card}>
                  <View style={styles.icon}>
                    <Ionicons name={iconFor(device)} size={22} color={colors.text} />
                  </View>
                  <View style={styles.cardText}>
                    <View style={styles.titleRow}>
                      <AppText style={styles.name} numberOfLines={1}>
                        {device.deviceLabel}
                      </AppText>
                      {device.current ? (
                        <View style={styles.badge}>
                          <AppText style={styles.badgeLabel}>This device</AppText>
                        </View>
                      ) : null}
                    </View>
                    <AppText variant="secondary" style={styles.meta} numberOfLines={1}>
                      {[place, status].filter(Boolean).join(' · ')}
                    </AppText>
                    <AppText variant="secondary" style={styles.meta}>
                      {signedInLabel(device.signedInAt)}
                    </AppText>
                  </View>
                  {device.current ? null : (
                    <Pressable
                      onPress={() => confirmSignOut(device)}
                      disabled={busyId !== null}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Sign out ${device.deviceLabel}`}
                    >
                      <AppText color={colors.danger} style={styles.action}>
                        {busyId === device.id ? '…' : 'Sign out'}
                      </AppText>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {others.length > 0 ? (
          <Button
            label={busyId === 'all' ? 'Signing out…' : 'Sign out of all other devices'}
            variant="secondary"
            disabled={busyId !== null}
            onPress={confirmSignOutOthers}
          />
        ) : null}

        <AppText variant="secondary" style={styles.note}>
          Don’t recognize a device? Sign it out, then change your password in Account information. Turning on
          two-step verification stops new devices from signing in without a code from your email.
        </AppText>
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
    gap: 12,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flexShrink: 1,
    color: colors.text,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.brandBright,
  },
  badgeLabel: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
  },
  action: {
    fontWeight: '700',
  },
  note: {
    fontSize: 13,
    marginTop: spacing.sm,
  },
});
