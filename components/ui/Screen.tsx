import React from 'react';
import { View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/constants/theme';
import { ScaledSheet } from '@/lib/scale';

interface ScreenProps extends ViewProps {
  padded?: boolean;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
}

export function Screen({
  children,
  style,
  padded = true,
  edges = ['top', 'left', 'right'],
  ...rest
}: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={styles.safe}>
      <View style={[styles.inner, padded && styles.padded, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = ScaledSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
});
