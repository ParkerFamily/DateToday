import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import { ScaledSheet, rs } from '@/lib/scale';

export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' });

export type Tone = 'default' | 'live' | 'danger' | 'warn' | 'brand' | 'muted';

const TONE: Record<Tone, string> = {
  default: colors.text,
  live: colors.live,
  danger: colors.danger,
  warn: colors.warning,
  brand: colors.brandBright,
  muted: colors.textSecondary,
};

export function confirmAction(title: string, message: string, actionLabel: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: actionLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export function notify(title: string, message?: string) {
  Alert.alert(title, message);
}

export function ConsoleScreen({
  title,
  kicker,
  children,
  refreshing,
  onRefresh,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.live} />
          ) : undefined
        }
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <AppText style={styles.kicker}>{`> ${kicker ?? 'owner_console'}`}</AppText>
            <AppText variant="hero" style={styles.title} numberOfLines={1}>
              {title}
            </AppText>
          </View>
          {onRefresh ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh" hitSlop={12} onPress={onRefresh} style={styles.back}>
              {refreshing ? (
                <ActivityIndicator color={colors.live} />
              ) : (
                <Ionicons name="refresh" size={20} color={colors.live} />
              )}
            </Pressable>
          ) : null}
        </View>
        {children}
      </ScrollView>
    </Screen>
  );
}

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string | number; sub?: string; tone?: Tone }) {
  return (
    <View style={styles.stat}>
      <AppText style={styles.statLabel}>{label}</AppText>
      <AppText style={[styles.statValue, { color: TONE[tone] }]} numberOfLines={1} adjustsFontSizeToFit>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </AppText>
      {sub ? <AppText style={styles.statSub}>{sub}</AppText> : null}
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function Panel({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.panel, style]}>
      {title ? (
        <View style={styles.panelHead}>
          <AppText style={styles.panelTitle}>{title}</AppText>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function NavTile({
  icon,
  label,
  detail,
  badge,
  tone = 'brand',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  badge?: number;
  tone?: Tone;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={[styles.tileIcon, { borderColor: TONE[tone] }]}>
        <Ionicons name={icon} size={20} color={TONE[tone]} />
      </View>
      <View style={styles.flex}>
        <AppText style={styles.tileLabel}>{label}</AppText>
        {detail ? (
          <AppText style={styles.tileDetail} numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>{badge > 99 ? '99+' : badge}</AppText>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

export function ActionButton({
  label,
  icon,
  tone = 'default',
  busy,
  disabled,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = TONE[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { borderColor: color },
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : icon ? (
        <Ionicons name={icon} size={16} color={color} />
      ) : null}
      <AppText style={[styles.actionLabel, { color }]}>{label}</AppText>
    </Pressable>
  );
}

export function Pill({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  return (
    <View style={[styles.pill, { borderColor: TONE[tone] }]}>
      <AppText style={[styles.pillText, { color: TONE[tone] }]}>{label}</AppText>
    </View>
  );
}

export function KV({ k, v, tone = 'default' }: { k: string; v: React.ReactNode; tone?: Tone }) {
  return (
    <View style={styles.kv}>
      <AppText style={styles.kvKey}>{k}</AppText>
      {typeof v === 'string' || typeof v === 'number' ? (
        <AppText style={[styles.kvValue, { color: TONE[tone] }]} selectable>
          {v}
        </AppText>
      ) : (
        v
      )}
    </View>
  );
}

export function Avatar({ uri, size = 44 }: { uri: string | null; size?: number }) {
  const s = rs(size);
  return uri ? (
    <Image source={{ uri }} style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: colors.elevated }} contentFit="cover" />
  ) : (
    <View style={[styles.avatarEmpty, { width: s, height: s, borderRadius: s / 2 }]}>
      <Ionicons name="person" size={s * 0.5} color={colors.textSecondary} />
    </View>
  );
}

export function ConsoleInput({ style, multiline, ...rest }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      multiline={multiline}
      style={[styles.input, multiline && styles.inputMulti, style]}
      {...rest}
    />
  );
}

export function Empty({ text }: { text: string }) {
  return <AppText style={styles.empty}>{text}</AppText>;
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.live} />
    </View>
  );
}

export function ErrorLine({ text }: { text: string }) {
  return <AppText style={styles.error}>{`! ${text}`}</AppText>;
}

const styles = ScaledSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  headerText: {
    flex: 1,
  },
  kicker: {
    fontFamily: MONO,
    fontSize: 12,
    color: colors.live,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 30,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 92,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  statLabel: {
    fontFamily: MONO,
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: {
    fontFamily: MONO,
    fontSize: 28,
    fontWeight: '700',
  },
  statSub: {
    fontFamily: MONO,
    fontSize: 11,
    color: colors.textSecondary,
  },
  panel: {
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  panelTitle: {
    fontFamily: MONO,
    fontSize: 12,
    color: colors.live,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  tileLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  tileDetail: {
    fontFamily: MONO,
    fontSize: 12,
    color: colors.textSecondary,
  },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: colors.background,
  },
  actionLabel: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '700',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  kvKey: {
    fontFamily: MONO,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  kvValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: MONO,
    fontSize: 13,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontFamily: MONO,
    fontSize: 14,
  },
  inputMulti: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
  },
  empty: {
    fontFamily: MONO,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  loading: {
    paddingVertical: spacing.xl,
  },
  error: {
    fontFamily: MONO,
    fontSize: 13,
    color: colors.danger,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
});
