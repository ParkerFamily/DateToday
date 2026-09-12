export const colors = {
  background: '#09090B',
  elevated: '#101013',
  card: '#151518',
  border: '#24242A',
  brand: '#7C3AED',
  brandBright: '#A855F7',
  live: '#22E58B',
  text: '#FAFAFA',
  textSecondary: '#92929D',
  danger: '#FF4757',
  warning: '#FFB020',
  black: '#000000',
  white: '#FFFFFF',
  overlay: 'rgba(9, 9, 11, 0.72)',
} as const;

export const gradients = {
  brand: ['#7C3AED', '#A855F7'] as const,
} as const;

export const radii = {
  card: 16,
  surface: 20,
  pill: 999,
  input: 14,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const typography = {
  brand: {
    fontSize: 34,
    fontWeight: '800' as const,
    letterSpacing: -1.2,
    lineHeight: 40,
  },
  hero: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    lineHeight: 16,
  },
};

export const motion = {
  pulseMs: 1600,
  pressScale: 0.97,
};