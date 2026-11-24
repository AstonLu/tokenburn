import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildPayload, normalizeEndpoint, parseArgs } from '../src/main.js';
import { VERSION } from '../src/version.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '../bin/tokenburn.js');
const FIX = join(HERE, '../../core/test/fixtures');

/** A fake HOME holding the synthetic Claude, Codex and Gemini fixtures. */
function fakeHome() {
  const home = mkdtempSync(join(tmpdir(), 'tokenburn-home-'));
  cpSync(join(FIX, 'claude/projects'), join(home, '.claude/projects'), { recursive: true });
  cpSync(join(FIX, 'codex/sessions'), join(home, '.codex/sessions'), { recursive: true });
  cpSync(join(FIX, 'gemini/tmp'), join(home, '.gemini/tmp'), { recursive: true });
  return home;
}

/** @param {string[]} args @param {NodeJS.ProcessEnv} env @param {string} [stdin] */
function run(args, env, stdin) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [BIN, ...args], { env: { PATH: process.env.PATH, ...env } }, (err, stdout, stderr) =>
      resolve({ code: err ? /** @type {any} */ (err).code ?? 1 : 0, stdout, stderr }),
    );
    child.stdin?.end(stdin ?? '');
  });
}

/** Minimal fake API that records every request. */
async function fakeServer() {
  /** @type {Array<{ url: string, auth?: string, body: any }>} */
  const hits = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ url: req.url ?? '', auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/v1/profiles') res.end(JSON.stringify({ id: 'abcd2345', claimToken: 'tok_' + 'x'.repeat(40) }));
      else if (req.url === '/api/v1/ingest') res.end(JSON.stringify({ ok: true }));
      else (res.statusCode = 404), res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { hits, url: `http://127.0.0.1:${addr.port}`, close: () => server.close() };
}

test('parseArgs and endpoint normalisation', () => {
  assert.deepEqual(parseArgs(['--yes', '--open', '--endpoint', 'https://x.dev/']), { dryRun: false, yes: true, open: true, json: false, endpoint: 'https://x.dev/', help: false, version: false });
  assert.equal(parseArgs(['--endpoint=http://a']).endpoint, 'http://a');
  assert.throws(() => parseArgs(['--bogus']));
  assert.equal(normalizeEndpoint('https://x.dev/'), 'https://x.dev');
  assert.throws(() => normalizeEndpoint('file:///etc'));
});

test('payload contains only the whitelisted Payload v1 keys', () => {
  const p = buildPayload([{ d: '2026-01-01', tool: 'claude', model: 'm', in: 1, out: 2, cr: 3, cw: 4, cw1h: 0, think: 0, n: 1, /** @type {any} */ extra: '/secret/path' }], '00000000-0000-4000-8000-000000000000');
  assert.deepEqual(Object.keys(p), ['v', 'client', 'deviceId', 'tz', 'rows']);
  assert.deepEqual(Object.keys(p.rows[0]), ['d', 'tool', 'model', 'in', 'out', 'cr', 'cw', 'cw1h', 'think', 'n']);
  assert.equal(p.client, `cli/${VERSION}`);
});

test('package.json version matches the client string', () => {
  assert.equal(JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')).version, VERSION);
});

test('--dry-run scans fixtures and never touches the network', async () => {
  const srv = await fakeServer();
  const home = fakeHome();
  try {
    const r = /** @type {any} */ (await run(['--dry-run', '--json'], { HOME: home, TOKENBURN_ENDPOINT: srv.url }));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(srv.hits.length, 0);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.v, 1);
    const tools = new Set(payload.rows.map((/** @type {any} */ x) => x.tool));
    assert.deepEqual([...tools].sort(), ['claude', 'codex', 'gemini']);
    // privacy: nothing from paths / content / session ids leaks
    for (const s of ['/home', 'example', 'placeholder', 'deadbeef', 'msg_fixture', 'req_fixture', '00000000-0000-4000-8000-000000000001']) assert.ok(!r.stdout.includes(s), s);
    assert.match(r.stderr, /Dry run: nothing was sent/);
    assert.match(r.stderr, /6 duplicate lines skipped/);
  } finally {
    srv.close();
  }
});

test('--yes creates a profile, saves config (0600), uploads, prints URL last', async () => {
  const srv = await fakeServer();
  const home = fakeHome();
  const pyHome = join(home, '.tokenburn');
  try {
    const r = /** @type {any} */ (await run(['--yes'], { HOME: home, TOKENBURN_ENDPOINT: srv.url }));
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(srv.hits.map((h) => h.url), ['/api/v1/profiles', '/api/v1/ingest']);
    const cfg = JSON.parse(readFileSync(join(pyHome, 'config.json'), 'utf8'));
    assert.deepEqual(Object.keys(cfg).sort(), ['claimToken', 'deviceId', 'id']);
    assert.equal(statSync(join(pyHome, 'config.json')).mode & 0o777, 0o600);
    assert.equal(srv.hits[1].auth, `Bearer ${cfg.claimToken}`);
    assert.equal(srv.hits[1].body.deviceId, cfg.deviceId);
    const lines = r.stdout.trimEnd().split('\n');
    assert.equal(lines[lines.length - 1], `${srv.url}/u/abcd2345`);
    assert.match(r.stdout, /rows: \d+ {3}dates: 2026-11-20 \.\. 2026-11-22/);

    // second run reuses the profile: no new profile request
    const r2 = /** @type {any} */ (await run(['--yes'], { HOME: home, TOKENBURN_ENDPOINT: srv.url }));
    assert.equal(r2.code, 0, r2.stderr);
    assert.deepEqual(srv.hits.map((h) => h.url).slice(2), ['/api/v1/ingest']);
  } finally {
    srv.close();
  }
});

test('without --yes and no TTY, EOF on stdin means no upload', async () => {
  const srv = await fakeServer();
  try {
    const r = /** @type {any} */ (await run([], { HOME: fakeHome(), TOKENBURN_ENDPOINT: srv.url }, ''));
    assert.equal(r.code, 1);
    assert.equal(srv.hits.length, 0);
    const r2 = /** @type {any} */ (await run([], { HOME: fakeHome(), TOKENBURN_ENDPOINT: srv.url }, 'y\n'));
    assert.equal(r2.code, 0, r2.stderr);
    assert.equal(srv.hits.length, 2);
  } finally {
    srv.close();
  }
});
