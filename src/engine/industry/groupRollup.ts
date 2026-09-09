/**
 * What a **Build Group** totals to (issue #626, "Group Rollup" in CONTEXT.md):
 * every member's materials merged by type, and the costs summed.
 *
 * Pure, like the rest of `src/engine`. The caller hands in each member's
 * already-computed `BuildResult` — one per plan, priced at that plan's own
 * hub/ME/facility — plus its two flattened material lists, and gets one set of
 * group figures back.
 *
 * ## Why the caller flattens, and why there are two lists
 *
 * A resolved material tree can be merged two different ways, and they answer
 * different questions:
 *
 * - `shoppingListMaterials` drops materials the plan builds and returns only
 *   the purchasable leaves — the buy list.
 * - `materialTableRows` keeps built materials as rows — the display table.
 *
 * Merge the wrong one across members and the group double-counts: one member
 * buying Tritanium while another builds a component that also consumes it
 * would have that Tritanium land in the buy list twice. So the two lists stay
 * separate all the way through, and neither is ever folded into the other's
 * number. Both live in `features/industry/subBuildPlan.ts`, which this module
 * must not import (engine stays free of feature code), so the caller applies
 * them — which has the happy side effect of making the distinction visible at
 * the call site rather than buried here.
 *
 * ## What it deliberately does not do
 *
 * It does not re-net owned stock across the group, and it does not resolve a
 * mixture of trade hubs. Both are reported instead — see `overClaimed` and
 * `hubIds`.
 *
 * It is also a forward estimate only. Production Runs carry no group and
 * outlive their plans by design, so nothing here can say what a fit actually
 * cost once built.
 */

import type { BuildResult, MaterialCostLine } from './types';

/** One Build Plan's contribution to its group's totals. */
export interface BuildGroupMember {
  planId: string;
  planName: string;
  /** The plan's own trade hub. Materials are priced there, so a mixture matters. */
  hubId: string;
  result: BuildResult;
  /** `shoppingListMaterials(result.materials)` — purchasable leaves only. */
  shoppingMaterials: readonly MaterialCostLine[];
  /** `materialTableRows(result.materials)` — the whole tree, built rows kept. */
  tableMaterials: readonly MaterialCostLine[];
}

/** One material summed across every member that wants it. */
export interface GroupMaterialLine {
  typeID: number;
  /** Units the group consumes in total, before owned stock. */
  quantity: number;
  /** Units the members between them record as already owned. */
  ownedQuantity: number;
  /** Units still to acquire — the sum of the members' own remainders. */
  remainingQuantity: number;
  /**
   * The first real unit price any member had for this type.
   *
   * A price is a property of the type, not of where it was consumed, and
   * `null` only ever means "this member is building it" — so a built
   * occurrence must not blank the price of a row another member buys
   * outright. Same rule `subBuildPlan.ts`'s own merge follows.
   */
  unitPrice: number | null;
  /** Summed line costs. Owned units are free, so this prices the remainder. */
  lineCost: number;
  /** True when any contributing member could not price its remainder. */
  unpriced: boolean;
  /** Which members want it, in first-appearance order — so a row can name them. */
  planIds: string[];
}

export interface BuildGroupRollup {
  memberCount: number;
  /** The buy list: merged purchasable leaves. */
  shoppingMaterials: GroupMaterialLine[];
  /** The display table: merged whole tree, built rows kept. */
  tableMaterials: GroupMaterialLine[];
  /** Sum of member `materialCost` — each already includes its own sub-job fees. */
  materialCost: number;
  /**
   * Sum of each member's *own* job fee, and nothing below it. Named for what
   * it is: every descendant job's fee is already inside that member's
   * `materialCost`, so this is not the fee total the pilot pays, and a field
   * called `jobFeeTotal` would be a lie. `totalCost` is the honest total.
   */
  topLevelJobFees: number;
  /** Sum of member `totalCost`. The figure to lead with. */
  totalCost: number;
  /** Cost of buying every product outright; null when any member is unpriced. */
  buyCost: number | null;
  /**
   * Sum of member job durations — total job time, not wall-clock. Parallel job
   * slots are not modelled, so this is oven time rather than elapsed time.
   */
  seconds: number;
  /** Union of the members' blocking types. */
  unpricedMaterials: number[];
  /** True when any member is unpriceable. One bad member taints the total. */
  unpriceable: boolean;
  /** Distinct member hubs, in first-appearance order. */
  hubIds: string[];
  /** True when every member shares one hub — the only case a multibuy paste can work. */
  singleHub: boolean;
  /**
   * Materials the members between them claim to own more of than the Character
   * actually holds. Empty when no detection was supplied — an absent snapshot
   * is not evidence of an empty hangar.
   */
  overClaimed: number[];
}

