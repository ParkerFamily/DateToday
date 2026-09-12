import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';

/** Safe dismiss for modals / stacked screens — always lands somewhere usable. */
export function dismissToLive(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/(tabs)/live');
}

interface CloseButtonProps {
  onPress?: () => void;
  fallbackHref?: string;
  style?: StyleProp<ViewStyle>;
  /** high-contrast circular X for photo overlays */
  floating?: boolean;
}

export function CloseButton({
  onPress,
  fallbackHref = '/(tabs)/live',
  style,
  floating = true,
}: CloseButtonProps) {
  const router = useRouter();

  const handle = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref as never);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={12}
      onPress={handle}
      style={({ pressed }) => [
        floating ? styles.floating : styles.plain,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name="close" size={floating ? 22 : 24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floating: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,9,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  plain: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
