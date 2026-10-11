import { Platform } from 'react-native';
import { WEB_COLUMN_WIDTH } from '@/lib/scale';

/**
 * Web: the phone layout sits in a centered column. The transform makes the body the containing
 * block for fixed-position overlays (modals, sheets), so they stay inside the column too.
 */
export function installWebFrame(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('dt-web-frame')) return;
  const style = document.createElement('style');
  style.id = 'dt-web-frame';
  style.textContent = `
html {
  height: 100%;
  background: radial-gradient(circle at 50% 0%, #2a1145 0%, #0b0612 55%, #050307 100%) fixed;
}
body {
  height: 100%;
  overflow: hidden;
  background-color: #09090B;
  max-width: ${WEB_COLUMN_WIDTH}px;
  margin: 0 auto !important;
  transform: translateZ(0);
}
#root { display: flex; height: 100%; }
@media (min-width: ${WEB_COLUMN_WIDTH + 1}px) {
  body { box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.18), 0 24px 80px rgba(0, 0, 0, 0.6); }
}`;
  document.head.appendChild(style);
  document.title = 'DateToday';
}
