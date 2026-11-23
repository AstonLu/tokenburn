import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { createAggregator, parseCodexFile, parseGeminiFile } from '../src/index.js';
import { FIXTURES, read, walk } from './helpers.js';

const codexFile = walk(join(FIXTURES, 'codex/sessions'), (n) => /^rollout-.*\.jsonl$/.test(n))[0];

test('codex: last_token_usage preferred, re-emitted totals skipped, totals diffed when last is absent', () => {
  const recs = parseCodexFile(read(codexFile));
  assert.deepEqual(
    recs.map(({ key, ...r }) => r),
    [
      { d: '2026-11-20', model: 'gpt-5-codex', in: 800, out: 100, cr: 200, cw: 0, cw1h: 0, think: 40 },
      { d: '2026-11-20', model: 'gpt-5-codex', in: 700, out: 200, cr: 1300, cw: 0, cw1h: 0, think: 60 },
      { d: '2026-11-21', model: 'gpt-5.1-codex', in: 500, out: 150, cr: 500, cw: 0, cw1h: 0, think: 50 },
    ],
  );
  // Sum of per-turn deltas equals the final cumulative total (input incl. cached, output).
  const input = recs.reduce((s, r) => s + r.in + r.cr, 0);
  const output = recs.reduce((s, r) => s + r.out, 0);
  assert.equal(input, 4000);
  assert.equal(output, 450);
});

test('codex: only cumulative totals (no last) are diffed, never summed', () => {
  const ev = (ts, i, o) => JSON.stringify({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: i, cached_input_tokens: 0, output_tokens: o, reasoning_output_tokens: 0 } } } });
  const text = [ev('2026-01-01T00:00:00Z', 100, 10), ev('2026-01-01T00:01:00Z', 250, 30), ev('2026-01-01T00:02:00Z', 250, 30), ev('2026-01-01T00:03:00Z', 400, 35)].join('\n');
  const recs = parseCodexFile(text);
  assert.deepEqual(recs.map((r) => r.in), [100, 150, 150]);
  assert.equal(recs.reduce((s, r) => s + r.out, 0), 35);
  assert.equal(recs[0].model, 'codex-unknown');
});

test('codex: tolerant of garbage', () => {
  assert.deepEqual(parseCodexFile(''), []);
  assert.deepEqual(parseCodexFile('{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":5}}}\n{oops'), []);
  assert.deepEqual(parseCodexFile(/** @type {any} */ (undefined)), []);
});

test('gemini: parses tokens, tolerates missing tokens / model / timestamp and broken files', () => {
  const files = walk(join(FIXTURES, 'gemini/tmp'), (n) => /^session-.*\.json$/.test(n));
  assert.equal(files.length, 3);
  const agg = createAggregator();
  for (const f of files) assert.doesNotThrow(() => agg.addGeminiFile(read(f)));
  assert.deepEqual(agg.rows(), [
    { d: '2026-11-22', tool: 'gemini', model: 'gemini-2.5-pro', in: 2010, out: 650, cr: 3000, cw: 0, cw1h: 0, think: 250, n: 1 },
    { d: '2026-11-22', tool: 'gemini', model: 'gemini-unknown', in: 100, out: 20, cr: 0, cw: 0, cw1h: 0, think: 0, n: 1 },
  ]);
  assert.deepEqual(parseGeminiFile('[]'), []);
  assert.deepEqual(parseGeminiFile('null'), []);
  assert.deepEqual(parseGeminiFile('{"messages": 5}'), []);
});

test('gemini: same message seen twice (e.g. copied session file) is counted once', () => {
  const f = walk(join(FIXTURES, 'gemini/tmp'), (n) => n.includes('placeholder'))[0];
  const agg = createAggregator();
  agg.addGeminiFile(read(f));
  agg.addGeminiFile(read(f));
  assert.equal(agg.stats().records, 2);
  assert.equal(agg.stats().duplicates, 2);
});
