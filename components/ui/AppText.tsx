import React from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { colors, typography } from '@/constants/theme';
import { ScaledSheet, rs } from '@/lib/scale';

const WORDMARK = require('../../assets/images/datetoday-wordmark-transparent.png');

const type = ScaledSheet.create({
  brand: typography.brand,
  hero: typography.hero,
  title: typography.title,
  body: typography.body,
  caption: typography.caption,
  label: typography.label,
});

type Variant = 'brand' | 'hero' | 'title' | 'body' | 'caption' | 'label' | 'secondary';

const INTER_FACES: [number, string][] = [
  [400, 'Inter_400Regular'],
  [600, 'Inter_600SemiBold'],
  [700, 'Inter_700Bold'],
  [800, 'Inter_800ExtraBold'],
];

/**
 * iOS resolves fontWeight to the closest loaded Inter face; Android treats each loaded face as its own
 * family and fakes the weight instead. Pick the real face on Android so both render the same.
 */
function androidInterFace(flat: TextStyle, variantFamily: string): TextStyle | null {
  const family = flat.fontFamily ?? variantFamily;
  if (!family.startsWith('Inter_') || flat.fontWeight == null) return null;
  const w = flat.fontWeight;
  const weight = w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w);
  if (!Number.isFinite(weight)) return null;
  let best = INTER_FACES[0];
  for (const face of INTER_FACES) {
    if (Math.abs(face[0] - weight) <= Math.abs(best[0] - weight)) best = face;
  }
  return { fontFamily: best[1], fontWeight: 'normal' };
}

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
      ? type.brand
      : variant === 'hero'
        ? type.hero
        : variant === 'title'
          ? type.title
          : variant === 'caption'
            ? type.caption
            : variant === 'label'
              ? type.label
              : type.body;

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

  const androidFace = Platform.OS === 'android' ? androidInterFace(flat, fontFamily) : null;

  return (
    <Text
      style={[base, { color: resolvedColor, fontFamily }, style, { lineHeight }, androidFace]}
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
  const w = rs(width ?? Math.round(size * 1.55 * 2));
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
