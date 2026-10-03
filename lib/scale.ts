import { Dimensions, Platform, StyleSheet } from 'react-native';

const { width, height } = Dimensions.get('window');
const shortSide = Math.min(width, height);
const longSide = Math.max(width, height);

export const IS_TABLET = Platform.OS === 'ios' ? Platform.isPad : shortSide >= 600;

/**
 * Tablets render the phone design proportionally larger (sized against a 430×932 phone) so it
 * fills the screen instead of sitting in a narrow column. 1 on phones.
 */
export const UI_SCALE = IS_TABLET
  ? Math.min(1.5, Math.max(1, Math.min(shortSide / 430, longSide / 932)))
  : 1;

/** Scale a phone-sized number (points) for the current device. */
export function rs(value: number): number {
  return UI_SCALE === 1 ? value : Math.round(value * UI_SCALE * 2) / 2;
}

const SCALED_KEYS = new Set([
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingHorizontal',
  'paddingVertical',
  'paddingStart',
  'paddingEnd',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'gap',
  'rowGap',
  'columnGap',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'top',
  'bottom',
  'left',
  'right',
  'shadowRadius',
]);

function scaleStyle(style: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    out[key] = typeof value === 'number' && SCALED_KEYS.has(key) ? rs(value) : value;
  }
  return out;
}

/** Drop-in for StyleSheet.create that scales sizes on tablets. */
export const ScaledSheet = {
  create: ((styles: Record<string, Record<string, unknown>>) => {
    if (UI_SCALE === 1) return StyleSheet.create(styles);
    const scaled: Record<string, Record<string, unknown>> = {};
    for (const [name, style] of Object.entries(styles)) scaled[name] = scaleStyle(style);
    return StyleSheet.create(scaled);
  }) as typeof StyleSheet.create,
};
