import { parseClaudeLine } from './claude.js';
import { parseCodexFile } from './codex.js';
import { parseGeminiFile } from './gemini.js';

/** @typedef {import('./types.js').Tool} Tool */
/** @typedef {import('./types.js').Row} Row */
/** @typedef {import('./types.js').UsageRecord} UsageRecord */

export const USAGE_FIELDS = /** @type {const} */ (['in', 'out', 'cr', 'cw', 'cw1h', 'think']);
export const ROW_FIELDS = /** @type {const} */ ([...USAGE_FIELDS, 'n']);
export const TOOLS = /** @type {const} */ (['claude', 'codex', 'gemini']);

/**
 * Accumulates parser output into Payload rows keyed `d|tool|model`, deduplicating
 * records that share a dedupe key. IO is the caller's job: feed it lines / file texts.
 */
export function createAggregator() {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Map<string, Row>} */
  const rows = new Map();
  const stats = { records: 0, duplicates: 0, files: 0 };

  /**
   * @param {Tool} tool
   * @param {UsageRecord | null} rec
   * @returns {boolean} true if counted
   */
  function add(tool, rec) {
    if (!rec) return false;
    if (rec.key) {
      const k = `${tool}|${rec.key}`;
      if (seen.has(k)) {
        stats.duplicates++;
        return false;
      }
      seen.add(k);
    }
    const rk = `${rec.d}|${tool}|${rec.model}`;
    let r = rows.get(rk);
    if (!r) {
      r = { d: rec.d, tool, model: rec.model, in: 0, out: 0, cr: 0, cw: 0, cw1h: 0, think: 0, n: 0 };
      rows.set(rk, r);
    }
    for (const f of USAGE_FIELDS) r[f] += rec[f];
    r.n += 1;
    stats.records++;
    return true;
  }

  return {
    add,
    /** @param {string} line */
    addClaudeLine(line) {
      return add('claude', parseClaudeLine(line));
    },
    /** @param {string} text whole .jsonl file */
    addClaudeFile(text) {
      stats.files++;
      if (typeof text !== 'string') return;
      for (const line of text.split('\n')) add('claude', parseClaudeLine(line));
    },
    /** @param {string} text */
    addCodexFile(text) {
      stats.files++;
      for (const r of parseCodexFile(text)) add('codex', r);
    },
    /** @param {string} text */
    addGeminiFile(text) {
      stats.files++;
      for (const r of parseGeminiFile(text)) add('gemini', r);
    },
    /** Rows sorted by day, tool, model. @returns {Row[]} */
    rows() {
      return [...rows.values()].sort((a, b) =>
        a.d < b.d ? -1 : a.d > b.d ? 1 : a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : a.model < b.model ? -1 : a.model > b.model ? 1 : 0,
      );
    },
    stats() {
      return { ...stats, rows: rows.size };
    },
  };
}

/**
 * Field-wise MAX merge of two rows with the same key (server merge semantics:
 * re-uploading the same data never inflates totals).
 * @template {Record<string, any>} T
 * @param {T | null | undefined} a
 * @param {T} b
 * @returns {T}
 */
export function mergeRowMax(a, b) {
  if (!a) return { ...b };
  /** @type {Record<string, any>} */
  const out = { ...a };
  for (const f of ROW_FIELDS) out[f] = Math.max(a[f] ?? 0, b[f] ?? 0);
  return /** @type {T} */ (out);
}

/**
 * Total tokens of a usage object: in + out + cr + cw (cw1h and think are subsets).
 * @param {{ in: number, out: number, cr: number, cw: number }} u
 */
export function totalTokens(u) {
  return u.in + u.out + u.cr + u.cw;
}
