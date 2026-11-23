# Pyrometer Engineering Standard v1

## Product
Pyrometer measures how many AI tokens a person has burned across Claude Code, OpenAI Codex CLI and Gemini CLI, converts it to equivalent API value in USD, and publishes a public flex page with an OG share card.

## Hard rules
1. Privacy: raw logs are parsed locally only. The only data that leaves a machine is the Payload below. No paths, project names, prompts, code, session ids.
2. CLI is a single-purpose, zero-dependency Node ESM package (node >= 18, built-ins only), auditable in one sitting.
3. One parser implementation (`packages/core`) is shared by the CLI and the browser Web Worker. It must not import node built-ins; IO is injected.
4. All numbers are integers. Dates are UTC `YYYY-MM-DD`.

## Repo layout (pnpm workspace)
- `packages/core`   pure parser + aggregation + pricing + titles. Exports `createAggregator()`, `parseClaudeLine`, `parseCodexFile`, `parseGeminiFile`, `priceOf(model, usage)`, `PRICING`.
- `packages/cli`    `npx pyrometer` : scan, print summary + exact payload, ask Y/n, upload, open browser. Flags: `--yes`, `--open`, `--dry-run`, `--json`, `--endpoint`.
- `apps/web`        Next.js App Router: API routes, public page `/u/[id]`, OG image `/u/[id]/opengraph-image`.

## Log sources
- Claude: `~/.claude/projects/**/*.jsonl` (also `$CLAUDE_CONFIG_DIR`). Use only `type=="assistant"` lines with `message.usage`. DEDUPE by `message.id + requestId` (one reply is written as several lines carrying identical usage). Skip model `<synthetic>`.
  Fields: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, cache_creation.ephemeral_1h_input_tokens, output_tokens_details.thinking_tokens. Timestamp: top-level `timestamp`.
- Codex: `~/.codex/sessions/**/rollout-*.jsonl`. `event_msg` payload type `token_count` carries cumulative `info.total_token_usage` {input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}; use `last_token_usage` per event when present, else diff of totals. Model from latest `turn_context.payload.model`.
- Gemini: `~/.gemini/tmp/*/chats/session-*.json`, messages with `tokens` {input, output, cached, thoughts} and `model`. Tolerate absence.
Every parser must be tolerant: unknown shapes are skipped, never thrown.

## Payload v1 (POST /api/v1/ingest)
```json
{ "v": 1, "client": "cli/0.1.0", "deviceId": "uuid-v4",
  "tz": "Asia/Taipei",
  "rows": [ { "d": "2026-11-23", "tool": "claude", "model": "claude-opus-4-5",
              "in": 0, "out": 0, "cr": 0, "cw": 0, "cw1h": 0, "think": 0, "n": 0 } ] }
```
Strict zod validation; unknown keys rejected; model must match `^[a-z0-9.\-:_/]{1,64}$`; max 20k rows; body <= 2 MB.

## Identity
- `POST /api/v1/profiles` -> `{ id, claimToken }`. id: 8 char base32 slug. claimToken: 32 random bytes, stored hashed (sha256).
- CLI stores `{ id, claimToken, deviceId }` in `~/.pyrometer/config.json` (mode 600).
- ingest requires `Authorization: Bearer <claimToken>`.

## Merge semantics
Per profile, store rows keyed `deviceId|d|tool|model`. Same key overwrites with field-wise MAX (re-uploads never inflate, and history survives Claude's 30 day cleanup). Profile totals = SUM across devices.

## Storage
Upstash Redis via REST (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) with plain fetch. If unset, fall back to in-memory store (dev only).
Keys: `pf:{id}` hash meta, `pr:{id}` hash rows, `lb:usd` zset leaderboard.

## Read API
`GET /api/v1/profiles/{id}` -> Summary: totals, usdTotal, perTool, perModel, daily[{d,tokens,usd}], peakDay, streak, cacheHitRate, titles[].

## Pricing
`packages/core/pricing.json`, per million tokens: input, output, cacheRead, cacheWrite5m, cacheWrite1h. Sourced from LiteLLM model_prices_and_context_window.json via `scripts/sync-pricing.mjs`. Unknown models: family fallback (opus/sonnet/haiku/gpt/gemini), flagged `estimated`.

## Rate limits
ingest: 30 per hour per profile; profile creation: 10 per hour per IP.
