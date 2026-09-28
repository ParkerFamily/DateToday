import { Dimensions, Platform } from 'react-native';

/**
 * Responsive utilities for iPad and tablet support
 */

export function isTablet(): boolean {
  const { width, height } = Dimensions.get('window');
  const aspectRatio = height / width;
  
  // iPad and most tablets have aspect ratios < 1.6 (typically 4:3 or 3:2)
  // Phones are typically > 1.6 (16:9, 19:9, etc)
  return Platform.isPad || (Math.min(width, height) >= 600 && aspectRatio < 1.6);
}

export function getContentMaxWidth(): number {
  return isTablet() ? 600 : undefined;
}

export function getResponsiveHorizontalPadding(): number {
  const { width } = Dimensions.get('window');
  if (!isTablet()) return 16;
  
  // On tablets, add extra padding that increases with screen width
  const extraPadding = Math.max(0, (width - 600) / 2);
  return 16 + extraPadding;
}

export function getResponsiveCardWidth(): number | string {
  if (!isTablet()) return '100%';
  return Math.min(600, Dimensions.get('window').width - 64);
}

export function useResponsiveStyles() {
  return {
    isTablet: isTablet(),
    contentMaxWidth: getContentMaxWidth(),
    horizontalPadding: getResponsiveHorizontalPadding(),
    cardWidth: getResponsiveCardWidth(),
  };
}
