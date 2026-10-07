import { Platform, type ViewStyle } from 'react-native';

function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * iOS shadow* props draw nothing on Android, so coloured glows vanish there. This mirrors one as a
 * boxShadow on Android only (blur ≈ 2× iOS shadowRadius); iOS styles are untouched.
 */
export function androidGlow(
  color: string,
  opacity: number,
  shadowRadius: number,
  offsetY = 0,
  borderRadius?: number,
): ViewStyle {
  if (Platform.OS !== 'android') return {};
  return {
    boxShadow: `0px ${offsetY}px ${shadowRadius * 2}px ${rgba(color, opacity)}`,
    ...(borderRadius != null ? { borderRadius } : {}),
  };
}
