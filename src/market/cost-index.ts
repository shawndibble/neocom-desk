/**
 * ESI system cost indices (public, no auth) — drives a Build Plan's
 * live job cost per solar system (CONTEXT.md: "live system cost index
 * (ESI)"). Routed through the getIndustrySystemCostIndices wrapper
 * (src/esi/endpoints.ts) rather than esiFetch directly, so the registry
 * stays the one place every ESI call is accounted for.
 */
import { getIndustrySystemCostIndices } from '@/esi/endpoints';
import type { SystemCostIndices } from '@/esi/endpoints';
import type { IndustryActivity } from '@/engine/industry/types';

/**
 * Every system's cost indices, every activity, straight off ESI — one call
 * answers a manufacturing plan's index and a reaction plan's alike, so a
 * caller pricing both never has to fetch twice for the same underlying
 * per-system payload (issue #460: this used to take an `activity` and
 * refetch per activity, which meant one full response fetched and parsed
 * twice for data ESI already returned in one call).
 */
export async function fetchSystemCostIndices(): Promise<SystemCostIndices[]> {
  const result = await getIndustrySystemCostIndices();
  return result.data ?? [];
}

/**
 * Narrows the raw per-system rows to one activity's index, keyed by solar
 * system ID. Pure and cheap — call it fresh per activity against one cached
 * `fetchSystemCostIndices()` result rather than re-fetching. Other ESI
 * activities (invention, copying, researching_*) are out of v1 scope.
 */
export function systemCostIndexByActivity(
  raw: readonly SystemCostIndices[],
  activity: IndustryActivity
): Map<number, number> {
  const indices = new Map<number, number>();
  for (const entry of raw) {
    const match = entry.cost_indices.find((ci) => ci.activity === activity);
    if (match) indices.set(entry.solar_system_id, match.cost_index);
  }
  return indices;
}
