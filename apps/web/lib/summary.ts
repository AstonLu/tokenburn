import { computeSummary } from '@tokenburn/core';
import { PROFILE_ID_RE } from './schema';
import { getStore } from './store';

export type ProfileSummary = ReturnType<typeof computeSummary> & {
  id: string;
  createdAt: string;
  updatedAt: string | null;
  devices: number;
};

/** Load a profile and compute its public Summary (all devices summed). Null if unknown. */
export async function getProfileSummary(id: string): Promise<ProfileSummary | null> {
  if (!PROFILE_ID_RE.test(id)) return null;
  const store = getStore();
  const meta = await store.getProfile(id);
  if (!meta) return null;
  const rows = await store.getRows(id);
  const summary = computeSummary(rows);
  return {
    id,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    devices: new Set(rows.map((r) => r.deviceId)).size,
    ...summary,
  };
}
