import { z } from 'zod';

export const MAX_ROWS = 20_000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Generous per-row ceiling (one trillion tokens per model per day) to keep the leaderboard sane. */
const MAX_COUNT = 1_000_000_000_000;

const count = z.number().int().min(0).max(MAX_COUNT);

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d) return false;
    // not before 2023 and not after tomorrow (UTC)
    return t >= Date.UTC(2023, 0, 1) && t <= Date.now() + 86_400_000;
  }, 'invalid or out-of-range date');

export const RowSchema = z.strictObject({
  d: day,
  tool: z.enum(['claude', 'codex', 'gemini']),
  model: z.string().regex(/^[a-z0-9.\-:_/]{1,64}$/),
  in: count,
  out: count,
  cr: count,
  cw: count,
  cw1h: count,
  think: count,
  n: count,
});

export const PayloadSchema = z.strictObject({
  v: z.literal(1),
  client: z.string().regex(/^[a-z0-9.\-/]{1,32}$/),
  deviceId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'deviceId must be a lowercase uuid v4'),
  tz: z.string().regex(/^[A-Za-z0-9_+\-/]{1,64}$/),
  rows: z.array(RowSchema).max(MAX_ROWS),
});

export const CreateProfileSchema = z.strictObject({});

export type Row = z.infer<typeof RowSchema>;
export type Payload = z.infer<typeof PayloadSchema>;

export const PROFILE_ID_RE = /^[a-z2-7]{8}$/;
