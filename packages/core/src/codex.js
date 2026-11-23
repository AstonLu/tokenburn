import { isObj, normModel, toInt, utcDay } from './util.js';

export const CODEX_UNKNOWN_MODEL = 'codex-unknown';

/**
 * @typedef {{ input: number, cached: number, output: number, reasoning: number }} CodexUsage
 */

/** @param {unknown} u @returns {CodexUsage | null} */
function readUsage(u) {
  if (!isObj(u)) return null;
  return {
    input: toInt(u.input_tokens),
    cached: toInt(u.cached_input_tokens),
    output: toInt(u.output_tokens),
    reasoning: toInt(u.reasoning_output_tokens),
  };
}

/** @param {CodexUsage} a @param {CodexUsage} b */
function same(a, b) {
  return a.input === b.input && a.cached === b.cached && a.output === b.output && a.reasoning === b.reasoning;
}

/** @param {CodexUsage} cur @param {CodexUsage | null} prev @returns {CodexUsage} */
function diff(cur, prev) {
  if (!prev) return cur;
  // A total that went backwards means the counter was reset: treat it as fresh.
  if (cur.input < prev.input || cur.output < prev.output) return cur;
  return {
    input: cur.input - prev.input,
    cached: Math.max(0, cur.cached - prev.cached),
    output: cur.output - prev.output,
    reasoning: Math.max(0, cur.reasoning - prev.reasoning),
  };
}

/**
 * Parse a whole Codex CLI rollout file (`~/.codex/sessions/**\/rollout-*.jsonl`).
 *
 * `event_msg` lines with payload type `token_count` carry cumulative
 * `info.total_token_usage`; `info.last_token_usage` (when present) is the
 * per-turn delta and is preferred, otherwise totals are diffed. Codex sometimes
 * re-emits a token_count with an unchanged total; such repeats are skipped so
 * they are not double counted. The model is the latest `turn_context.payload.model`
 * seen before the event. OpenAI counts cached tokens inside input_tokens, so
 * `in = input - cached` and `cr = cached`. Never throws.
 *
 * @param {string} text
 * @returns {import('./types.js').UsageRecord[]}
 */
export function parseCodexFile(text) {
  /** @type {import('./types.js').UsageRecord[]} */
  const out = [];
  if (typeof text !== 'string') return out;
  /** @type {string | null} */
  let model = null;
  /** @type {CodexUsage | null} */
  let prevTotal = null;

  for (const line of text.split('\n')) {
    if (!line || line.charCodeAt(0) !== 123 /* { */) continue;
    /** @type {unknown} */
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObj(j) || !isObj(j.payload)) continue;
    const p = j.payload;

    if (j.type === 'turn_context') {
      const m = normModel(p.model);
      if (m) model = m;
      continue;
    }
    if (j.type === 'session_meta') {
      const m = normModel(p.model);
      if (m && !model) model = m;
      continue;
    }
    if (j.type !== 'event_msg' || p.type !== 'token_count' || !isObj(p.info)) continue;

    const total = readUsage(p.info.total_token_usage);
    const last = readUsage(p.info.last_token_usage);
    if (total && prevTotal && same(total, prevTotal)) continue; // re-emitted duplicate
    const delta = last ?? (total ? diff(total, prevTotal) : null);
    if (total) prevTotal = total;
    if (!delta) continue;
    if (delta.input + delta.output + delta.cached === 0) continue;
    const d = utcDay(j.timestamp);
    if (!d) continue;

    const cached = Math.min(delta.cached, delta.input);
    out.push({
      d,
      model: model ?? CODEX_UNKNOWN_MODEL,
      key: null,
      in: delta.input - cached,
      out: delta.output,
      cr: cached,
      cw: 0,
      cw1h: 0,
      think: Math.min(delta.reasoning, delta.output),
    });
  }
  return out;
}
