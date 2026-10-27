/**
 * A Build Group's Profit / Verdict for the Industry index — the same
 * rollup `BuildGroupPanel` computes for its one open group, run here for
 * every group's row at once. Pulled out of `Industry.tsx` (rather than
 * assembled inline there) because it reaches into a priced `ComparedBuildRow`
 * and `rollUpBuildGroup` far more than it reaches into the route's own state.
 */
import type { BuildPlanRecord } from '@/db';
import type { PlanRollupStats } from './BuildPlanList';
import type { BuildGroup } from './buildGroups';
import { computeGroupRollup } from './groupRollupView';
import type { ComparedBuildRow } from './useComparedBuildResults';

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
  const view = computeGroupRollup(group, memberPlans, rowByPlanId);
  if (!view.complete) return UNKNOWN_STATS;
  return {
    profit: view.profit,
    verdict: view.verdict,
    buildCost: view.buildCost,
    buyCost: view.buyCost,
  };
}
