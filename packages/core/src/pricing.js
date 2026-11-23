import DATA from './pricing-data.js';

/**
 * @typedef {{ input: number, output: number, cacheRead: number | null, cacheWrite5m: number | null, cacheWrite1h: number | null }} ModelPrice
 * USD per million tokens.
 */

/** @type {Readonly<Record<string, ModelPrice>>} */
export const PRICING = DATA.models;
/** @type {Readonly<Record<string, string>>} */
export const PRICING_FALLBACKS = DATA.fallbacks;
export const PRICING_META = { source: DATA.source, syncedAt: DATA.syncedAt };

/** @param {string} m */
function strip(m) {
  let s = m.toLowerCase();
  const slash = s.lastIndexOf('/');
  if (slash >= 0) s = s.slice(slash + 1);
  return s;
}

/** @param {string} s */
function family(s) {
  if (s.includes('opus')) return 'opus';
  if (s.includes('sonnet')) return 'sonnet';
  if (s.includes('haiku')) return 'haiku';
  if (s.includes('gemini')) return 'gemini';
  if (s.startsWith('gpt') || s.includes('codex') || /^o\d/.test(s)) return 'gpt';
  return null;
}

/** @type {Map<string, { key: string | null, price: ModelPrice | null, estimated: boolean }>} */
const cache = new Map();

/**
 * Resolve the price entry for a model id.
 * Exact match (after removing a provider prefix and date / `-latest` suffix) is exact;
 * a longest-prefix match or a family fallback (opus/sonnet/haiku/gpt/gemini) is
 * flagged `estimated`. Unknown families resolve to `price: null` (estimated, $0).
 * @param {string} model
 */
export function resolvePrice(model) {
  const hit = cache.get(model);
  if (hit) return hit;
  const s = strip(String(model));
  const candidates = [s, s.replace(/[-@]\d{8}$/, ''), s.replace(/-latest$/, ''), s.replace(/[-@]\d{4}-\d{2}-\d{2}$/, '')];
  /** @type {{ key: string | null, price: ModelPrice | null, estimated: boolean } | null} */
  let res = null;
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(PRICING, c)) {
      res = { key: c, price: PRICING[c], estimated: false };
      break;
    }
  }
  if (!res) {
    let best = '';
    for (const k of Object.keys(PRICING)) {
      if (k.length > best.length && s.startsWith(k + '-')) best = k;
    }
    if (best) res = { key: best, price: PRICING[best], estimated: true };
  }
  if (!res) {
    const fam = family(s);
    const fk = fam ? PRICING_FALLBACKS[fam] : undefined;
    res = fk && PRICING[fk] ? { key: fk, price: PRICING[fk], estimated: true } : { key: null, price: null, estimated: true };
  }
  cache.set(model, res);
  return res;
}

/**
 * Price a usage object. Since prices are USD per million tokens,
 * tokens x price = micro-dollars; the result is an integer number of micro-USD.
 * @param {string} model
 * @param {{ in?: number, out?: number, cr?: number, cw?: number, cw1h?: number }} usage
 * @returns {{ usdMicros: number, estimated: boolean, pricedAs: string | null }}
 */
export function priceOf(model, usage) {
  const { key, price, estimated } = resolvePrice(model);
  if (!price) return { usdMicros: 0, estimated: true, pricedAs: null };
  const inp = usage.in ?? 0;
  const out = usage.out ?? 0;
  const cr = usage.cr ?? 0;
  const cw = usage.cw ?? 0;
  const cw1h = Math.min(usage.cw1h ?? 0, cw);
  const cacheRead = price.cacheRead ?? price.input;
  const w5 = price.cacheWrite5m ?? price.input;
  const w1 = price.cacheWrite1h ?? w5;
  const micros = inp * price.input + out * price.output + cr * cacheRead + (cw - cw1h) * w5 + cw1h * w1;
  return { usdMicros: Math.round(micros), estimated, pricedAs: key };
}
