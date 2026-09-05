/**
 * ESI system cost indices (public, no auth) — drives a Build Plan's
 * live manufacturing job cost per solar system (CONTEXT.md: "live system
 * cost index (ESI)"). Routed through the getIndustrySystemCostIndices
 * wrapper (src/esi/endpoints.ts) rather than esiFetch directly, so the
 * registry stays the one place every ESI call is accounted for.
 */
import { getIndustrySystemCostIndices } from '@/esi/endpoints';

/**
 * Cost index per solar system ID for one activity — 'manufacturing' (the
 * default) or 'reaction' (issue #460). Other ESI activities (invention,
 * copying, researching_*) are out of v1 scope.
 */
export async function fetchSystemCostIndices(
  activity: 'manufacturing' | 'reaction' = 'manufacturing'
): Promise<Map<number, number>> {
  const result = await getIndustrySystemCostIndices();
  const indices = new Map<number, number>();
  for (const entry of result.data ?? []) {
    const match = entry.cost_indices.find((ci) => ci.activity === activity);
    if (match) indices.set(entry.solar_system_id, match.cost_index);
  }
  return indices;
}
