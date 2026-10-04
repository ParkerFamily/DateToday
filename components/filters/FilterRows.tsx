import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors, gradients, radii } from '@/constants/theme';
import { ScaledSheet, rs } from '@/lib/scale';

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.id)}
            style={[styles.tab, on && styles.tabOn]}
          >
            <AppText style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</AppText>
            {t.badge ? (
              <View style={[styles.tabBadge, on && styles.tabBadgeOn]}>
                <AppText style={styles.tabBadgeText}>{t.badge}</AppText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Rounded card that stacks rows with hairline separators. */
export function FilterGroup({
  children,
  premium = false,
  locked = false,
}: {
  children: React.ReactNode;
  premium?: boolean;
  locked?: boolean;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, premium && styles.groupPremium, premium && locked && styles.groupLocked]}>
      {rows.map((row, i) => (
        <View key={i} style={i > 0 ? styles.divider : undefined}>
          {row}
        </View>
      ))}
    </View>
  );
}

export type IconSpec = { name: keyof typeof Ionicons.glyphMap; color?: string } | { emoji: string };

function RowIcon({ icon }: { icon: IconSpec }) {
  if ('emoji' in icon) return <AppText style={styles.emoji}>{icon.emoji}</AppText>;
  return <Ionicons name={icon.name} size={rs(17)} color={icon.color ?? colors.brandBright} />;
}

/** Collapsed: title + current value. Tap to reveal the controls inline. */
export function FilterRow({
  icon,
  title,
  subtitle,
  plus = false,
  summary,
  active = false,
  badge,
  open,
  onToggle,
  children,
}: {
  icon: IconSpec;
  title: string;
  subtitle?: string;
  plus?: boolean;
  summary: string;
  active?: boolean;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${summary}`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <RowIcon icon={icon} />
        <View style={styles.rowTitleWrap}>
          <AppText style={styles.rowTitle} numberOfLines={1}>
            {title}
            {plus ? <AppText style={styles.sparkle}> ✨</AppText> : null}
          </AppText>
          {subtitle ? (
            <AppText style={styles.rowBody} numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
          {badge}
        </View>
        <AppText style={[styles.summary, active && styles.summaryOn]} numberOfLines={1}>
          {summary}
        </AppText>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-forward'}
          size={rs(16)}
          color={open ? colors.brandBright : colors.textSecondary}
        />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

export function ToggleFilterRow({
  icon,
  title,
  body,
  plus = false,
  value,
  onChange,
}: {
  icon: IconSpec;
  title: string;
  body?: string;
  plus?: boolean;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <RowIcon icon={icon} />
      <View style={styles.rowTitleWrap}>
        <AppText style={styles.rowTitle} numberOfLines={1}>
          {title}
          {plus ? <AppText style={styles.sparkle}> ✨</AppText> : null}
        </AppText>
        {body ? (
          <AppText style={styles.rowBody} numberOfLines={1}>
            {body}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor={colors.white}
        accessibilityLabel={title}
      />
    </View>
  );
}

/** "Find your type ✨" header for the DateToday+ group. */
export function PremiumHeader({
  title,
  subtitle,
  plus,
  onUnlock,
}: {
  title: string;
  subtitle: string;
  plus: boolean;
  onUnlock: () => void;
}) {
  return (
    <View style={styles.premiumHead}>
      <View style={styles.flex}>
        <AppText style={styles.premiumTitle}>{title}</AppText>
        <AppText style={styles.premiumSub}>{plus ? 'Included with your DateToday+' : subtitle}</AppText>
      </View>
      {!plus ? (
        <Pressable onPress={onUnlock} style={styles.unlockPill} accessibilityRole="button">
          <LinearGradient colors={[...gradients.brand]} style={styles.unlockGrad}>
            <AppText style={styles.unlockText}>Unlock</AppText>
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SubLabel({ children }: { children: string }) {
  return <AppText style={styles.subLabel}>{children}</AppText>;
}

/** Small caps heading between groups ("WHEN", "VIBE"…). */
export function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <AppText style={styles.sectionTitle}>{children.toUpperCase()}</AppText>
      {hint ? <AppText style={styles.sectionHint}>{hint}</AppText> : null}
    </View>
  );
}

const styles = ScaledSheet.create({
  flex: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: radii.pill,
  },
  tabOn: { backgroundColor: 'rgba(124,58,237,0.32)', borderWidth: 1, borderColor: colors.brandBright },
  tabText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  tabTextOn: { color: colors.text },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tabBadgeOn: { backgroundColor: colors.brandBright },
  tabBadgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  group: {
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupPremium: { borderColor: 'rgba(168,85,247,0.55)' },
  groupLocked: { borderStyle: 'dashed' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.03)' },
  emoji: { fontSize: 16, width: 18, textAlign: 'center' },
  rowTitleWrap: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowBody: { color: colors.textSecondary, fontSize: 12 },
  sparkle: { fontSize: 13 },
  summary: { color: colors.textSecondary, fontSize: 14, fontWeight: '600', maxWidth: '45%', textAlign: 'right' },
  summaryOn: { color: colors.brandBright },
  body: { gap: 10, paddingHorizontal: 14, paddingBottom: 14 },
  premiumHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    marginTop: 6,
  },
  premiumTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  premiumSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  unlockPill: { borderRadius: radii.pill, overflow: 'hidden' },
  unlockGrad: { paddingHorizontal: 14, height: 32, justifyContent: 'center' },
  unlockText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  subLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
    marginBottom: -4,
    paddingHorizontal: 4,
  },
  sectionTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  sectionHint: { color: colors.textSecondary, fontSize: 12, flexShrink: 1, textAlign: 'right' },
});
