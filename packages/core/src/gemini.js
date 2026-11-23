import { isObj, normModel, toInt, utcDay } from './util.js';

export const GEMINI_UNKNOWN_MODEL = 'gemini-unknown';

/**
 * Parse a Gemini CLI chat file (`~/.gemini/tmp/*\/chats/session-*.json`).
 *
 * Expected shape: `{ sessionId, messages: [{ id, timestamp, type, model, tokens: {
 * input, output, cached, thoughts, tool } }] }` (a bare array of messages is accepted
 * too). Messages without `tokens` are ignored; malformed files yield `[]`.
 * Gemini's `input` includes cached tokens, so `in = input - cached + tool` and
 * `cr = cached`. Thoughts are billed as output, so `out = output + thoughts`.
 * Never throws.
 *
 * @param {string} text
 * @returns {import('./types.js').UsageRecord[]}
 */
export function parseGeminiFile(text) {
  /** @type {import('./types.js').UsageRecord[]} */
  const out = [];
  if (typeof text !== 'string') return out;
  /** @type {unknown} */
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return out;
  }
  /** @type {unknown[]} */
  let messages;
  /** @type {string} */
  let sessionId = '';
  if (Array.isArray(j)) messages = j;
  else if (isObj(j) && Array.isArray(j.messages)) {
    messages = j.messages;
    if (typeof j.sessionId === 'string') sessionId = j.sessionId;
  } else return out;

  for (const msg of messages) {
    if (!isObj(msg) || !isObj(msg.tokens)) continue;
    const t = msg.tokens;
    const d = utcDay(msg.timestamp);
    if (!d) continue;
    const input = toInt(t.input);
    const cached = Math.min(toInt(t.cached), input);
    const thoughts = toInt(t.thoughts);
    const output = toInt(t.output) + thoughts;
    const tool = toInt(t.tool);
    if (input + output + tool === 0) continue;
    const id = typeof msg.id === 'string' || typeof msg.id === 'number' ? String(msg.id) : '';
    out.push({
      d,
      model: normModel(msg.model) ?? GEMINI_UNKNOWN_MODEL,
      key: id ? `${sessionId}:${id}` : null,
      in: input - cached + tool,
      out: output,
      cr: cached,
      cw: 0,
      cw1h: 0,
      think: thoughts,
    });
  }
  return out;
}
