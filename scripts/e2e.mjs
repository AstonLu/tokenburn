#!/usr/bin/env node
// End-to-end check: start the built web app (in-memory store), upload this machine's real
// logs with the CLI, read the Summary back and compare it with the CLI's dry-run numbers.
//
//   pnpm --filter @tokenburn/web build && node scripts/e2e.mjs
//
// The real logs are snapshotted into a temporary HOME first so that a session that is still
// writing its transcript cannot make the two runs disagree. The snapshot is deleted afterwards.
// Only totals are printed.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSummary } from '../packages/core/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'packages/cli/bin/tokenburn.js');
const WEB = join(ROOT, 'apps/web');
const PORT = Number(process.env.E2E_PORT || 3217);
const BASE = `http://127.0.0.1:${PORT}`;

function snapshotHome() {
  const home = mkdtempSync(join(tmpdir(), 'tokenburn-e2e-home-'));
  const real = homedir();
  for (const rel of ['.claude/projects', '.config/claude/projects', '.codex/sessions', '.gemini/tmp']) {
    if (existsSync(join(real, rel))) cpSync(join(real, rel), join(home, rel), { recursive: true });
  }
  return home;
}

function cli(args, env) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, maxBuffer: 64 << 20 }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr }),
    );
  });
}

async function waitFor(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`server did not start at ${url}`);
}

const post = (path, body, headers = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

async function main() {
  const server = spawn(process.execPath, [join(WEB, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: WEB,
    env: { ...process.env, TOKENBURN_ALLOW_MEMORY_STORE: '1', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const home = snapshotHome();
  const pyHome = mkdtempSync(join(tmpdir(), 'tokenburn-e2e-cfg-'));
  const env = { HOME: home, TOKENBURN_HOME: pyHome, TOKENBURN_ENDPOINT: BASE };
  try {
    await waitFor(BASE + '/api/v1/profiles/aaaaaaaa');

    // 1. dry run: exact payload, no network
    const dry = await cli(['--dry-run', '--json'], env);
    const payload = JSON.parse(dry.stdout);
    const local = computeSummary(payload.rows);
    console.log(`dry-run: ${payload.rows.length} rows, ${local.totals.tokens} tokens, ${local.usdTotal} cents, n=${local.totals.n}`);
    assert.ok(payload.rows.length > 0, 'no rows found in local logs');

    // 2. real upload
    const up = await cli(['--yes'], env);
    const url = up.stdout.trimEnd().split('\n').pop();
    const id = url.split('/u/')[1];
    assert.equal(url, `${BASE}/u/${id}`);
    console.log(`uploaded: ${url}`);

    // 3. read back and compare
    const get = async () => (await fetch(`${BASE}/api/v1/profiles/${id}`)).json();
    const s = await get();
    assert.deepEqual(s.totals, local.totals, 'totals differ');
    assert.equal(s.usdTotal, local.usdTotal);
    assert.deepEqual(s.daily, local.daily);
    assert.deepEqual(s.perModel, local.perModel);
    assert.equal(s.cacheHitRate, local.cacheHitRate);
    console.log(`server:  ${s.totals.tokens} tokens, ${s.usdTotal} cents, cacheHitRate ${s.cacheHitRate} bp, titles ${s.titles.map((t) => t.id).join(',')}`);

    // 4. re-upload never inflates (field-wise MAX)
    await cli(['--yes'], env);
    const s2 = await get();
    assert.deepEqual(s2.totals, s.totals, 're-upload inflated totals');
    console.log('re-upload: totals unchanged');

    // 5. second device sums
    const { claimToken } = JSON.parse((await import('node:fs')).readFileSync(join(pyHome, 'config.json'), 'utf8'));
    const auth = { authorization: `Bearer ${claimToken}` };
    const other = { ...payload, deviceId: '11111111-1111-4111-8111-111111111111' };
    assert.equal((await post('/api/v1/ingest', other, auth)).status, 200);
    const s3 = await get();
    assert.equal(s3.totals.tokens, 2 * s.totals.tokens);
    assert.equal(s3.devices, 2);
    console.log('second device: totals summed');

    // 6. validation / auth
    const row = payload.rows[0];
    const bad = async (body, h = auth) => (await post('/api/v1/ingest', body, h)).status;
    assert.equal(await bad({ ...payload, extra: 1 }), 400, 'unknown top-level key');
    assert.equal(await bad({ ...payload, rows: [{ ...row, path: '/x' }] }), 400, 'unknown row key');
    assert.equal(await bad({ ...payload, rows: [{ ...row, model: 'Bad Model!' }] }), 400, 'model regex');
    assert.equal(await bad({ ...payload, rows: [{ ...row, in: 1.5 }] }), 400, 'non-integer');
    assert.equal(await bad({ ...payload, rows: [{ ...row, d: '2026-02-30' }] }), 400, 'bad date');
    // Oversized bodies are refused with 413 before being read; the server may also close the
    // socket while the client is still sending, which fetch reports as a network error.
    const big = await bad({ ...payload, rows: Array(20001).fill(row) }).catch(() => 'closed');
    assert.ok(big === 413 || big === 'closed', `body too large: ${big}`);
    assert.equal(await bad({ ...payload, rows: Array(20001).fill({ d: '2026-01-01', tool: 'codex', model: 'x', in: 0, out: 0, cr: 0, cw: 0, cw1h: 0, think: 0, n: 0 }) }), 400, 'max 20k rows');
    assert.equal(await bad('{not json'), 400);
    assert.equal(await bad(payload, { authorization: 'Bearer ' + 'A'.repeat(43) }), 401);
    assert.equal(await bad(payload, {}), 401);
    assert.equal((await fetch(`${BASE}/api/v1/profiles/zzzzzzzz`)).status, 404);
    assert.equal((await fetch(`${BASE}/api/v1/profiles/..%2Fetc`)).status, 404);
    assert.equal((await post('/api/v1/profiles', { name: 'x' }, { 'x-forwarded-for': '203.0.113.9' })).status, 400);
    console.log('validation + auth: ok');

    // 7. pages
    const page = await fetch(`${BASE}/u/${id}`);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes('usdTotal'));
    const og = await fetch(`${BASE}/u/${id}/opengraph-image`);
    assert.equal(og.status, 200);
    assert.match(og.headers.get('content-type') ?? '', /image\/png/);
    console.log('page + OG image: ok');

    // 8. rate limits
    const ip = { 'x-forwarded-for': '198.51.100.7' };
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await post('/api/v1/profiles', {}, ip)).status);
    assert.deepEqual(codes, [...Array(10).fill(201), 429]);
    let last = 0;
    for (let i = 0; i < 30; i++) last = (await post('/api/v1/ingest', payload, auth)).status;
    assert.equal(last, 429, 'ingest limit');
    console.log('rate limits: ok');

    console.log('E2E PASS');
  } finally {
    server.kill();
    rmSync(home, { recursive: true, force: true });
    rmSync(pyHome, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error('E2E FAIL', e.stderr || '', e);
  process.exitCode = 1;
});
