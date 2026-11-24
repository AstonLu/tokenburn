import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { computeSummary, totalTokens } from '../vendor/core/index.js';
import { configPath, loadConfig, newDeviceId, saveConfig } from './config.js';
import { bytes, compact, int, pct, usd } from './format.js';
import { scanAll } from './scan.js';
import { CLIENT, VERSION } from './version.js';

const DEFAULT_ENDPOINT = 'https://tokenburn.astonlu.com';
/** Rows per ingest request; keeps each body well under the 2 MB server limit. */
export const CHUNK_ROWS = 10000;
const PREVIEW_ROWS = 5;

const HELP = `tokenburn ${VERSION}
Measure tokens burned in Claude Code, Codex CLI and Gemini CLI.
Logs are parsed locally; only daily per-model token totals are uploaded.

Usage: npx tokenburn [options]

  --dry-run          scan and show the payload; never touches the network
  --yes, -y          upload without asking
  --open             open the profile page in a browser after upload
  --json             print the full payload JSON on stdout (human output goes to stderr)
  --endpoint <url>   server (default: $TOKENBURN_ENDPOINT or ${DEFAULT_ENDPOINT})
  --help, -h         show this help
  --version, -v      show version

Config: ~/.tokenburn/config.json (override dir with $TOKENBURN_HOME)`;

/**
 * @typedef {{ dryRun: boolean, yes: boolean, open: boolean, json: boolean, endpoint: string | null, help: boolean, version: boolean }} Flags
 */

/** @param {string[]} argv @returns {Flags} */
export function parseArgs(argv) {
  /** @type {Flags} */
  const f = { dryRun: false, yes: false, open: false, json: false, endpoint: null, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') f.dryRun = true;
    else if (a === '--yes' || a === '-y') f.yes = true;
    else if (a === '--open') f.open = true;
    else if (a === '--json') f.json = true;
    else if (a === '--help' || a === '-h') f.help = true;
    else if (a === '--version' || a === '-v') f.version = true;
    else if (a === '--endpoint') {
      const v = argv[++i];
      if (!v) throw new Error('--endpoint needs a URL');
      f.endpoint = v;
    } else if (a.startsWith('--endpoint=')) f.endpoint = a.slice('--endpoint='.length);
    else throw new Error(`unknown option ${a} (see --help)`);
  }
  return f;
}

/** @param {string} raw */
export function normalizeEndpoint(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`invalid endpoint URL: ${raw}`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`endpoint must be http(s): ${raw}`);
  return u.origin + u.pathname.replace(/\/+$/, '');
}

/**
 * Build the exact Payload v1 that would be uploaded.
 * @param {import('../vendor/core/types.js').Row[]} rows
 * @param {string} deviceId
 * @returns {import('../vendor/core/types.js').Payload}
 */
export function buildPayload(rows, deviceId) {
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* keep UTC */
  }
  return {
    v: 1,
    client: CLIENT,
    deviceId,
    tz,
    rows: rows.map((r) => ({ d: r.d, tool: r.tool, model: r.model, in: r.in, out: r.out, cr: r.cr, cw: r.cw, cw1h: r.cw1h, think: r.think, n: r.n })),
  };
}

/**
 * Human-readable preview of the exact payload: row count, date range, first rows.
 * @param {import('../vendor/core/types.js').Payload} payload
 */
export function previewPayload(payload) {
  const { rows, ...head } = payload;
  const size = Buffer.byteLength(JSON.stringify(payload));
  const range = rows.length ? `${rows[0].d} .. ${rows[rows.length - 1].d}` : '(none)';
  const lines = [
    `Payload preview (exactly what is uploaded; nothing else leaves this machine):`,
    `  rows: ${rows.length}   dates: ${range}   size: ${bytes(size)}`,
    `  ${JSON.stringify(head).slice(0, -1)},"rows":[`,
    ...rows.slice(0, PREVIEW_ROWS).map((r, i) => `    ${JSON.stringify(r)}${i < rows.length - 1 ? ',' : ''}`),
  ];
  if (rows.length > PREVIEW_ROWS) lines.push(`    ... ${rows.length - PREVIEW_ROWS} more row(s) of the same shape`);
  lines.push('  ]}');
  lines.push('  No file paths, project names, prompts, code or session ids are included.');
  return lines.join('\n');
}

/**
 * @param {ReturnType<typeof computeSummary>} s
 * @param {import('./scan.js').ScanCounts} counts
 */
