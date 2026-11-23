// Storage: Upstash Redis over REST (plain fetch) or an in-memory fallback for dev.
// Keys:
//   pf:{id}    hash   profile meta (claimHash, createdAt, updatedAt)
//   pr:{id}    hash   rows; field `deviceId|d|tool|model` -> JSON [in,out,cr,cw,cw1h,think,n]
//   lb:usd     zset   leaderboard, score = usd total in cents
//   tk:{hash}  string claim-token hash -> profile id (lookup index for ingest)
//   rl:{...}   string fixed-window rate limit counters
import { mergeRowMax } from '@pyrometer/core';

export const ROW_FIELDS = ['in', 'out', 'cr', 'cw', 'cw1h', 'think', 'n'] as const;
type Counts = Record<(typeof ROW_FIELDS)[number], number>;
export type StoredRow = Counts & { deviceId: string; d: string; tool: string; model: string };
export type ProfileMeta = { id: string; claimHash: string; createdAt: string; updatedAt: string | null };

export interface Store {
  kind: 'upstash' | 'memory';
  /** Returns false if the id is taken. */
  createProfile(id: string, claimHash: string): Promise<boolean>;
  getProfile(id: string): Promise<ProfileMeta | null>;
  profileIdForToken(claimHash: string): Promise<string | null>;
  /** Field-wise MAX merge per `deviceId|d|tool|model`. */
  mergeRows(id: string, rows: StoredRow[]): Promise<void>;
  getRows(id: string): Promise<StoredRow[]>;
  touch(id: string, usdCents: number): Promise<void>;
  /** Increment a fixed-window counter and return the count within the window. */
  hit(key: string, windowSec: number): Promise<number>;
}

export class StoreUnavailableError extends Error {}

const rowKey = (r: StoredRow) => `${r.deviceId}|${r.d}|${r.tool}|${r.model}`;
const encode = (r: Counts) => JSON.stringify(ROW_FIELDS.map((f) => r[f]));

function decode(field: string, value: string): StoredRow | null {
  const parts = field.split('|');
  if (parts.length !== 4) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length !== ROW_FIELDS.length) return null;
  const [deviceId, d, tool, model] = parts;
  const row = { deviceId, d, tool, model } as StoredRow;
  ROW_FIELDS.forEach((f, i) => (row[f] = Number.isSafeInteger(arr[i]) ? arr[i] : 0));
  return row;
}

/** Collapse duplicate keys inside one upload with MAX as well. */
function dedupe(rows: StoredRow[]): Map<string, StoredRow> {
  const m = new Map<string, StoredRow>();
  for (const r of rows) m.set(rowKey(r), mergeRowMax(m.get(rowKey(r)), r));
  return m;
}

// ---------------------------------------------------------------- memory

type Mem = {
  profiles: Map<string, ProfileMeta>;
  tokens: Map<string, string>;
  rows: Map<string, Map<string, string>>;
  lb: Map<string, number>;
  rl: Map<string, { count: number; resetAt: number }>;
};

function memoryStore(): Store {
  const g = globalThis as unknown as { __pyrometerMem?: Mem };
  const mem = (g.__pyrometerMem ??= { profiles: new Map(), tokens: new Map(), rows: new Map(), lb: new Map(), rl: new Map() });
  return {
    kind: 'memory',
    async createProfile(id, claimHash) {
      if (mem.profiles.has(id)) return false;
      mem.profiles.set(id, { id, claimHash, createdAt: new Date().toISOString(), updatedAt: null });
      mem.tokens.set(claimHash, id);
      return true;
    },
    async getProfile(id) {
      return mem.profiles.get(id) ?? null;
    },
    async profileIdForToken(h) {
      return mem.tokens.get(h) ?? null;
    },
    async mergeRows(id, rows) {
      const h = mem.rows.get(id) ?? new Map<string, string>();
      for (const [k, r] of dedupe(rows)) {
        const prev = h.get(k);
        const merged = mergeRowMax(prev ? decode(k, prev) : null, r);
        h.set(k, encode(merged));
      }
      mem.rows.set(id, h);
    },
    async getRows(id) {
      const h = mem.rows.get(id);
      if (!h) return [];
      return [...h].map(([k, v]) => decode(k, v)).filter((r): r is StoredRow => r !== null);
    },
    async touch(id, usd) {
      const p = mem.profiles.get(id);
      if (p) p.updatedAt = new Date().toISOString();
      mem.lb.set(id, usd);
    },
    async hit(key, windowSec) {
      const now = Date.now();
      const cur = mem.rl.get(key);
      if (!cur || cur.resetAt <= now) {
        mem.rl.set(key, { count: 1, resetAt: now + windowSec * 1000 });
        return 1;
      }
      cur.count++;
      return cur.count;
    },
  };
}

