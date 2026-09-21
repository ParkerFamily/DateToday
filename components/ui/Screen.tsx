import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/constants/theme';
import { CONTENT_MAX_WIDTH } from '@/lib/layout';

interface ScreenProps extends ViewProps {
  padded?: boolean;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  /** Full-bleed (no iPad column). Rare — prefer default. */
  fluid?: boolean;
}

export function Screen({
  children,
  style,
  padded = true,
  edges = ['top', 'left', 'right'],
  fluid = false,
  ...rest
}: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={styles.safe}>
      <View
        style={[
          styles.inner,
          !fluid && styles.column,
          padded && styles.padded,
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  column: {
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
});
