/** @param {number} n */
export const int = (n) => Math.round(n).toLocaleString('en-US');

/** @type {Array<[number, string]>} */
const UNITS = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** @param {number} n */
export function compact(n) {
  for (const [v, u] of UNITS) if (Math.abs(n) >= v) return `${(n / v).toFixed(n >= 100 * v ? 0 : 1)}${u}`;
  return String(n);
}

/** Integer cents -> "$1,234.56" @param {number} c */
export const usd = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Basis points -> "92.3%" @param {number} bp */
export const pct = (bp) => `${(bp / 100).toFixed(1)}%`;

/** @param {number} b */
export const bytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`);
