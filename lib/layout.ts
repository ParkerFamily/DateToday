import { Platform, useWindowDimensions } from 'react-native';

/**
 * Phone-first column — keeps Live / Ping / paywall readable on iPad.
 * iPad uses FULL WIDTH minus margins for better screen utilization.
 */
export const CONTENT_MAX_WIDTH = 430;
export const TABLET_MAX_WIDTH = 10000; // Effectively no limit - use full width on iPad

function getContentMaxWidth(screenWidth: number): number {
  // iPad detection: use full screen width on tablets
  const isTablet = Platform.isPad || screenWidth >= 600;
  if (isTablet) {
    // Use full width on iPad minus small margins
    return screenWidth - 32; // 16px margin on each side
  }
  return CONTENT_MAX_WIDTH;
}

export function useContentLayout() {
  const { width, height } = useWindowDimensions();
  const maxWidth = getContentMaxWidth(width);
  const isWide = width > 600; // Consider wide if bigger than phone
  const contentWidth = Math.min(width, maxWidth);
  /**
   * iPads are tall; hero math that keys off raw height blows up.
   * Cap to a phone-like height when the window is wide.
   */
  const layoutHeight = isWide ? Math.min(height, 844) : height;
  return { width, height, contentWidth, isWide, layoutHeight };
}
