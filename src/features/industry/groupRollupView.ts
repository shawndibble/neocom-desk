/**
 * The one place a Build Group's members become a Group Rollup and an
 * Acquisition Verdict: flatten each member's `groupResult`, roll the settled
 * ones up, then gate profit/verdict on completeness. `groupIndexStats` (the
 * Industry list row) and `BuildGroupPanel` (the open group's page) both read
 * this, so the list and the page cannot disagree about the same group.
 */
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

/** Buy price minus build cost — positive is money saved building it. Null with no buy price to compare against. */
export function profitOf(totalCost: number, buyCost: number | null): number | null {
  return buyCost === null ? null : buyCost - totalCost;
}

/**
 * No buy price to compare against reads as "unknown" rather than silently
 * missing — and so does `unpriceable`: `totalCost` counts an unpriced
 * material's own line as 0 (see `materialResolution.ts`), so a `savings`
 * value can stay non-null and understated even when the group can't really
 * be priced. Without this gate the verdict tag would read "confident" next
 * to a profit figure the row itself shows as "—".
 */
export function verdictOf(profit: number | null, unpriceable = false): PlanVerdictTag {
  if (profit === null || unpriceable) return 'unknown';
  return profit >= 0 ? 'build' : 'buy';
}

export interface GroupRollupView {
  /** Members with a settled `groupResult`, in `memberPlans` order. */
  members: BuildGroupMember[];
  /** Quantity each type is built (not bought) across members, by typeID. */
  builtQuantityByType: Map<number, number>;
  /** Merged tables over the settled members — partial while `complete` is false. */
  rollup: BuildGroupRollup;
  /** Every member has a settled `groupResult` (and there is at least one). */
  complete: boolean;
  /** Buy price minus build cost of the group, null when incomplete or no buy price. Sign only; see `verdict` for trust. */
  savings: number | null;
  /** Sum of member profits; null when incomplete or any member is unpriced. */
  profit: number | null;
  verdict: PlanVerdictTag;
  /** Build/buy totals, null when the group can't be priced or is incomplete. */
  buildCost: number | null;
  buyCost: number | null;
}

/**
 * `memberPlans` must be exactly this group's own members. A member missing
 * from `rowByPlanId`, or one still `loading`/errored (no settled
 * `groupResult`), makes the totals read "unknown" rather than a partial sum
 * presented as a whole; it stays out of `members`/`rollup`, which keep
 * describing what is settled.
 *
 * `groupResult`, never `result`: the group total re-resolves each member with
 * owned-stock deduction disabled (issue #697) — `result` is what that
 * member's own page shows.
 */
export function computeGroupRollup(
  group: Pick<BuildGroup, 'ownedStock'>,
  memberPlans: readonly BuildPlanRecord[],
  rowByPlanId: ReadonlyMap<string, ComparedBuildRow>
): GroupRollupView {
  const members: BuildGroupMember[] = [];
  // `tableMaterials` widens to `MaterialCostLine[]` at the `BuildGroupMember`
  // boundary, losing `subBuilds` — so built quantity is summed here, off
  // `flattened.table`, by typeID across members.
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
  // `rollup.unpriceable` alone misses one case: a member whose own material
  // (not product) is unpriced, but the group's owned-stock ledger happens to
  // fully cover it — `rollup.unpriceable` clears, yet that member's own
  // `profit` was computed on the owned-disabled tree, where it's still
  // unpriced, so `rollup.profit` stays null. Gate on both, or the tag reads
  // confident next to a "—" profit.
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
