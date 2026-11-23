import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** 8 character lowercase RFC 4648 base32 slug (40 random bits). */
export function newProfileId(): string {
  const bytes = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += BASE32[bytes[i] & 31];
  return s;
}

/** 32 random bytes, base64url encoded. Only its sha256 is ever stored. */
export function newClaimToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
