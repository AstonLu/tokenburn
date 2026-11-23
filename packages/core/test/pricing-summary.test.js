import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSummary, computeTitles, mergeRowMax, PRICING, priceOf, resolvePrice } from '../src/index.js';

const row = (d, tool, model, u = {}) => ({ d, tool, model, in: 0, out: 0, cr: 0, cw: 0, cw1h: 0, think: 0, n: 1, ...u });

test('pricing.json covers the three vendors and has the documented shape', () => {
  for (const k of ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5', 'gpt-5', 'gpt-5-codex', 'gemini-2.5-pro']) {
    assert.ok(PRICING[k], k);
    assert.equal(typeof PRICING[k].input, 'number');
    assert.equal(typeof PRICING[k].output, 'number');
  }
});

test('priceOf: dated ids resolve exactly; tokens x $/M = micro-USD; cw1h priced at the 1h rate', () => {
  const p = PRICING['claude-sonnet-4-5'];
  const r = priceOf('claude-sonnet-4-5-20250929', { in: 1_000_000, out: 2, cr: 10, cw: 100, cw1h: 40 });
  assert.equal(r.estimated, false);
  assert.ok(r.pricedAs?.startsWith('claude-sonnet-4-5'));
  assert.deepEqual(PRICING[r.pricedAs ?? ''], p);
  assert.equal(r.usdMicros, Math.round(1_000_000 * p.input + 2 * p.output + 10 * (p.cacheRead ?? 0) + 60 * (p.cacheWrite5m ?? 0) + 40 * (p.cacheWrite1h ?? 0)));
  assert.equal(priceOf('anthropic/claude-sonnet-4-5', { in: 1 }).estimated, false);
});

test('priceOf: unknown models use family fallback and are flagged estimated', () => {
  const r = resolvePrice('claude-opus-99-preview');
  assert.equal(r.estimated, true);
  assert.ok(r.key && r.key.includes('opus'));
  assert.equal(resolvePrice('gpt-99-turbo').estimated, true);
  assert.ok(resolvePrice('gpt-99-turbo').key?.startsWith('gpt'));
  assert.ok(resolvePrice('gemini-unknown').key?.startsWith('gemini'));
  assert.deepEqual(priceOf('mystery-model', { in: 100 }), { usdMicros: 0, estimated: true, pricedAs: null });
});

test('mergeRowMax is field-wise max, so re-uploads never inflate', () => {
  const a = row('2026-01-01', 'claude', 'x', { in: 5, out: 10, n: 3 });
  const b = row('2026-01-01', 'claude', 'x', { in: 7, out: 2, n: 1 });
  assert.deepEqual(mergeRowMax(a, b), row('2026-01-01', 'claude', 'x', { in: 7, out: 10, n: 3 }));
  assert.deepEqual(mergeRowMax(mergeRowMax(a, b), b), mergeRowMax(a, b));
  assert.deepEqual(mergeRowMax(null, a), a);
});

test('computeSummary: totals, per tool/model, daily, peak, streak, cache hit rate (sum across devices)', () => {
  const rows = [
    { deviceId: 'a', ...row('2026-11-20', 'claude', 'claude-sonnet-4-5', { in: 100, out: 100, cr: 700, cw: 100 }) },
    { deviceId: 'b', ...row('2026-11-20', 'claude', 'claude-sonnet-4-5', { in: 100, out: 100, cr: 700, cw: 100 }) },
    row('2026-11-21', 'codex', 'gpt-5-codex', { in: 1000, out: 50 }),
    row('2026-11-22', 'gemini', 'gemini-2.5-pro', { in: 10, out: 5 }),
    row('2026-11-18', 'claude', 'claude-opus-4-5', { in: 1, out: 1 }),
  ];
  const s = computeSummary(rows, { now: Date.parse('2026-11-23T05:00:00Z') });
  assert.equal(s.totals.tokens, 2000 + 1050 + 15 + 2);
  assert.equal(s.totals.n, 5);
  assert.deepEqual(s.perTool.map((t) => t.tool), ['claude', 'codex', 'gemini']);
  assert.equal(s.perTool[0].tokens, 2002);
  assert.deepEqual(s.daily.map((d) => d.d), ['2026-11-18', '2026-11-20', '2026-11-21', '2026-11-22']);
  assert.deepEqual(s.peakDay?.d, '2026-11-20');
  assert.deepEqual(s.streak, { current: 3, longest: 3 });
  assert.equal(s.cacheHitRate, Math.round((1400 * 10000) / (200 + 1400 + 200 + 1000 + 10 + 1)));
  assert.equal(s.activeDays, 4);
  for (const v of [s.usdTotal, s.cacheHitRate, ...s.daily.map((d) => d.usd), ...s.perModel.map((m) => m.usd)]) assert.ok(Number.isInteger(v));
  // streak resets when the last active day is older than yesterday
  assert.equal(computeSummary(rows, { now: Date.parse('2026-11-30T00:00:00Z') }).streak.current, 0);
  assert.deepEqual(computeSummary([]).peakDay, null);
});

test('titles: thresholds on tokens, peak day, cache, opus share, streak', () => {
  const ids = (m) => computeTitles({ totalTokens: 0, usdTotal: 0, peakDayTokens: 0, cacheHitRate: 0, opusShare: 0, longestStreak: 0, toolCount: 1, ...m }).map((t) => t.id);
  assert.deepEqual(ids({}), []);
  assert.deepEqual(ids({ totalTokens: 12e6 }), ['burn-1m', 'burn-10m']);
  assert.deepEqual(ids({ totalTokens: 2e6, cacheHitRate: 9600, opusShare: 9500 }), ['burn-1m', 'cache-80', 'cache-95', 'opus-50', 'opus-90']);
  assert.deepEqual(ids({ cacheHitRate: 9600, opusShare: 9500 }), [], 'ratio titles need volume');
  assert.deepEqual(ids({ peakDayTokens: 1e8, longestStreak: 30, toolCount: 3 }), ['peak-10m', 'peak-100m', 'streak-7', 'streak-30', 'tri-tool']);
  const t = computeTitles({ totalTokens: 1e6, usdTotal: 0, peakDayTokens: 0, cacheHitRate: 0, opusShare: 0, longestStreak: 0, toolCount: 1 })[0];
  assert.deepEqual(Object.keys(t).sort(), ['category', 'description', 'id', 'name', 'nameEn', 'tier']);
  assert.match(t.name, /[一-鿿]/);
});
