import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { colors, typography } from '@/constants/theme';

const WORDMARK = require('../../assets/images/datetoday-wordmark-transparent.png');

type Variant = 'brand' | 'hero' | 'title' | 'body' | 'caption' | 'label' | 'secondary';

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function AppText({
  variant = 'body',
  color,
  style,
  children,
  ...rest
}: AppTextProps) {
  const base: TextStyle =
    variant === 'brand'
      ? typography.brand
      : variant === 'hero'
        ? typography.hero
        : variant === 'title'
          ? typography.title
          : variant === 'caption'
            ? typography.caption
            : variant === 'label'
              ? typography.label
              : typography.body;

  const resolvedColor =
    color ??
    (variant === 'secondary' || variant === 'caption' || variant === 'label'
      ? colors.textSecondary
      : colors.text);

  const flat = StyleSheet.flatten([base, style]) as TextStyle;
  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 16;
  // Prevent clipped glyphs when callers bump fontSize but inherit body lineHeight (22).
  const minLineHeight = Math.ceil(fontSize * 1.28);
  const lineHeight =
    typeof flat.lineHeight === 'number' && flat.lineHeight >= minLineHeight
      ? flat.lineHeight
      : minLineHeight;

  const fontFamily =
    variant === 'brand' || variant === 'hero' || variant === 'title'
      ? 'Inter_800ExtraBold'
      : variant === 'label' || variant === 'caption'
        ? 'Inter_600SemiBold'
        : 'Inter_400Regular';

  return (
    <Text
      style={[base, { color: resolvedColor, fontFamily }, style, { lineHeight }]}
      {...rest}
    >
      {children}
    </Text>
  );
}

/**
 * In-app wordmark (neon sign). The d:t neon square stays the product icon / Live control.
 * Prefer `width` (px) for headers — target ~150–190 on Live.
 */
export function BrandMark({ size = 34, width }: { size?: number; width?: number }) {
  const w = width ?? Math.round(size * 1.55 * 2);
  const h = Math.round(w / 2);

  return (
    <Image
      source={WORDMARK}
      style={{ width: w, height: h, backgroundColor: 'transparent' }}
      resizeMode="contain"
      accessibilityLabel="DateToday — Go live. Get pinged. Go out."
      accessibilityRole="image"
    />
  );
}
