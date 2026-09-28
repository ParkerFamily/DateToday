import { Platform, useWindowDimensions } from 'react-native';

/**
 * Phone-first column — keeps Live / Ping / paywall readable on iPad.
 * Use wider layout on tablets for better space utilization.
 */
export const CONTENT_MAX_WIDTH = 430;
export const TABLET_MAX_WIDTH = 600;

function getContentMaxWidth(screenWidth: number): number {
  // iPad detection: aspect ratio < 1.6 and min width >= 600
  const isTablet = Platform.isPad || screenWidth >= 600;
  return isTablet ? TABLET_MAX_WIDTH : CONTENT_MAX_WIDTH;
}

export function useContentLayout() {
  const { width, height } = useWindowDimensions();
  const maxWidth = getContentMaxWidth(width);
  const isWide = width > maxWidth + 16;
  const contentWidth = Math.min(width, maxWidth);
  /**
   * iPads are tall; hero math that keys off raw height blows up.
   * Cap to a phone-like height when the window is wide.
   */
  const layoutHeight = isWide ? Math.min(height, 844) : height;
  return { width, height, contentWidth, isWide, layoutHeight };
}
