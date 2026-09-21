import React from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';

/** Exact Live-tab offline wash — use on Profile / Dates / Ping so chrome matches. */
export function LiveAtmosphere({ live = false }: { live?: boolean }) {
  return (
    <LinearGradient
      colors={
        live
          ? ['rgba(34,229,139,0.14)', 'rgba(124,58,237,0.18)', '#09090B']
          : ['rgba(124,58,237,0.24)', 'rgba(20,12,34,0.88)', '#09090B']
      }
      locations={[0, 0.4, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

export function BlockLabel({ children }: { children: string }) {
  return <AppText style={styles.blockLabel}>{children}</AppText>;
}

/** Live “Dinner / Drinks” underline selector. */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.planRow}>
      {options.map((opt) => {
        const on = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            style={styles.planOpt}
            onPress={() => onChange(opt.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <AppText style={[styles.planText, on && styles.planTextOn]}>{opt.label}</AppText>
            {on ? <View style={styles.planUnderline} /> : <View style={styles.planSpacer} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export function DecisionList({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.decisionList, style]} {...rest}>
      {children}
    </View>
  );
}

export function DecisionRow({
  label,
  value,
  onPress,
  last,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <>
      <AppText style={styles.decisionKey}>{label}</AppText>
      {value ? <AppText style={styles.decisionVal}>{value}</AppText> : null}
    </>
  );
  return (
    <>
      {onPress ? (
        <Pressable style={styles.decisionRow} onPress={onPress}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.decisionRow}>{body}</View>
      )}
      {!last ? <View style={styles.decisionRule} /> : null}
    </>
  );
}

export function PlusBadge() {
  return (
    <View style={styles.plusBadge}>
      <AppText style={styles.plusBadgeText}>PLUS</AppText>
    </View>
  );
}

export function FineTuneCard({
  title,
  body,
  onPress,
  showPlus,
}: {
  title: string;
  body: string;
  onPress: () => void;
  showPlus?: boolean;
}) {
  return (
    <Pressable style={styles.fineTune} onPress={onPress}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.fineTuneTitleRow}>
          <AppText style={styles.fineTuneTitle}>{title}</AppText>
          {showPlus ? <PlusBadge /> : null}
        </View>
        <AppText style={styles.fineTuneBody}>{body}</AppText>
      </View>
      <AppText style={styles.chevron}>›</AppText>
    </Pressable>
  );
}

/** Shared page padding — matches Live `spacing.lg`. */
export const livePad = {
  paddingHorizontal: spacing.lg,
} as const;

const styles = StyleSheet.create({
  blockLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  planOpt: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  planText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  planTextOn: {
    color: colors.text,
    fontWeight: '700',
  },
  planUnderline: {
    marginTop: 8,
    height: 2,
    width: 28,
    borderRadius: 1,
    backgroundColor: colors.brandBright,
  },
  planSpacer: {
    marginTop: 8,
    height: 2,
    width: 28,
  },
  decisionList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  decisionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  decisionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  decisionKey: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  decisionVal: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  plusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(168,85,247,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.45)',
  },
  plusBadgeText: {
    color: colors.brandBright,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  fineTune: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  fineTuneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fineTuneTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  fineTuneBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 22,
    fontWeight: '300',
  },
});
