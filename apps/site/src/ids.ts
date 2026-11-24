// Identifiers and token hashing on Web Crypto (no Node built-ins).
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** 8 character lowercase base32 slug (40 random bits). */
export function newProfileId(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (let i = 0; i < 8; i++) s += BASE32[b[i] & 31];
  return s;
}

/** 32 random bytes, base64url. Only its sha256 is stored. */
export function newClaimToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
