import { useWindowDimensions } from 'react-native';
import { IS_TABLET } from '@/lib/scale';

export function useContentLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, contentWidth: width, isWide: IS_TABLET, layoutHeight: height };
}
