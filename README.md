# Tokenburn

Tokenburn measures how many AI tokens you have burned across **Claude Code**, **OpenAI Codex CLI** and **Gemini CLI**, converts them to the equivalent API price in USD, and publishes a public profile page with an Open Graph share card.

```
npx tokenburn            # scan, show exactly what would be sent, ask, upload
npx tokenburn --dry-run  # scan and show the payload; never touches the network
```

The engineering standard is [`docs/SPEC.md`](docs/SPEC.md).

## Privacy guarantees

- **Logs never leave your machine.** Transcripts are parsed locally by the CLI (or in a browser Web Worker). Tokenburn reads only token counts, model ids and timestamps.
- **Only the Payload is uploaded.** It holds one row per UTC day, tool and model, with integer token counts. It contains **no** file paths, project names, prompts, responses, code, tool calls, session ids or message ids.
- **You see the exact payload first.** Before anything is sent, the CLI prints the row count, the date range and the first rows of the payload, then asks `[Y/n]`. `--json` prints the full payload. `--dry-run` never opens a network connection.
- **Your claim token is never stored in plain form.** `POST /api/v1/profiles` returns a random 32-byte claim token once. The server keeps only its SHA-256 hash. The CLI stores the token in `~/.tokenburn/config.json` with mode `600`.
- **The CLI is auditable.** It has zero runtime dependencies and uses Node built-ins only. The parser is shared with the web app (`packages/core`) and is vendored into the CLI at build time.

### Payload v1 (`POST /api/v1/ingest`)

```json
{
  "v": 1,
  "client": "cli/0.1.0",
  "deviceId": "3f1c2a9e-8b7d-4c1e-9f2a-6d5e4c3b2a10",
  "tz": "Asia/Taipei",
  "rows": [
    { "d": "2026-11-23", "tool": "claude", "model": "claude-opus-4-5",
      "in": 1200, "out": 48000, "cr": 2300000, "cw": 120000, "cw1h": 90000, "think": 9000, "n": 41 }
  ]
}
```

| field | meaning |
|---|---|
| `d` | UTC day `YYYY-MM-DD` |
| `tool` | `claude` \| `codex` \| `gemini` |
| `model` | model id, `^[a-z0-9.\-:_/]{1,64}$` |
| `in` | uncached input tokens |
| `out` | output tokens, including reasoning or thinking tokens |
| `cr` | cache-read input tokens |
| `cw` | cache-write input tokens, all TTLs |
| `cw1h` | the part of `cw` written with the 1 hour TTL |
| `think` | the part of `out` that was thinking or reasoning (informational, not priced twice) |
| `n` | number of replies |

The server validates the payload strictly with zod. It rejects unknown keys and non-integers, and it caps a payload at 20,000 rows and 2 MB.

## How it works