// ---------------------------------------------------------------- upstash

type Cmd = (string | number)[];

function upstashStore(url: string, token: string): Store {
  const base = url.replace(/\/+$/, '');
  async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
    const res = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmds),
      cache: 'no-store',
    });
    if (!res.ok) throw new StoreUnavailableError(`upstash ${res.status}`);
    const out = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return out.map((r) => {
      if (r.error) throw new StoreUnavailableError(`upstash: ${r.error}`);
      return r.result;
    });
  }
  const one = async (cmd: Cmd) => (await pipeline([cmd]))[0];
  const CHUNK = 1000;

  return {
    kind: 'upstash',
    async createProfile(id, claimHash) {
      const created = await one(['HSETNX', `pf:${id}`, 'claimHash', claimHash]);
      if (created !== 1) return false;
      await pipeline([
        ['HSET', `pf:${id}`, 'createdAt', new Date().toISOString()],
        ['SET', `tk:${claimHash}`, id],
      ]);
      return true;
    },
    async getProfile(id) {
      const flat = (await one(['HGETALL', `pf:${id}`])) as string[] | null;
      if (!flat || !flat.length) return null;
      const m: Record<string, string> = {};
      for (let i = 0; i < flat.length; i += 2) m[flat[i]] = flat[i + 1];
      if (!m.claimHash) return null;
      return { id, claimHash: m.claimHash, createdAt: m.createdAt ?? '', updatedAt: m.updatedAt ?? null };
    },
    async profileIdForToken(h) {
      const id = await one(['GET', `tk:${h}`]);
      return typeof id === 'string' ? id : null;
    },
    async mergeRows(id, rows) {
      // Read-merge-write. Concurrent uploads for one profile are rare (and rate limited);
      // MAX merge is idempotent, so a retry converges on the same state.
      const entries = [...dedupe(rows)];
      for (let i = 0; i < entries.length; i += CHUNK) {
        const part = entries.slice(i, i + CHUNK);
        const prev = (await one(['HMGET', `pr:${id}`, ...part.map(([k]) => k)])) as (string | null)[];
        const hset: Cmd = ['HSET', `pr:${id}`];
        part.forEach(([k, r], j) => {
          const p = prev?.[j];
          hset.push(k, encode(mergeRowMax(p ? decode(k, p) : null, r)));
        });
        await one(hset);
      }
    },
    async getRows(id) {
      const out: StoredRow[] = [];
      let cursor = '0';
      do {
        const [next, flat] = (await one(['HSCAN', `pr:${id}`, cursor, 'COUNT', 1000])) as [string, string[]];
        for (let i = 0; i < flat.length; i += 2) {
          const r = decode(flat[i], flat[i + 1]);
          if (r) out.push(r);
        }
        cursor = String(next);
      } while (cursor !== '0');
      return out;
    },
    async touch(id, usd) {
      await pipeline([
        ['HSET', `pf:${id}`, 'updatedAt', new Date().toISOString()],
        ['ZADD', 'lb:usd', usd, id],
      ]);
    },
    async hit(key, windowSec) {
      const [n] = await pipeline([
        ['INCR', key],
        ['EXPIRE', key, windowSec, 'NX'],
      ]);
      return Number(n);
    },
  };
}

// ---------------------------------------------------------------- factory

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return (cached = upstashStore(url, token));
  if (process.env.NODE_ENV === 'production' && process.env.PYROMETER_ALLOW_MEMORY_STORE !== '1') {
    throw new StoreUnavailableError('storage not configured (set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)');
  }
  return (cached = memoryStore());
}
