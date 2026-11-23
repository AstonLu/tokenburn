import { isObj, normModel, toInt, utcDay } from './util.js';

/**
 * Parse one line of a Claude Code transcript (`~/.claude/projects/**\/*.jsonl`).
 * Returns a usage record for `type=="assistant"` lines that carry `message.usage`,
 * otherwise null. Never throws.
 *
 * Claude Code writes one API reply as several lines (one per content block) that all
 * carry the same `message.id`, `requestId` and usage; the returned `key` lets the
 * aggregator count each reply exactly once.
 *
 * @param {string} line
 * @returns {import('./types.js').UsageRecord | null}
 */
export function parseClaudeLine(line) {
  // Cheap pre-filter: most lines are user / tool / attachment lines.
  if (typeof line !== 'string' || !line.includes('"usage"') || !line.includes('"assistant"')) return null;
  /** @type {unknown} */
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObj(j) || j.type !== 'assistant') return null;
  const m = j.message;
  if (!isObj(m) || !isObj(m.usage)) return null;
  if (m.model === '<synthetic>') return null;
  const model = normModel(m.model);
  if (!model) return null;
  const d = utcDay(j.timestamp);
  if (!d) return null;

  const u = m.usage;
  const cc = isObj(u.cache_creation) ? u.cache_creation : null;
  const cw1hRaw = cc ? toInt(cc.ephemeral_1h_input_tokens) : 0;
  const cw5mRaw = cc ? toInt(cc.ephemeral_5m_input_tokens) : 0;
  let cw = toInt(u.cache_creation_input_tokens);
  if (cw === 0 && cw1hRaw + cw5mRaw > 0) cw = cw1hRaw + cw5mRaw;
  const cw1h = Math.min(cw1hRaw, cw);
  const out = toInt(u.output_tokens);
  const otd = isObj(u.output_tokens_details) ? u.output_tokens_details : null;
  const think = Math.min(otd ? toInt(otd.thinking_tokens) : 0, out);

  const msgId = typeof m.id === 'string' && m.id ? m.id : null;
  const reqId = typeof j.requestId === 'string' && j.requestId ? j.requestId : null;
  const key = msgId || reqId ? `${msgId ?? ''}:${reqId ?? ''}` : null;

  return {
    d,
    model,
    key,
    in: toInt(u.input_tokens),
    out,
    cr: toInt(u.cache_read_input_tokens),
    cw,
    cw1h,
    think,
  };
}
