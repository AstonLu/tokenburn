import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProfileId, newClaimToken, hashToken } from '../src/ids.ts';
import { PayloadSchema, PROFILE_ID_RE } from '../src/schema.ts';

test('profile ids are 8 char base32 slugs', () => {
  for (let i = 0; i < 200; i++) assert.match(newProfileId(), PROFILE_ID_RE);
});

test('claim tokens are 43 char base64url and hash to sha256 hex', async () => {
  const t = newClaimToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.match(await hashToken(t), /^[0-9a-f]{64}$/);
  assert.equal(await hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('payload schema rejects anything beyond daily numbers', () => {
  const row = { d: '2026-01-01', tool: 'claude', model: 'claude-opus-4-5', in: 1, out: 2, cr: 3, cw: 4, cw1h: 0, think: 0, n: 1 };
  const ok = { v: 1, client: 'cli/0.1.0', deviceId: '9eaa01fa-9da4-4f1a-ad72-d387880c5c39', tz: 'UTC', rows: [row] };
  assert.ok(PayloadSchema.safeParse(ok).success);
  assert.ok(!PayloadSchema.safeParse({ ...ok, rows: [{ ...row, cwd: '/Users/me/secret' }] }).success);
  assert.ok(!PayloadSchema.safeParse({ ...ok, project: 'x' }).success);
  assert.ok(!PayloadSchema.safeParse({ ...ok, rows: [{ ...row, model: 'My Project/../x' }] }).success);
});
