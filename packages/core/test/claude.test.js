import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { createAggregator, parseClaudeLine } from '../src/index.js';
import { FIXTURES, read, walk } from './helpers.js';

const files = walk(join(FIXTURES, 'claude/projects'), (n) => n.endsWith('.jsonl'));

test('fixture really contains the duplicate-lines-per-reply pattern', () => {
  const ids = new Map();
  for (const f of files)
    for (const line of read(f).split('\n')) {
      const r = parseClaudeLine(line);
      if (r) ids.set(r.key, (ids.get(r.key) ?? 0) + 1);
    }
  assert.equal(ids.get('msg_fixture_A:req_fixture_A'), 3);
  assert.equal(ids.get('msg_fixture_B:req_fixture_B'), 3); // 2 in main + 1 in subagent file
  assert.equal(ids.get('msg_fixture_C:req_fixture_C'), 2);
});

test('dedupe by message.id + requestId counts each reply once', () => {
  const agg = createAggregator();
  for (const f of files) agg.addClaudeFile(read(f));
  const rows = agg.rows();
  assert.deepEqual(rows, [
    { d: '2026-11-20', tool: 'claude', model: 'claude-sonnet-4-5-20250929', in: 15, out: 500, cr: 4000, cw: 2500, cw1h: 2000, think: 100, n: 2 },
    { d: '2026-11-21', tool: 'claude', model: 'claude-haiku-4-5-20251001', in: 100, out: 50, cr: 0, cw: 0, cw1h: 0, think: 0, n: 1 },
    { d: '2026-11-21', tool: 'claude', model: 'claude-opus-4-5-20251101', in: 3, out: 1000, cr: 50000, cw: 4000, cw1h: 4000, think: 600, n: 1 },
  ]);
  const s = agg.stats();
  assert.equal(s.records, 4);
  assert.equal(s.duplicates, 6);
});

test('line-by-line feeding gives the same result as whole files', () => {
  const a = createAggregator();
  const b = createAggregator();
  for (const f of files) {
    a.addClaudeFile(read(f));
    for (const l of read(f).split('\n')) b.addClaudeLine(l);
  }
  assert.deepEqual(a.rows(), b.rows());
});

test('skips <synthetic>, malformed, non-assistant and usage-less lines without throwing', () => {
  assert.equal(parseClaudeLine('{"type":"assistant","message":{"usage":'), null);
  assert.equal(parseClaudeLine('nope'), null);
  assert.equal(parseClaudeLine(/** @type {any} */ (null)), null);
  assert.equal(parseClaudeLine(JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: { model: '<synthetic>', id: 'x', usage: { input_tokens: 5 } } })), null);
  assert.equal(parseClaudeLine(JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { model: 'm', usage: { input_tokens: 5 } } })), null);
  assert.equal(parseClaudeLine(JSON.stringify({ type: 'assistant', timestamp: 'bad', message: { model: 'claude-x', usage: { input_tokens: 5 } } })), null);
});

test('usage fields are coerced to non-negative integers; cw1h clamped to cw', () => {
  const r = parseClaudeLine(
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-01-01T12:00:00Z',
      requestId: 'r',
      message: { model: 'Claude-Sonnet-4-5[1m]', id: 'i', usage: { input_tokens: -4, output_tokens: 7.9, cache_read_input_tokens: '12', cache_creation_input_tokens: 3, cache_creation: { ephemeral_1h_input_tokens: 10 } } },
    }),
  );
  assert.deepEqual(r, { d: '2026-01-01', model: 'claude-sonnet-4-5', key: 'i:r', in: 0, out: 7, cr: 0, cw: 3, cw1h: 3, think: 0 });
});
