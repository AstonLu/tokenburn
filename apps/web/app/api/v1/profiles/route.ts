import { NextResponse } from 'next/server';
import { hashToken, newClaimToken, newProfileId } from '@/lib/ids';
import { clientIp, handle, jsonError, rateLimit, readBodyCapped } from '@/lib/http';
import { CreateProfileSchema } from '@/lib/schema';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/profiles -> 201 { id, claimToken }. Body must be empty or `{}`. */
export const POST = handle(async (req: Request) => {
  const limited = await rateLimit('profile', clientIp(req), 10, 3600);
  if (limited) return limited;

  const text = await readBodyCapped(req, 1024).catch(() => null);
  if (text === null) return jsonError(413, 'body too large');
  if (text.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return jsonError(400, 'invalid JSON');
    }
    if (!CreateProfileSchema.safeParse(body).success) return jsonError(400, 'body must be {}');
  }

  const store = getStore();
  const claimToken = newClaimToken();
  const claimHash = hashToken(claimToken);
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newProfileId();
    if (await store.createProfile(id, claimHash)) {
      return NextResponse.json({ id, claimToken }, { status: 201, headers: { 'cache-control': 'no-store' } });
    }
  }
  return jsonError(503, 'could not allocate id');
});
