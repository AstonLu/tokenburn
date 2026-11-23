// Small pure helpers shared by every parser. No Node built-ins allowed in core.

const MAX_INT = Number.MAX_SAFE_INTEGER;

/**
 * Coerce to a non-negative safe integer; anything else becomes 0.
 * @param {unknown} x
 * @returns {number}
 */
export function toInt(x) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) return 0;
  const n = Math.floor(x);
  return n > MAX_INT ? MAX_INT : n;
}

/**
 * UTC calendar day `YYYY-MM-DD` for an ISO timestamp or epoch ms, or null.
 * @param {unknown} ts
 * @returns {string | null}
 */
export function utcDay(ts) {
  if (typeof ts !== 'string' && typeof ts !== 'number') return null;
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  const s = new Date(t).toISOString();
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export const MODEL_RE = /^[a-z0-9.\-:_/]{1,64}$/;

/**
 * Normalise a model id to the Payload alphabet `^[a-z0-9.\-:_/]{1,64}$`.
 * Drops bracketed suffixes such as `[1m]`; returns null if nothing usable is left.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normModel(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().toLowerCase().replace(/\[[^\]]*\]/g, '');
  s = s.replace(/[^a-z0-9.\-:_/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (s.length > 64) s = s.slice(0, 64);
  return MODEL_RE.test(s) ? s : null;
}

/** @param {unknown} v @returns {v is Record<string, any>} */
export function isObj(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
