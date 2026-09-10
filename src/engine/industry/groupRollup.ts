/**
 * What a **Build Group** totals to (issue #626, "Group Rollup" in CONTEXT.md):
 * every member's materials merged by type, and the costs summed.
 *
 * Pure, like the rest of `src/engine`. The caller hands in each member's
 * `BuildResult` — one per plan, priced at that plan's own hub/ME/facility —
 * plus its two flattened material lists, and gets one set of group figures
 * back.
 *
 * ## Owned stock is the group's own ledger now, not each member's (issue #697)
 *
 * Each member's `BuildResult` here must be re-resolved with owned-stock
 * deduction disabled (`materialResolution.ts`'s `withoutOwnedQuantities` on
 * the plan's own `materialSourcing`, fed back through `buildVsBuy`) — never
 * the same `BuildResult` a member's own page shows, which still nets its own
 * `materialSourcing.ownedQuantity`. This function's own owned-stock opinion
 * comes entirely from `RollUpBuildGroupOptions.ownedStock`, the **Group
 * Owned Overlay**'s ledger, applied once here — see `applyOwnedLedger`.
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
 * The ledger nets against both lists independently — same ledger quantity,
 * each list's own merged quantity — since they are alternate views of the
 * same total rather than two pools to spend it from. Only the buy list's
 * saving ever reaches `materialCost`/`totalCost`, though: a built row's
 * netting is display-only (see `applyOwnedLedger` and `materialCost` below).
 *
 * ## What it deliberately does not do
 *
 * It does not resolve a mixture of trade hubs — reported instead, see
 * `hubIds`. A mixture is split rather than resolved: `shoppingByHub` is the
 * same buy list partitioned by the hub each unit is bought at, so a pilot with
 * plans at two hubs pastes twice instead of not at all (issue #631). Nothing
 * is moved between hubs to make that tidier — the hub is the plan's fact, and
 * a group that quietly re-homed a member would be a second writer for it.
 * `shoppingByHub` is **not** netted against the ledger — which hub's paste
 * should shrink when the group owns a unit is not a fact this module has, so
 * the per-hub blocks stay the raw, un-netted split; only the single merged
 * `shoppingMaterials` (and the whole-group copy control it feeds) reflects
 * the ledger.
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
}

export interface RollUpBuildGroupOptions {
  /**
   * The Group Owned Overlay's ledger (issue #697): units of each typeID the
   * group itself owns, by typeID. Nets against the merged `shoppingMaterials`
   * and `tableMaterials` — see the module doc. Omitted or empty leaves every
   * merged line exactly as the members produced it.
   */
  ownedStock?: ReadonlyMap<number, number>;
}

/**
 * One merged line, netted against `ledgerQuantity` units of the group's own
 * ledger — clamped into `[0, quantity]`, the same rule `claimOwned` applies
 * per-material in `materialResolution.ts`, but against an already-merged line
 * rather than by walking a tree.
 *
 * `unitPrice` known: `lineCost` is recomputed exactly, `remainingQuantity x
 * unitPrice`. `unitPrice` null (a built row, or a leaf with no market price):
 * there is no per-unit price to multiply, so the existing `lineCost` is
 * scaled by the new remaining fraction — an approximation for a built row
 * (job fees and run rounding are not linear), acceptable only because this
 * path is display-only for such rows (see `materialCost` below).
 */
function applyOwnedLedger(line: MaterialCostLine, ledgerQuantity: number): MaterialCostLine {
  const ownedQuantity = Math.min(Math.max(ledgerQuantity, 0), line.quantity);
  const remainingQuantity = line.quantity - ownedQuantity;
  const priorRemaining = line.remainingQuantity;
  const lineCost =
    line.unitPrice !== null
      ? remainingQuantity * line.unitPrice
      : priorRemaining > 0
        ? (remainingQuantity / priorRemaining) * line.lineCost
        : 0;
  return {
    ...line,
    ownedQuantity,
    remainingQuantity,
    lineCost,
    // A line the ledger now fully covers has nothing left to price, the same
    // rule `resolveMaterial` applies when a claim from owned stock alone
    // zeroes the remainder.
    unpriced: remainingQuantity > 0 && line.unpriced,
  };
}

function nettedAgainstLedger(
  materials: readonly MaterialCostLine[],
  ownedStock: ReadonlyMap<number, number> | undefined
): MaterialCostLine[] {
  if (!ownedStock) return [...materials];
  return materials.map((m) => applyOwnedLedger(m, ownedStock.get(m.typeID) ?? 0));
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
  { ownedStock }: RollUpBuildGroupOptions = {}
): BuildGroupRollup {
  const rawShoppingMaterials = mergeMaterials(members, (m) => m.shoppingMaterials);
  const tableMaterials = nettedAgainstLedger(
    mergeMaterials(members, (m) => m.tableMaterials),
    ownedStock
  );
  const shoppingMaterials = nettedAgainstLedger(rawShoppingMaterials, ownedStock);

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

  // The buy list is the one cost authority the ledger ever adjusts (see
  // module doc): what it saved is the gap between each merged buy-list line
  // before and after netting, and that gap — never the table's — is what
  // comes off materialCost. Members already carry `materialCost`/`jobFee`
  // computed with owned-stock deduction disabled, so summing those first and
  // then subtracting the ledger's saving is the one place ownership is
  // deducted, matching how a single plan's own `materialCost` already has its
  // own owned stock netted in exactly once.
  const ownedSaving = rawShoppingMaterials.reduce(
    (sum, raw, i) => sum + (raw.lineCost - shoppingMaterials[i]!.lineCost),
    0
  );
  const materialCost = members.reduce((sum, m) => sum + m.result.materialCost, 0) - ownedSaving;
  const topLevelJobFees = members.reduce((sum, m) => sum + m.result.jobFee.total, 0);

  // `member.result.unpriceable` is computed against the owned-disabled tree,
  // before the ledger's netting — so a material the ledger now fully covers
  // must not still count. A member's *product* having no hub price is a
  // separate cause `unpriceable` bundles in (`buildVsBuy.ts`'s
  // `!productPriced`) that the ledger can never fix; decomposed here as "the
  // member is unpriceable and named no unpriced material", since
  // `unpricedMaterials` is empty in exactly that case.
  const productUnpriceable = members.some(
    (m) => m.result.unpriceable && m.result.unpricedMaterials.length === 0
  );
  const unpriceable = productUnpriceable || tableMaterials.some((m) => m.unpriced);

  return {
    shoppingMaterials,
    tableMaterials,
    materialCost,
    topLevelJobFees,
    totalCost: materialCost + topLevelJobFees,
    buyCost,
    seconds: members.reduce((sum, m) => sum + m.result.seconds, 0),
    unpriceable,
    shoppingByHub,
    hubIds,
    // An empty group has no mixture to warn about, but also nothing to paste;
    // the caller gates the copy control on there being rows, as it already
    // does for a single plan whose materials are all owned. A mixture is no
    // longer a dead end — it is `shoppingByHub`, one paste per hub — so this
    // now says only whether one paste covers the whole group.
    singleHub: hubIds.length <= 1,
  };
}
