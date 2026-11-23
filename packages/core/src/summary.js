import { totalTokens, USAGE_FIELDS } from './aggregate.js';
import { priceOf } from './pricing.js';
import { computeTitles } from './titles.js';

/**
 * Money in the Summary is integer US cents (`usd*` fields); rates are integer basis
 * points (10000 = 100%). Everything else is an integer token / count.
 *
 * @typedef {{ in: number, out: number, cr: number, cw: number, cw1h: number, think: number, n: number, tokens: number }} Totals
 * @typedef {{ tool: string, tokens: number, usd: number, n: number }} ToolStat
 * @typedef {{ model: string, tools: string[], tokens: number, usd: number, n: number, estimated: boolean, pricedAs: string | null }} ModelStat
 * @typedef {{ d: string, tokens: number, usd: number }} DayStat
 * @typedef {{
 *   totals: Totals,
 *   usdTotal: number,
 *   estimated: boolean,
 *   perTool: ToolStat[],
 *   perModel: ModelStat[],
 *   daily: DayStat[],
 *   peakDay: DayStat | null,
 *   streak: { current: number, longest: number },
 *   cacheHitRate: number,
 *   activeDays: number,
 *   firstDay: string | null,
 *   lastDay: string | null,
 *   titles: import('./titles.js').Title[],
 * }} Summary
 */

const DAY = 86400000;

/** @param {string} d */
function dayNum(d) {
  return Math.floor(Date.parse(d + 'T00:00:00Z') / DAY);
}

/** @param {number} micros */
const cents = (micros) => Math.round(micros / 10000);

/**
 * Compute the public Summary from rows (rows may carry a `deviceId`; all devices are summed).
 * @param {Array<{ d: string, tool: string, model: string, in: number, out: number, cr: number, cw: number, cw1h: number, think: number, n: number }>} rows
 * @param {{ now?: number }} [opts] `now` (epoch ms) anchors the current streak.
 * @returns {Summary}
 */
export function computeSummary(rows, opts = {}) {
  const now = opts.now ?? Date.now();
  /** @type {Totals} */
  const totals = { in: 0, out: 0, cr: 0, cw: 0, cw1h: 0, think: 0, n: 0, tokens: 0 };
  let totalMicros = 0;
  let anyEstimated = false;
  /** @type {Map<string, { tokens: number, micros: number, n: number }>} */
  const tools = new Map();
  /** @type {Map<string, { tools: Set<string>, tokens: number, micros: number, n: number, estimated: boolean, pricedAs: string | null }>} */
  const models = new Map();
  /** @type {Map<string, { tokens: number, micros: number }>} */
  const days = new Map();
  let opusTokens = 0;

  for (const r of rows) {
    const tokens = totalTokens(r);
    const p = priceOf(r.model, r);
    for (const f of USAGE_FIELDS) totals[f] += r[f];
    totals.n += r.n;
    totals.tokens += tokens;
    totalMicros += p.usdMicros;
    if (p.estimated && tokens > 0) anyEstimated = true;
    if (r.model.includes('opus')) opusTokens += tokens;

    const t = tools.get(r.tool) ?? { tokens: 0, micros: 0, n: 0 };
    t.tokens += tokens;
    t.micros += p.usdMicros;
    t.n += r.n;
    tools.set(r.tool, t);

    const m = models.get(r.model) ?? { tools: new Set(), tokens: 0, micros: 0, n: 0, estimated: p.estimated, pricedAs: p.pricedAs };
    m.tools.add(r.tool);
    m.tokens += tokens;
    m.micros += p.usdMicros;
    m.n += r.n;
    models.set(r.model, m);

    const dd = days.get(r.d) ?? { tokens: 0, micros: 0 };
    dd.tokens += tokens;
    dd.micros += p.usdMicros;
    days.set(r.d, dd);
  }

  const perTool = [...tools].map(([tool, t]) => ({ tool, tokens: t.tokens, usd: cents(t.micros), n: t.n })).sort((a, b) => b.tokens - a.tokens);
  const perModel = [...models]
    .map(([model, m]) => ({ model, tools: [...m.tools].sort(), tokens: m.tokens, usd: cents(m.micros), n: m.n, estimated: m.estimated, pricedAs: m.pricedAs }))
    .sort((a, b) => b.usd - a.usd || b.tokens - a.tokens);
  const daily = [...days]
    .filter(([, v]) => v.tokens > 0)
    .map(([d, v]) => ({ d, tokens: v.tokens, usd: cents(v.micros) }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  /** @type {DayStat | null} */
  let peakDay = null;
  for (const x of daily) if (!peakDay || x.tokens > peakDay.tokens) peakDay = x;

  // Streaks over consecutive UTC days with usage.
  let longest = 0;
  let run = 0;
  let prev = NaN;
  for (const x of daily) {
    const n = dayNum(x.d);
    run = n === prev + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = n;
  }
  const today = Math.floor(now / DAY);
  const current = daily.length && today - prev <= 1 ? run : 0;

  const cacheDenom = totals.in + totals.cr + totals.cw;
  const cacheHitRate = cacheDenom ? Math.round((totals.cr * 10000) / cacheDenom) : 0;
  const opusShare = totals.tokens ? Math.round((opusTokens * 10000) / totals.tokens) : 0;
  const usdTotal = cents(totalMicros);

  const titles = computeTitles({
    totalTokens: totals.tokens,
    usdTotal,
    peakDayTokens: peakDay ? peakDay.tokens : 0,
    cacheHitRate,
    opusShare,
    longestStreak: longest,
    toolCount: perTool.filter((t) => t.tokens > 0).length,
  });

  return {
    totals,
    usdTotal,
    estimated: anyEstimated,
    perTool,
    perModel,
    daily,
    peakDay,
    streak: { current, longest },
    cacheHitRate,
    activeDays: daily.length,
    firstDay: daily.length ? daily[0].d : null,
    lastDay: daily.length ? daily[daily.length - 1].d : null,
    titles,
  };
}