export interface RollUpBuildGroupOptions {
  /**
   * Detected units per material typeID, across every location, unfiltered.
   * Used only to flag over-claiming; never to change a quantity.
   */
  detectedOwnedStock?: ReadonlyMap<number, number>;
}

function mergeMaterials(
  members: readonly BuildGroupMember[],
  pick: (m: BuildGroupMember) => readonly MaterialCostLine[]
): GroupMaterialLine[] {
  const merged = new Map<number, GroupMaterialLine>();
  for (const member of members) {
    for (const material of pick(member)) {
      const existing = merged.get(material.typeID);
      if (!existing) {
        merged.set(material.typeID, {
          typeID: material.typeID,
          quantity: material.quantity,
          ownedQuantity: material.ownedQuantity,
          remainingQuantity: material.remainingQuantity,
          unitPrice: material.unitPrice,
          lineCost: material.lineCost,
          unpriced: material.unpriced,
          planIds: [member.planId],
        });
        continue;
      }
      // Summed as each member's own job rounded them. EVE rounds material use
      // once per job, so two jobs each wanting 4.5 units cost 5 + 5, not 9 —
      // a merged quantity must never be re-derived from a combined run count.
      existing.quantity += material.quantity;
      existing.ownedQuantity += material.ownedQuantity;
      existing.remainingQuantity += material.remainingQuantity;
      existing.unitPrice = existing.unitPrice ?? material.unitPrice;
      existing.lineCost += material.lineCost;
      // One member unable to price its remainder makes the merged line's cost
      // an understatement, so the flag travels up rather than being averaged
      // away by members that priced fine.
      existing.unpriced = existing.unpriced || material.unpriced;
      if (!existing.planIds.includes(member.planId)) existing.planIds.push(member.planId);
    }
  }
  return [...merged.values()];
}

export function rollUpBuildGroup(
  members: readonly BuildGroupMember[],
  { detectedOwnedStock }: RollUpBuildGroupOptions = {}
): BuildGroupRollup {
  const shoppingMaterials = mergeMaterials(members, (m) => m.shoppingMaterials);
  const tableMaterials = mergeMaterials(members, (m) => m.tableMaterials);

  const hubIds: string[] = [];
  for (const member of members) {
    if (!hubIds.includes(member.hubId)) hubIds.push(member.hubId);
  }

  const unpricedMaterials = [...new Set(members.flatMap((m) => m.result.unpricedMaterials))];

  // Sum only while every member has a price: one null makes the total
  // unknowable, and a partial sum presented as a whole is worse than none.
  let buyCost: number | null = 0;
  for (const member of members) {
    if (member.result.buyCost === null) {
      buyCost = null;
      break;
    }
    buyCost += member.result.buyCost;
  }

  // Against the merged *buy list*, since that is where an owned unit actually
  // reduces spend. Compared with the unfiltered detection on purpose: each
  // member may scope its own detection to different locations, so the only
  // number both can be measured against is the whole hangar.
  const overClaimed = detectedOwnedStock
    ? shoppingMaterials
        .filter((m) => m.ownedQuantity > (detectedOwnedStock.get(m.typeID) ?? 0))
        .map((m) => m.typeID)
    : [];

  return {
    memberCount: members.length,
    shoppingMaterials,
    tableMaterials,
    materialCost: members.reduce((sum, m) => sum + m.result.materialCost, 0),
    topLevelJobFees: members.reduce((sum, m) => sum + m.result.jobFee.total, 0),
    totalCost: members.reduce((sum, m) => sum + m.result.totalCost, 0),
    buyCost,
    seconds: members.reduce((sum, m) => sum + m.result.seconds, 0),
    unpricedMaterials,
    unpriceable: members.some((m) => m.result.unpriceable),
    hubIds,
    // An empty group has no mixture to warn about, but also nothing to paste;
    // the caller gates the copy control on there being rows, as it already
    // does for a single plan whose materials are all owned.
    singleHub: hubIds.length <= 1,
    overClaimed,
  };
}
