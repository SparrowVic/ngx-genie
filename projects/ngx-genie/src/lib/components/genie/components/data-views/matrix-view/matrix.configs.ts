export const THEME = {
  bgDeep: '#050a07',
  bgPanel: 'rgba(5, 15, 7, 0.9)',
  primary: '#00ff41',
  primaryDim: 'rgba(0, 255, 65, 0.4)',
  gridLine: '#0f3d15',
  gridLineStrong: '#1f7a2b',
  textHeader: '#6b8f75',
  textHeaderHover: '#ffffff',
  highlightRow: 'rgba(0, 255, 65, 0.1)',
  colors: {
    'type-component': '#2eff7d',
    'type-service': '#ffea00',
    'type-directive': '#00ffff',
    'type-pipe': '#e066ff',
    'type-token': '#ffffff',
    'type-system': '#ff3399',
    'type-value': '#00d2ff',
    'type-observable': '#bf00ff',
    'type-signal': '#fbbf24',
    'type-other': '#ff3366',
  } as Record<string, string>
};

export const BASE_CELL_SIZE = 32;
export const BASE_HEADER_HEIGHT = 180;
export const BASE_ROW_WIDTH = 300;
export const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', monospace";

export const MATRIX_RAIN_CHARS = '0123456789'.repeat(5)
  + 'qwertyuiopasdfghjklzxcvbnm010101'
  + 'カグケゲコゴサザシジスズセゼソゾタダチヂツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモヤユヨラリルレロワヲン';
