import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { AppText } from '@/components/ui/AppText';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  /** When secureTextEntry, show an eye toggle (default true). */
  showPasswordToggle?: boolean;
}

export function TextField({
  label,
  error,
  style,
  secureTextEntry,
  showPasswordToggle = true,
  ...rest
}: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  const isSecure = Boolean(secureTextEntry);
  const showToggle = isSecure && showPasswordToggle;

  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            showToggle ? styles.inputWithToggle : null,
            error ? styles.inputError : null,
            style,
          ]}
          autoCorrect={false}
          {...rest}
          secureTextEntry={isSecure && !visible}
          textContentType={
            isSecure ? rest.textContentType ?? 'password' : rest.textContentType
          }
        />
        {showToggle ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={10}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    marginLeft: 4,
  },
  inputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    minHeight: 54,
    borderRadius: radii.input,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: typography.body.fontSize,
  },
  inputWithToggle: {
    paddingRight: 48,
  },
  inputError: {
    borderColor: colors.danger,
  },
  toggle: {
    position: 'absolute',
    right: 14,
    height: 54,
    justifyContent: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
