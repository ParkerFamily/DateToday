import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/constants/theme';
import { AppText } from '@/components/ui/AppText';

interface OptionChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function OptionChip({ label, selected = false, onPress }: OptionChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <AppText style={[styles.label, selected && styles.selectedLabel]}>{label}</AppText>
    </Pressable>
  );
}

interface OptionGridProps {
  options: readonly { value: string; label: string }[];
  values: string[];
  onToggle: (value: string) => void;
  multi?: boolean;
}

export function OptionGrid({ options, values, onToggle, multi = true }: OptionGridProps) {
  return (
    <View style={styles.grid}>
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <OptionChip
            key={option.value}
            label={option.label}
            selected={selected}
            onPress={() => {
              if (multi) onToggle(option.value);
              else onToggle(option.value);
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selected: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124, 58, 237, 0.22)',
  },
  label: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  selectedLabel: {
    color: colors.text,
  },
});
