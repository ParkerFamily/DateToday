import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui/AppText';
import { INTEREST_GROUPS, MAX_INTERESTS } from '@/constants/interests';
import { colors, radii } from '@/constants/theme';

interface InterestPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

/** Grouped interest chips (not scrollable itself — wrap it in a ScrollView). */
export function InterestPicker({ value, onChange }: InterestPickerProps) {
  const full = value.length >= MAX_INTERESTS;

  const toggle = (item: string) => {
    const on = value.includes(item);
    if (!on && full) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    void Haptics.selectionAsync();
    onChange(on ? value.filter((x) => x !== item) : [...value, item]);
  };

  return (
    <View style={styles.root}>
      {INTEREST_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <AppText style={styles.groupTitle}>{group.title}</AppText>
          <View style={styles.chips}>
            {group.items.map((item) => {
              const on = value.includes(item);
              return (
                <Pressable
                  key={item}
                  onPress={() => toggle(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.chip, on && styles.chipOn, !on && full && styles.chipDim]}
                >
                  <AppText style={[styles.chipText, on && styles.chipTextOn]}>{item}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

export function InterestCount({ count }: { count: number }) {
  return (
    <AppText style={styles.count}>
      {count === 0 ? `Pick up to ${MAX_INTERESTS}` : `${count} of ${MAX_INTERESTS} picked`}
    </AppText>
  );
}

const styles = StyleSheet.create({
  root: { gap: 18 },
  group: { gap: 8 },
  groupTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124, 58, 237, 0.28)',
  },
  chipDim: { opacity: 0.4 },
  chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  chipTextOn: { color: colors.text },
  count: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
