/**
 * A Build Group's Profit / Verdict for the Industry index — the same
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

/** Buy price minus build cost — positive is money saved building it. Null with no buy price to compare against. */
export function profitOf(totalCost: number, buyCost: number | null): number | null {
  return buyCost === null ? null : buyCost - totalCost;
}

/** No buy price to compare against reads as "unknown" rather than silently missing. */
export function verdictOf(profit: number | null): PlanVerdictTag {
  if (profit === null) return 'unknown';
  return profit >= 0 ? 'build' : 'buy';
}

const UNKNOWN_STATS: PlanRollupStats = { profit: null, verdict: 'unknown' };

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
  const profit = profitOf(rollup.totalCost, rollup.buyCost);
  return { profit, verdict: verdictOf(profit) };
}
