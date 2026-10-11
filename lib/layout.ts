import { Platform, useWindowDimensions } from 'react-native';
import { IS_TABLET, WEB_COLUMN_WIDTH } from '@/lib/scale';

/** Window size the app actually draws into (the centered column on web). */
export function useAppWindow() {
  const { width, height } = useWindowDimensions();
  return { width: Platform.OS === 'web' ? Math.min(width, WEB_COLUMN_WIDTH) : width, height };
}

export function useContentLayout() {
  const { width, height } = useAppWindow();
  return { width, height, contentWidth: width, isWide: IS_TABLET, layoutHeight: height };
}
