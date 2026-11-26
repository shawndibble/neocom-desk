import type { BuildPlanRecord } from '@/db';
import type { PlanRollupStats } from './BuildPlanList';
import type { BuildGroup } from './buildGroups';
import { computeGroupRollup } from './groupRollupView';
import type { ComparedBuildRow } from './useComparedBuildResults';

const UNKNOWN_STATS: PlanRollupStats = { profit: null, verdict: 'unknown' };

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
