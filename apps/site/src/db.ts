// D1 storage. All merges are single SQL statements, so concurrent uploads cannot lose data.
import type { Row } from './schema';

export type StoredRow = Row & { deviceId: string };
export type ProfileMeta = { id: string; claimHash: string; createdAt: string; updatedAt: string | null };

const CHUNK = 4000; // rows per statement; keeps each bound JSON string well under D1's limits

export async function createProfile(db: D1Database, id: string, claimHash: string): Promise<boolean> {
  const r = await db
    .prepare('INSERT INTO profiles (id, claim_hash, created_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING')
    .bind(id, claimHash, new Date().toISOString())
    .run();
  return (r.meta.changes ?? 0) === 1;
}

export async function getProfile(db: D1Database, id: string): Promise<ProfileMeta | null> {
  const r = await db.prepare('SELECT id, claim_hash, created_at, updated_at FROM profiles WHERE id = ?1').bind(id).first<Record<string, string | null>>();
  return r ? { id: r.id as string, claimHash: r.claim_hash as string, createdAt: r.created_at as string, updatedAt: r.updated_at } : null;
}

export async function profileIdForToken(db: D1Database, claimHash: string): Promise<string | null> {
  const r = await db.prepare('SELECT id FROM profiles WHERE claim_hash = ?1').bind(claimHash).first<{ id: string }>();
  return r ? r.id : null;
}

const MERGE_SQL = `INSERT INTO usage_rows (profile_id, device_id, d, tool, model, tin, tout, cr, cw, cw1h, think, n)
SELECT ?1, ?2, json_extract(value, '$.d'), json_extract(value, '$.tool'), json_extract(value, '$.model'),
  json_extract(value, '$.in'), json_extract(value, '$.out'), json_extract(value, '$.cr'), json_extract(value, '$.cw'),
  json_extract(value, '$.cw1h'), json_extract(value, '$.think'), json_extract(value, '$.n')
FROM json_each(?3) WHERE true
ON CONFLICT (profile_id, device_id, d, tool, model) DO UPDATE SET
  tin = MAX(tin, excluded.tin), tout = MAX(tout, excluded.tout), cr = MAX(cr, excluded.cr), cw = MAX(cw, excluded.cw),
  cw1h = MAX(cw1h, excluded.cw1h), think = MAX(think, excluded.think), n = MAX(n, excluded.n)`;

/** Field-wise MAX merge per device, day, tool and model. Duplicate keys inside one upload are collapsed first. */
export async function mergeRows(db: D1Database, id: string, deviceId: string, rows: Row[]): Promise<void> {
  const m = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.d}|${r.tool}|${r.model}`;
    const p = m.get(k);
    m.set(k, p ? { ...r, in: Math.max(p.in, r.in), out: Math.max(p.out, r.out), cr: Math.max(p.cr, r.cr), cw: Math.max(p.cw, r.cw), cw1h: Math.max(p.cw1h, r.cw1h), think: Math.max(p.think, r.think), n: Math.max(p.n, r.n) } : r);
  }
  const all = [...m.values()];
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < all.length; i += CHUNK) stmts.push(db.prepare(MERGE_SQL).bind(id, deviceId, JSON.stringify(all.slice(i, i + CHUNK))));
  if (stmts.length) await db.batch(stmts);
}

/** All rows for a profile, summed across devices per day, tool and model. */
export async function getRows(db: D1Database, id: string) {
  const r = await db
    .prepare(`SELECT d, tool, model, SUM(tin) AS "in", SUM(tout) AS "out", SUM(cr) AS cr, SUM(cw) AS cw, SUM(cw1h) AS cw1h, SUM(think) AS think, SUM(n) AS n
              FROM usage_rows WHERE profile_id = ?1 GROUP BY d, tool, model ORDER BY d, tool, model`)
    .bind(id)
    .all<{ d: string; tool: string; model: string; in: number; out: number; cr: number; cw: number; cw1h: number; think: number; n: number }>();
  return r.results;
}

export async function deviceCount(db: D1Database, id: string): Promise<number> {
  const r = await db.prepare('SELECT COUNT(DISTINCT device_id) AS c FROM usage_rows WHERE profile_id = ?1').bind(id).first<{ c: number }>();
  return r?.c ?? 0;
}

export async function touch(db: D1Database, id: string, usdCents: number): Promise<void> {
  await db.prepare('UPDATE profiles SET updated_at = ?2, usd_total = ?3 WHERE id = ?1').bind(id, new Date().toISOString(), usdCents).run();
}

/** Fixed-window counter. Returns the count after this hit. */
export async function hit(db: D1Database, key: string, windowSec: number): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const win = Math.floor(now / windowSec);
  const k = `${key}:${win}`;
  const r = await db
    .prepare('INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2) ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(k, (win + 1) * windowSec)
    .first<{ count: number }>();
  if (Math.random() < 0.02) await db.prepare('DELETE FROM rate_limits WHERE expires_at < ?1').bind(now).run();
  return r?.count ?? 1;
}
