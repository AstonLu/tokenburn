import { NextResponse } from 'next/server';
import { getStore, StoreUnavailableError } from './store';

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}, headers: HeadersInit = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

export class BodyTooLargeError extends Error {}

/** Read the request body as text, refusing anything over `max` bytes without buffering it all. */
export async function readBodyCapped(req: Request, max: number): Promise<string> {
  const len = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(len) && len > max) throw new BodyTooLargeError();
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 64) || 'unknown';
  return (req.headers.get('x-real-ip') ?? 'unknown').slice(0, 64);
}

/**
 * Fixed-window rate limit. Returns null when allowed, or a 429 response.
 */
export async function rateLimit(name: string, subject: string, limit: number, windowSec: number) {
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const count = await getStore().hit(`rl:${name}:${subject}:${window}`, windowSec);
  if (count <= limit) return null;
  const retry = (window + 1) * windowSec - Math.floor(Date.now() / 1000);
  return jsonError(429, 'rate limited', { limit, windowSec }, { 'retry-after': String(Math.max(1, retry)) });
}

/** Wrap a handler so storage outages become 503 and anything else a 500, never a stack trace. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof StoreUnavailableError) return jsonError(503, 'storage unavailable');
      console.error(e);
      return jsonError(500, 'internal error');
    }
  };
}
