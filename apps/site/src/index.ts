// Tokenburn Worker: JSON API on D1 plus the static page, with per-profile data and share tags injected into /u/:id.
import { Hono, type Context } from 'hono';
import { computeSummary, computeMetaphors } from '@tokenburn/core';
import { CreateProfileSchema, MAX_BODY_BYTES, PayloadSchema, PROFILE_ID_RE } from './schema';
import { hashToken, newClaimToken, newProfileId } from './ids';
import * as db from './db';
import { renderOg } from './og';

export type Env = { DB: D1Database; ASSETS: Fetcher };
type C = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();
const NO_STORE = { 'cache-control': 'no-store' };

const err = (c: C, status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  c.json({ error, ...extra }, status as 400, { ...NO_STORE, ...headers });

class TooLarge extends Error {}
async function readCapped(req: Request, max: number): Promise<string> {
  const len = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(len) && len > max) throw new TooLarge();
  if (!req.body) return '';
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new TooLarge();
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function limit(c: C, name: string, subject: string, max: number, windowSec: number) {
  const n = await db.hit(c.env.DB, `rl:${name}:${subject}`, windowSec);
  if (n <= max) return null;
  const now = Math.floor(Date.now() / 1000);
  const retry = (Math.floor(now / windowSec) + 1) * windowSec - now;
  return err(c, 429, 'rate limited', { limit: max, windowSec }, { 'retry-after': String(Math.max(1, retry)) });
}

app.onError((e, c) => {
  console.error(e);
  return c.json({ error: 'internal error' }, 500, NO_STORE);
});

/** POST /api/v1/profiles -> 201 { id, claimToken } */
app.post('/api/v1/profiles', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const limited = await limit(c, 'profile', ip, 10, 3600);
  if (limited) return limited;
  let text: string;
  try {
    text = await readCapped(c.req.raw, 1024);
  } catch {
    return err(c, 413, 'body too large');
  }
  if (text.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return err(c, 400, 'invalid JSON');
    }
    if (!CreateProfileSchema.safeParse(body).success) return err(c, 400, 'body must be {}');
  }
  const claimToken = newClaimToken();
  const claimHash = await hashToken(claimToken);
  for (let i = 0; i < 5; i++) {
    const id = newProfileId();
    if (await db.createProfile(c.env.DB, id, claimHash)) return c.json({ id, claimToken }, 201, NO_STORE);
  }
  return err(c, 503, 'could not allocate id');
});

/** POST /api/v1/ingest with Authorization: Bearer <claimToken> */
app.post('/api/v1/ingest', async (c) => {
  const m = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(c.req.header('authorization') ?? '');
  if (!m) return err(c, 401, 'missing or malformed bearer token');
  const id = await db.profileIdForToken(c.env.DB, await hashToken(m[1]));
  if (!id) return err(c, 401, 'invalid token');
  const limited = await limit(c, 'ingest', id, 30, 3600);
  if (limited) return limited;
  let text: string;
  try {
    text = await readCapped(c.req.raw, MAX_BODY_BYTES);
  } catch {
    return err(c, 413, 'body exceeds 2 MB');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return err(c, 400, 'invalid JSON');
  }
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));
    return err(c, 400, 'invalid payload', { issues });
  }
  const { deviceId, rows } = parsed.data;
  await db.mergeRows(c.env.DB, id, deviceId, rows);
  const summary = computeSummary(await db.getRows(c.env.DB, id));
  await db.touch(c.env.DB, id, summary.usdTotal);
  return c.json({ ok: true, id, accepted: rows.length, usdTotal: summary.usdTotal, tokens: summary.totals.tokens, url: `/u/${id}` }, 200, NO_STORE);
});

async function loadProfile(env: Env, id: string) {
  if (!PROFILE_ID_RE.test(id)) return null;
  const meta = await db.getProfile(env.DB, id);
  if (!meta) return null;
  const rows = await db.getRows(env.DB, id);
  return { meta, rows, summary: computeSummary(rows) };
}

/** GET /api/v1/profiles/:id -> Summary plus the daily per-model rows the page needs. */
app.get('/api/v1/profiles/:id', async (c) => {
  const p = await loadProfile(c.env, c.req.param('id'));
  if (!p) return err(c, 404, 'not found');
  return c.json(
    { id: p.meta.id, createdAt: p.meta.createdAt, updatedAt: p.meta.updatedAt, devices: await db.deviceCount(c.env.DB, p.meta.id), ...p.summary, rows: p.rows },
    200,
    { 'cache-control': 'public, max-age=0, s-maxage=60' },
  );
});

/** GET /u/:id/og.png -> 1200x630 share image. */
app.get('/u/:id/og.png', async (c) => {
  const p = await loadProfile(c.env, c.req.param('id'));
  if (!p) return c.notFound();
  const img = await renderOg(p.summary, computeMetaphors(p.summary));
  const h = new Headers(img.headers);
  h.set('content-type', 'image/png');
  h.set('cache-control', 'public, max-age=600');
  return new Response(img.body, { status: img.status, headers: h });
});

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);
const fmtTok = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)} 億` : n >= 1e4 ? `${Math.round(n / 1e4)} 萬` : String(n));

/** GET /u/:id -> the page, with this profile's rows inlined and share tags set. */
app.get('/u/:id', async (c) => {
  const id = c.req.param('id');
  const p = await loadProfile(c.env, id);
  const page = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  if (!p) return new Response('找不到這個頁面', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const origin = new URL(c.req.url).origin;
  const usd = `$${Math.round(p.summary.usdTotal / 100).toLocaleString('en-US')}`;
  const title = `我燒掉了 ${fmtTok(p.summary.totals.tokens)} tokens，等於 ${usd} 的 API 算力`;
  const boot = JSON.stringify({ id, rows: p.rows }).replace(/</g, '\\u003c');
  const tags = `<meta property="og:title" content="${esc(title)}"><meta property="og:type" content="website"><meta property="og:url" content="${origin}/u/${id}">` +
    `<meta property="og:image" content="${origin}/u/${id}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` +
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:image" content="${origin}/u/${id}/og.png">` +
    `<script>window.__TOKENBURN__=${boot}</script>`;
  const out = new HTMLRewriter()
    .on('title', { element: (el) => { el.setInnerContent(`Tokenburn · ${title}`); } })
    .on('head', { element: (el) => { el.append(tags, { html: true }); } })
    .transform(page);
  return new Response(out.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=60' } });
});

app.all('/api/*', (c) => err(c, 404, 'not found'));

export default app;
