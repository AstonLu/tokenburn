// Subset page fonts (see fetch-page-fonts.sh), served from /fonts/ with long-lived caching.
import tc400 from './fonts/page/noto-sans-tc-400.woff2';
import tc500 from './fonts/page/noto-sans-tc-500.woff2';
import tc700 from './fonts/page/noto-sans-tc-700.woff2';
import tc900 from './fonts/page/noto-sans-tc-900.woff2';
import bs800 from './fonts/page/big-shoulders-800.woff2';
import bs900 from './fonts/page/big-shoulders-900.woff2';
import jb500 from './fonts/page/jetbrains-mono-500.woff2';
import jb700 from './fonts/page/jetbrains-mono-700.woff2';

export const PAGE_FONTS: Record<string, ArrayBuffer> = {
  'noto-sans-tc-400.woff2': tc400, 'noto-sans-tc-500.woff2': tc500, 'noto-sans-tc-700.woff2': tc700, 'noto-sans-tc-900.woff2': tc900,
  'big-shoulders-800.woff2': bs800, 'big-shoulders-900.woff2': bs900, 'jetbrains-mono-500.woff2': jb500, 'jetbrains-mono-700.woff2': jb700,
};
