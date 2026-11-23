import { NextResponse } from 'next/server';
import { handle, jsonError } from '@/lib/http';
import { getProfileSummary } from '@/lib/summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/profiles/{id} -> Summary (money in integer cents, rates in basis points). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const summary = await getProfileSummary(id);
  if (!summary) return jsonError(404, 'not found');
  return NextResponse.json(summary, { headers: { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } });
});