| Source | Location | Notes |
|---|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl`, `~/.config/claude/projects`, `$CLAUDE_CONFIG_DIR/projects` | Only `type=="assistant"` lines that carry `message.usage` are read. Claude Code writes one reply as 2-3 lines with the same `message.id`, `requestId` and usage, so replies are deduplicated by `message.id + requestId`. `<synthetic>` is skipped. |
| Codex CLI | `$CODEX_HOME` or `~/.codex/sessions/**/rollout-*.jsonl` | `token_count` events: `last_token_usage` is used when present, otherwise the diff of the cumulative `total_token_usage`. Re-emitted events with an unchanged total are skipped. The model comes from the latest `turn_context`. Cached tokens are split out of `input_tokens`. |
| Gemini CLI | `~/.gemini/tmp/*/chats/session-*.json` | `tokens {input, output, cached, thoughts, tool}` per message. Files without tokens or with a broken format are tolerated. |

All parsers skip unknown shapes and never throw.

**Merge semantics.** The server stores rows keyed by `deviceId|d|tool|model`. A row that arrives with an existing key is merged field by field, keeping the maximum of each field. Uploading again therefore never inflates the totals, and history survives Claude Code's 30-day log cleanup. Profile totals are the sum across all devices.

**Pricing.** `packages/core/pricing.json` lists USD prices per million tokens (`input`, `output`, `cacheRead`, `cacheWrite5m`, `cacheWrite1h`) for Claude, OpenAI and Gemini chat models. `scripts/sync-pricing.mjs` generates it from LiteLLM's `model_prices_and_context_window.json`. A model that is not in the file is priced by its family (opus, sonnet, haiku, gpt or gemini) and flagged `estimated`. Long-context tier prices (above 200k tokens) are not modelled.

## Summary (`GET /api/v1/profiles/{id}`)

```jsonc
{
  "id": "q6rvzypy", "createdAt": "…", "updatedAt": "…", "devices": 1,
  "totals": { "in": 0, "out": 0, "cr": 0, "cw": 0, "cw1h": 0, "think": 0, "n": 0, "tokens": 0 },
  "usdTotal": 620,                 // integer US cents
  "estimated": false,              // true if any model used a family fallback price
  "perTool":  [{ "tool": "claude", "tokens": 0, "usd": 0, "n": 0 }],
  "perModel": [{ "model": "…", "tools": ["claude"], "tokens": 0, "usd": 0, "n": 0, "estimated": false, "pricedAs": "…" }],
  "daily":    [{ "d": "2026-11-23", "tokens": 0, "usd": 0 }],
  "peakDay":  { "d": "2026-11-23", "tokens": 0, "usd": 0 },
  "streak":   { "current": 1, "longest": 1 },   // consecutive UTC days
  "cacheHitRate": 9621,            // basis points: cr / (in + cr + cw), 10000 = 100%
  "activeDays": 1, "firstDay": "2026-11-23", "lastDay": "2026-11-23",
  "titles": [{ "id": "burn-1m", "name": "點火者", "nameEn": "Igniter", "description": "累計燃燒 100 萬 tokens", "category": "tokens", "tier": 1 }]
}
```

`tokens` is `in + out + cr + cw`. Every number is an integer: money is in **cents** and rates are in **basis points**. Title rules live in `packages/core/src/titles.js`. They cover total tokens, peak day, cache hit rate, Opus share, longest streak and the number of tools used.

## API

| Route | Description |
|---|---|
| `POST /api/v1/profiles` | Body `{}` or empty. Returns `201 { id, claimToken }`. `id` is an 8-character base32 slug. Limited to 10 per hour per IP. |
| `POST /api/v1/ingest` | Requires `Authorization: Bearer <claimToken>` and a Payload v1 body. Limited to 30 per hour per profile. Returns 400, 401, 413 or 429 on errors. |
| `GET /api/v1/profiles/{id}` | Returns the Summary, or 404. |
| `/u/{id}` | Placeholder page that renders the Summary JSON. |
| `/u/{id}/opengraph-image` | Basic PNG card showing the USD total and the token total. |

**Storage.** The server uses Upstash Redis over REST with plain `fetch`, configured by `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. It uses these keys:

- `pf:{id}`: profile meta, as a hash
- `pr:{id}`: rows, as a hash
- `lb:usd`: the USD leaderboard, as a sorted set
- `tk:{sha256}`: maps a claim-token hash to its profile id
- `rl:*`: rate-limit counters

If the Upstash variables are unset, an in-memory store is used. That store is for development only: `next start` refuses it unless `TOKENBURN_ALLOW_MEMORY_STORE=1` is set.

## Running it

Requires Node 18 or later (Node 22 is recommended for development) and pnpm through corepack.

```sh
corepack enable
pnpm install             # also vendors core into the CLI
pnpm test                # node:test suites (core + cli)
pnpm typecheck           # tsc over core JSDoc, cli JSDoc and the web app
pnpm build               # next build

# web app (in-memory store)
pnpm --filter @tokenburn/web dev            # http://localhost:3000

# CLI against it
node packages/cli/bin/tokenburn.js --dry-run
node packages/cli/bin/tokenburn.js --yes --open
TOKENBURN_ENDPOINT=https://example.com node packages/cli/bin/tokenburn.js

# end-to-end: builds must exist; starts `next start`, uploads your real logs, compares numbers
pnpm --filter @tokenburn/web build && pnpm e2e

# refresh prices (falls back to the litellm wheel on PyPI if GitHub is unreachable)
pnpm sync-pricing        # or: node scripts/sync-pricing.mjs --from ./model_prices_and_context_window.json
```

The CLI accepts these flags: `--dry-run`, `--yes` or `-y`, `--open`, `--json`, `--endpoint <url>`, `--help` and `--version`. The endpoint defaults to `$TOKENBURN_ENDPOINT`, then `http://localhost:3000`. Set `$TOKENBURN_HOME` to use a config directory other than `~/.tokenburn`.

The fixtures in `packages/core/test/fixtures` are synthetic. `generate.mjs` produces them by mimicking the real file structures, and they contain no real transcript content.

## Layout

```
packages/core   pure ESM parser, aggregation, pricing, summary, titles (no Node built-ins)
packages/cli    `tokenburn` bin, zero runtime deps
apps/web        Next.js App Router: API routes, /u/[id], OG image
scripts/        sync-pricing.mjs, e2e.mjs
```
