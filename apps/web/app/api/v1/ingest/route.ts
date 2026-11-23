import { NextResponse } from 'next/server';
import { computeSummary } from '@pyrometer/core';
import { hashToken, safeEqualHex } from '@/lib/ids';
import { BodyTooLargeError, handle, jsonError, rateLimit, readBodyCapped } from '@/lib/http';
import { MAX_BODY_BYTES, PayloadSchema } from '@/lib/schema';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/ingest with `Authorization: Bearer <claimToken>` and a Payload v1 body. */
export const POST = handle(async (req: Request) => {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(auth);
  if (!m) return jsonError(401, 'missing or malformed bearer token');
  const claimHash = hashToken(m[1]);

  const store = getStore();
  const id = await store.profileIdForToken(claimHash);
  const meta = id ? await store.getProfile(id) : null;
  if (!id || !meta || !safeEqualHex(meta.claimHash, claimHash)) return jsonError(401, 'invalid token');

  const limited = await rateLimit('ingest', id, 30, 3600);
  if (limited) return limited;

  let text: string;
  try {
    text = await readBodyCapped(req, MAX_BODY_BYTES);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return jsonError(413, 'body exceeds 2 MB');
    throw e;
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonError(400, 'invalid JSON');
  }
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));
    return jsonError(400, 'invalid payload', { issues });
  }

  const { deviceId, rows } = parsed.data;
  await store.mergeRows(
    id,
    rows.map((r) => ({ deviceId, ...r })),
  );
  const summary = computeSummary(await store.getRows(id));
  await store.touch(id, summary.usdTotal);

  return NextResponse.json(
    { ok: true, id, accepted: rows.length, usdTotal: summary.usdTotal, tokens: summary.totals.tokens, url: `/u/${id}` },
    { headers: { 'cache-control': 'no-store' } },
  );
});
