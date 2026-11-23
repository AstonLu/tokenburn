// Shared JSDoc typedefs. Import with `import('./types.js').UsageRecord`.

/**
 * @typedef {'claude' | 'codex' | 'gemini'} Tool
 */

/**
 * Token counts. All non-negative integers.
 * - in    : uncached input tokens
 * - out   : output tokens (includes reasoning / thinking tokens)
 * - cr    : cache-read input tokens
 * - cw    : cache-write (creation) input tokens, all TTLs
 * - cw1h  : subset of `cw` written with the 1 hour TTL
 * - think : subset of `out` that was thinking / reasoning (informational)
 * @typedef {{ in: number, out: number, cr: number, cw: number, cw1h: number, think: number }} Usage
 */

/**
 * One usage event produced by a parser.
 * `key` is a dedupe key (null when the source offers none).
 * @typedef {Usage & { d: string, model: string, key: string | null }} UsageRecord
 */

/**
 * One Payload v1 row: usage summed per UTC day, tool and model. `n` = number of replies.
 * @typedef {Usage & { d: string, tool: Tool, model: string, n: number }} Row
 */

/**
 * @typedef {{ v: 1, client: string, deviceId: string, tz: string, rows: Row[] }} Payload
 */

export {};
