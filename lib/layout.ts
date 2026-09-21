import { useWindowDimensions } from 'react-native';

/** Phone-first column — keeps Live / Ping / paywall readable on iPad. */
export const CONTENT_MAX_WIDTH = 430;

export function useContentLayout() {
  const { width, height } = useWindowDimensions();
  const isWide = width > CONTENT_MAX_WIDTH + 16;
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);
  /**
   * iPads are tall; hero math that keys off raw height blows up.
   * Cap to a phone-like height when the window is wide.
   */
  const layoutHeight = isWide ? Math.min(height, 844) : height;
  return { width, height, contentWidth, isWide, layoutHeight };
}
