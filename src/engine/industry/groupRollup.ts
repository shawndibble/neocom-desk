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
 * `hubIds`. A mixture is split rather than resolved: `shoppingByHub` is the
 * same buy list partitioned by the hub each unit is bought at, so a pilot with
 * plans at two hubs pastes twice instead of not at all (issue #631). Nothing
 * is moved between hubs to make that tidier — the hub is the plan's fact, and
 * a group that quietly re-homed a member would be a second writer for it.
 *
 * It is also a forward estimate only. Production Runs carry no group and
 * outlive their plans by design, so nothing here can say what a fit actually
 * cost once built.
 */

import { mergeCostLines } from './mergeCostLines';
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

/** One hub's share of the group buy list — what to paste into multibuy there. */
export interface HubShoppingList {
  hubId: string;
  materials: MaterialCostLine[];
}

export interface BuildGroupRollup {
  /**
   * The buy list: merged purchasable leaves. An ordinary `MaterialCostLine` —
   * a merged line is the same shape as the lines merged into it, and every
   * field means there what it means on one member.
   */
  shoppingMaterials: MaterialCostLine[];
  /** The display table: merged whole tree, built rows kept. */
  tableMaterials: MaterialCostLine[];
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
  /** True when any member is unpriceable. One bad member taints the total. */
  unpriceable: boolean;
  /**
   * The buy list partitioned by hub — one block per distinct member hub, in
   * first-appearance order, each merged the same way `shoppingMaterials` is.
   * Multibuy is per station, so this is the shape a mixed-hub group is
   * actually pasteable in: one block, one station, one paste.
   *
   * Every unit of `shoppingMaterials` appears in exactly one block: the blocks
   * partition the members, and a member's materials are all bought at that
   * member's hub. A block whose materials are all owned is still listed, so
   * the hub is named; the caller decides whether there is anything to copy.
   */
  shoppingByHub: HubShoppingList[];
  /**
   * Distinct member hubs, in first-appearance order. Derived from
   * `shoppingByHub` rather than accumulated alongside it — one fact, one
   * writer, so a hub can never be warned about without a block to paste.
   */
  hubIds: string[];
  /** True when every member shares one hub — the only case a single paste covers the group. */
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
): MaterialCostLine[] {
  const merged = new Map<number, MaterialCostLine>();
  for (const member of members) {
    for (const material of pick(member)) {
      const existing = merged.get(material.typeID);
      merged.set(material.typeID, existing ? mergeCostLines(existing, material) : { ...material });
    }
  }
  return [...merged.values()];
}

/**
 * The members grouped by hub, in first-appearance order, each group's buy list
 * merged. Built from the members themselves rather than by re-splitting the
 * merged list, which could not be done: once two hubs' lines are merged, the
 * quantity no longer records where any of it was bought.
 */
function shoppingListsByHub(members: readonly BuildGroupMember[]): HubShoppingList[] {
  const byHub = new Map<string, BuildGroupMember[]>();
  for (const member of members) {
    const existing = byHub.get(member.hubId);
    if (existing) existing.push(member);
    else byHub.set(member.hubId, [member]);
  }
  return [...byHub].map(([hubId, hubMembers]) => ({
    hubId,
    materials: mergeMaterials(hubMembers, (m) => m.shoppingMaterials),
  }));
}

export function rollUpBuildGroup(
  members: readonly BuildGroupMember[],
  { detectedOwnedStock }: RollUpBuildGroupOptions = {}
): BuildGroupRollup {
  const shoppingMaterials = mergeMaterials(members, (m) => m.shoppingMaterials);
  const tableMaterials = mergeMaterials(members, (m) => m.tableMaterials);

  const shoppingByHub = shoppingListsByHub(members);
  const hubIds = shoppingByHub.map((block) => block.hubId);

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
    shoppingMaterials,
    tableMaterials,
    materialCost: members.reduce((sum, m) => sum + m.result.materialCost, 0),
    topLevelJobFees: members.reduce((sum, m) => sum + m.result.jobFee.total, 0),
    totalCost: members.reduce((sum, m) => sum + m.result.totalCost, 0),
    buyCost,
    seconds: members.reduce((sum, m) => sum + m.result.seconds, 0),
    unpriceable: members.some((m) => m.result.unpriceable),
    shoppingByHub,
    hubIds,
    // An empty group has no mixture to warn about, but also nothing to paste;
    // the caller gates the copy control on there being rows, as it already
    // does for a single plan whose materials are all owned. A mixture is no
    // longer a dead end — it is `shoppingByHub`, one paste per hub — so this
    // now says only whether one paste covers the whole group.
    singleHub: hubIds.length <= 1,
    overClaimed,
  };
}
