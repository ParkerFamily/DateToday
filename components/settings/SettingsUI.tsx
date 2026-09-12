import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';

export function SettingsHeader({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        onPress={handleBack}
        style={({ pressed }) => [styles.headerBack, pressed && styles.headerBackPressed]}
      >
        <AppText style={styles.headerBackLabel}>‹</AppText>
      </Pressable>
      <AppText variant="hero" style={styles.headerTitle}>
        {title}
      </AppText>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.group}>
      <AppText variant="label" style={styles.groupTitle}>
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function SettingsRow({
  label,
  detail,
  onPress,
  danger,
  last,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.rowText}>
        <AppText color={danger ? colors.danger : colors.text}>{label}</AppText>
        {detail ? (
          <AppText variant="secondary" style={styles.detail}>
            {detail}
          </AppText>
        ) : null}
      </View>
      <AppText variant="secondary">›</AppText>
    </Pressable>
  );
}

export function LegalScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <AppText variant="secondary">‹ Back</AppText>
        </Pressable>
        <AppText variant="hero" style={styles.legalTitle}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="secondary" style={styles.legalSub}>
            {subtitle}
          </AppText>
        ) : null}
        {children}
      </ScrollView>
    </Screen>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      {typeof children === 'string' ? (
        <AppText style={styles.body}>{children}</AppText>
      ) : (
        children
      )}
    </View>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <AppText style={styles.body}>{children}</AppText>;
}

export function LegalNote({ children }: { children: string }) {
  return <AppText style={styles.note}>{children}</AppText>;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    gap: 8,
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  headerBackPressed: {
    opacity: 0.7,
  },
  headerBackLabel: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 36,
  },
  headerTitle: {
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupTitle: {
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  card: {
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  detail: {
    fontSize: 13,
  },
  legalContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  back: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  legalTitle: {
    marginBottom: 4,
  },
  legalSub: {
    marginBottom: spacing.md,
  },
  section: {
    gap: 8,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  note: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
