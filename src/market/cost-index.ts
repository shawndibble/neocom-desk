import { getIndustrySystemCostIndices } from '@/esi/endpoints';
import type { SystemCostIndices } from '@/esi/endpoints';
import type { IndustryActivity } from '@/engine/industry/types';

export type CostIndexActivity = IndustryActivity | 'copying' | 'invention';

export async function fetchSystemCostIndices(): Promise<SystemCostIndices[]> {
  const result = await getIndustrySystemCostIndices();
  return result.data ?? [];
}

export function systemCostIndexByActivity(
  raw: readonly SystemCostIndices[],
  activity: CostIndexActivity
): Map<number, number> {
  const indices = new Map<number, number>();
  for (const entry of raw) {
    const match = entry.cost_indices.find((ci) => ci.activity === activity);
    if (match) indices.set(entry.solar_system_id, match.cost_index);
  }
  return indices;
}