export function formatSummary(s, counts) {
  const t = s.totals;
  const name = { claude: 'Claude Code', codex: 'Codex CLI  ', gemini: 'Gemini CLI ' };
  const lines = [`Tokenburn ${VERSION}: local scan`];
  for (const tool of /** @type {const} */ (['claude', 'codex', 'gemini'])) {
    const c = counts[tool];
    const dup = c.duplicates ? ` (${int(c.duplicates)} duplicate lines skipped)` : '';
    lines.push(`  ${name[tool]}  ${String(c.files).padStart(5)} files  ${int(c.records).padStart(9)} replies${dup}`);
  }
  lines.push('');
  lines.push(`  Total tokens   ${int(t.tokens)}  (${compact(t.tokens)})`);
  lines.push(`    input ${int(t.in)} · output ${int(t.out)} · cache read ${int(t.cr)} · cache write ${int(t.cw)}`);
  lines.push(`  API value      ${usd(s.usdTotal)}${s.estimated ? '  (some models priced by family fallback: estimated)' : ''}`);
  if (s.peakDay) {
    lines.push(`  Active days    ${s.activeDays} (${s.firstDay} .. ${s.lastDay}) · streak ${s.streak.current} (best ${s.streak.longest})`);
    lines.push(`  Peak day       ${s.peakDay.d}: ${int(s.peakDay.tokens)} tokens, ${usd(s.peakDay.usd)}`);
  }
  lines.push(`  Cache hit rate ${pct(s.cacheHitRate)}`);
  for (const m of s.perModel.slice(0, 5)) lines.push(`    ${m.model.padEnd(34)} ${compact(m.tokens).padStart(7)} tokens  ${usd(m.usd).padStart(11)}${m.estimated ? ' ~' : ''}`);
  if (s.titles.length) lines.push(`  Titles         ${s.titles.map((x) => `${x.name} (${x.nameEn})`).join(', ')}`);
  return lines.join('\n');
}

/** @param {string} question */
async function confirm(question) {
  const interactive = Boolean(process.stdin.isTTY);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    let answered = false;
    rl.on('close', () => {
      if (!answered) resolve(false);
    });
    rl.question(question, (ans) => {
      answered = true;
      rl.close();
      const a = ans.trim().toLowerCase();
      resolve(a === 'y' || a === 'yes' || (interactive && a === ''));
    });
  });
}

/**
 * @param {string} url
 * @param {{ method?: string, body?: unknown, token?: string }} opts
 */
async function api(url, opts = {}) {
  /** @type {Record<string, string>} */
  const headers = { 'content-type': 'application/json', 'user-agent': `tokenburn/${VERSION}` };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(url, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  /** @type {any} */
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = data && data.error ? data.error : text.slice(0, 200);
    const err = new Error(`${res.status} ${msg}`);
    /** @type {any} */ (err).status = res.status;
    throw err;
  }
  return data;
}

/** @param {string} url */
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* best effort */
  }
}

/**
 * @param {string[]} argv
 * @param {{ env?: NodeJS.ProcessEnv, now?: number }} [deps]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const flags = parseArgs(argv);
  const out = (/** @type {string} */ s) => process.stdout.write(s + '\n');
  const log = flags.json ? (/** @type {string} */ s) => process.stderr.write(s + '\n') : out;
  if (flags.help) return out(HELP), 0;
  if (flags.version) return out(VERSION), 0;

  const endpoint = normalizeEndpoint(flags.endpoint || env.TOKENBURN_ENDPOINT || DEFAULT_ENDPOINT);
  const config = await loadConfig(env);
  const deviceId = config ? config.deviceId : newDeviceId();

  const { rows, counts } = await scanAll({ env });
  const summary = computeSummary(rows, { now: deps.now });
  const payload = buildPayload(rows, deviceId);

  log(formatSummary(summary, counts));
  log('');
  if (flags.json) out(JSON.stringify(payload));
  else log(previewPayload(payload));
  log('');

  if (!rows.length || rows.every((r) => totalTokens(r) === 0)) {
    log('No token usage found in ~/.claude, ~/.codex or ~/.gemini. Nothing to upload.');
    return 0;
  }
  if (flags.dryRun) {
    log('Dry run: nothing was sent.');
    return 0;
  }
  if (!flags.yes) {
    const ok = await confirm(`Upload these ${rows.length} rows to ${endpoint}? [Y/n] `);
    if (!ok) {
      log('Aborted. Nothing was sent.');
      return 1;
    }
  }

  let cfg = config;
  if (!cfg) {
    const created = await api(`${endpoint}/api/v1/profiles`, { body: {} });
    if (!created || typeof created.id !== 'string' || typeof created.claimToken !== 'string') throw new Error('unexpected response creating profile');
    cfg = { id: created.id, claimToken: created.claimToken, deviceId };
    await saveConfig(cfg, env);
    log(`Created profile ${cfg.id}; claim token saved to ${configPath(env)} (keep it private).`);
  }

  try {
    for (let i = 0; i < payload.rows.length; i += CHUNK_ROWS) {
      await api(`${endpoint}/api/v1/ingest`, { token: cfg.claimToken, body: { ...payload, rows: payload.rows.slice(i, i + CHUNK_ROWS) } });
    }
  } catch (e) {
    const status = /** @type {any} */ (e).status;
    if (status === 401 || status === 404) log(`The server does not recognise profile ${cfg.id}. If it was reset, delete ${configPath(env)} and run again.`);
    throw e;
  }

  const url = `${endpoint}/u/${cfg.id}`;
  log(`Uploaded ${payload.rows.length} rows.`);
  if (flags.open) openBrowser(url);
  out(url);
  return 0;
}
