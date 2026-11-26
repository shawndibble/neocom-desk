import type { BuildPlanRecord } from '@/db';
import {
  rollUpBuildGroup,
  type BuildGroupMember,
  type BuildGroupRollup,
} from '@/engine/industry/groupRollup';
import type { PlanVerdictTag } from './BuildPlanList';
import type { BuildGroup } from './buildGroups';
import { flattenBuildResult } from './resultFlattenCache';
import type { ComparedBuildRow } from './useComparedBuildResults';

export function profitOf(totalCost: number, buyCost: number | null): number | null {
  return buyCost === null ? null : buyCost - totalCost;
}

export function verdictOf(profit: number | null, unpriceable = false): PlanVerdictTag {
  if (profit === null || unpriceable) return 'unknown';
  return profit >= 0 ? 'build' : 'buy';
}

export interface GroupRollupView {
  members: BuildGroupMember[];
  builtQuantityByType: Map<number, number>;
  rollup: BuildGroupRollup;
  complete: boolean;
  savings: number | null;
  profit: number | null;
  verdict: PlanVerdictTag;
  buildCost: number | null;
  buyCost: number | null;
}

export function computeGroupRollup(
  group: Pick<BuildGroup, 'ownedStock'>,
  memberPlans: readonly BuildPlanRecord[],
  rowByPlanId: ReadonlyMap<string, ComparedBuildRow>
): GroupRollupView {
  const members: BuildGroupMember[] = [];
  const builtQuantityByType = new Map<number, number>();
  for (const plan of memberPlans) {
    const row = rowByPlanId.get(plan.id);
    if (!row?.groupResult) continue;
    const flattened = flattenBuildResult(row.groupResult);
    for (const material of flattened.table) {
      if (material.subBuilds.length === 0) continue;
      builtQuantityByType.set(
        material.typeID,
        (builtQuantityByType.get(material.typeID) ?? 0) + material.quantity
      );
    }
    members.push({
      planId: row.planId,
      planName: row.planName,
      hubId: plan.hubId,
      result: row.groupResult,
      shoppingMaterials: flattened.shopping,
      tableMaterials: flattened.table,
    });
  }

  const ownedStock = new Map(
    Object.entries(group.ownedStock ?? {}).map(([typeID, qty]) => [Number(typeID), qty])
  );
  const rollup = rollUpBuildGroup(members, { ownedStock });
  const complete = members.length > 0 && members.length === memberPlans.length;
  const unpriceable = !complete || rollup.unpriceable || rollup.profit === null;
  const savings = complete ? profitOf(rollup.totalCost, rollup.buyCost) : null;
  return {
    members,
    builtQuantityByType,
    rollup,
    complete,
    savings,
    profit: complete ? rollup.profit : null,
    verdict: verdictOf(savings, unpriceable),
    buildCost: unpriceable ? null : rollup.totalCost,
    buyCost: unpriceable ? null : rollup.buyCost,
  };
}
