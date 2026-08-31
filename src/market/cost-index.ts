/**
 * ESI system cost indices (public, no auth) — drives a Build Plan's
 * live manufacturing job cost per solar system (CONTEXT.md: "live system
 * cost index (ESI)"). Routed through the getIndustrySystemCostIndices
 * wrapper (src/esi/endpoints.ts) rather than esiFetch directly, so the
 * registry stays the one place every ESI call is accounted for.
 */
import { getIndustrySystemCostIndices } from '@/esi/endpoints';

/** Manufacturing cost index per solar system ID. Other activities (invention, etc.) are out of v1 scope. */
export async function fetchSystemCostIndices(): Promise<Map<number, number>> {
  const result = await getIndustrySystemCostIndices();
  const indices = new Map<number, number>();
  for (const entry of result.data ?? []) {
    const manufacturing = entry.cost_indices.find((ci) => ci.activity === 'manufacturing');
    if (manufacturing) indices.set(entry.solar_system_id, manufacturing.cost_index);
  }
  return indices;
}
