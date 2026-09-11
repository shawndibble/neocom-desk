/**
 * A Build Group's Est. total / Verdict for the Industry index — the same
 * rollup `BuildGroupPanel` computes for its one open group, run here for
 * every group's row at once. Pulled out of `Industry.tsx` (rather than
 * assembled inline there) because it reaches into a priced `ComparedBuildRow`
 * and `rollUpBuildGroup` far more than it reaches into the route's own state.
 */
import type { BuildPlanRecord } from '@/db';
import { rollUpBuildGroup, type BuildGroupMember } from '@/engine/industry/groupRollup';
import type { PlanRollupStats, PlanVerdictTag } from './BuildPlanList';
import type { BuildGroup } from './buildGroups';
import { flattenBuildResult } from './resultFlattenCache';
import type { ComparedBuildRow } from './useComparedBuildResults';

/** A plan/group with no price yet, or that failed to price, reads as "unknown" rather than silently missing. */
export function verdictOf(totalCost: number | null, buyCost: number | null): PlanVerdictTag {
  if (buyCost === null) return 'unknown';
  return totalCost !== null && totalCost <= buyCost ? 'build' : 'buy';
}

const UNKNOWN_STATS: PlanRollupStats = { totalCost: null, verdict: 'unknown' };

/**
 * `memberPlans` must be exactly this group's own members. A member missing
 * from `rowByPlanId`, or one still `loading`/errored (no settled
 * `groupResult`), makes the whole row read "unknown" rather than a partial
 * sum presented as a whole — the same rule `rollUpBuildGroup`'s own callers
 * already follow for a single unpriced member.
 */
export function computeGroupIndexStats(
  group: BuildGroup,
  memberPlans: readonly BuildPlanRecord[],
  rowByPlanId: ReadonlyMap<string, ComparedBuildRow>
): PlanRollupStats {
  const members: BuildGroupMember[] = [];
  for (const plan of memberPlans) {
    const row = rowByPlanId.get(plan.id);
    if (!row?.groupResult) continue;
    const flattened = flattenBuildResult(row.groupResult);
    members.push({
      planId: row.planId,
      planName: row.planName,
      hubId: plan.hubId,
      result: row.groupResult,
      shoppingMaterials: flattened.shopping,
      tableMaterials: flattened.table,
    });
  }
  if (members.length === 0 || members.length !== memberPlans.length) return UNKNOWN_STATS;

  const ownedStock = new Map(
    Object.entries(group.ownedStock ?? {}).map(([typeID, qty]) => [Number(typeID), qty])
  );
  const rollup = rollUpBuildGroup(members, { ownedStock });
  return { totalCost: rollup.totalCost, verdict: verdictOf(rollup.totalCost, rollup.buyCost) };
}
