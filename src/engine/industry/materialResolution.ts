/**
 * Recursive material resolution.
 *
 * `planSubBuild` already answers "what would it cost to run the job that
 * makes this one material" for a single level. This module is what happens
 * when the material that job consumes is *itself* something the player chose
 * to build: it resolves every material in a job's ingredient list the same
 * way, however many levels that reaches, and rolls each level's cost up into
 * the one it feeds.
 *
 * The recursion bottoms out on its own wherever the tree does: a material not
 * in `buildHere`, or one nothing in the SDE knows how to produce, is priced
 * as a normal purchase — `recipeFor` already carries that distinction (see
 * `materialRecipe`), so nothing here has to guess where "the tree does not go
 * further" (docs/context/decisions/20260904-235527, since superseded).
 *
 * Two guards exist purely as a safety valve, never as a feature: `visited`
 * refuses to build a material that is already its own ancestor on this branch
 * (a self-referencing blueprint should not exist in the SDE, but this must
 * never throw or loop if one did), and `MAX_SUB_BUILD_DEPTH` bounds how far a
 * pathological chain can recurse.
 *
 * A single unpriced leaf poisons every ancestor honestly rather than costing
 * it as free: `unitCost` (and therefore the parent's own `lineCost`) is
 * `null`, not 0, wherever a descendant bottoms out neither owned, priced, nor
 * itself buildable. Silently substituting 0 there would turn today's honest
 * "not enough price data" into a confidently wrong profit — strictly worse.
 *
 * Owned stock is one pool for the whole tree, not one per branch. The same
 * mineral can be a recipe input under two different sub-jobs (a battleship's
 * armor plate and its shield emitter both eating Tritanium, say), and stock
 * owned of it exists once, not once per branch that happens to consume it.
 * `ownedPool` is therefore a single mutable map threaded through every
 * recursive call: the first branch to reach a typeID claims what it needs
 * from the shared remainder, and later branches see only what's left —
 * exactly what merging every branch's raw quantity before clamping once
 * against owned stock would produce, without needing two passes over the
 * tree to do it.
 */

import type {
  EffectiveMaterial,
  HubPrices,
  IndustryBlueprint,
  MaterialCostLine,
  MaterialSourcingMap,
} from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { planSubBuild, type SubBuild, type SubBuildContext } from './subBuild';

/** Safety valve, not a design choice — see the module doc comment. */
export const MAX_SUB_BUILD_DEPTH = 10;

/** One material, priced as a purchase or as the rolled-up cost of building it. */
export interface ResolvedMaterial extends MaterialCostLine {
  /** Present only when this material is being produced rather than bought. */
  subBuild?: ResolvedSubBuild;
}

/** A planned sub-job whose own inputs have been resolved the same way, recursively. */
export interface ResolvedSubBuild extends Omit<SubBuild, 'inputs'> {
  inputs: ResolvedMaterial[];
  /** Sum of `inputs[].lineCost` — already recursively priced. */
  materialCost: number;
  /** This job's own installation fee plus every descendant job's fee. */
  totalFees: number;
  /** materialCost + totalFees. */
  totalCost: number;
  /** totalCost / unitsMade; null when a descendant bottoms out unpriced. */
  unitCost: number | null;
}

export interface ResolveMaterialOptions {
  /** Material typeIDs the player chose to build rather than buy, at any depth. */
  buildHere: ReadonlySet<number>;
  recipeFor: (typeID: number) => MaterialRecipe | null;
  /** What a recipe input costs to buy — the plan's own material price basis. */
  materialPrices: HubPrices;
  sourcing: MaterialSourcingMap | undefined;
  ctx: SubBuildContext;
  /** Ancestor typeIDs already being built on this branch — cycle guard. */
  visited?: ReadonlySet<number>;
  depth?: number;
  /**
   * Owned units not yet claimed by an earlier branch, by typeID — shared and
   * mutated across the whole call tree (see the module doc comment). Omitted
   * by a caller resolving one material in isolation, which then gets its own
   * pool seeded fresh from `sourcing` — safe because there is no sibling
   * branch for it to share stock with.
   */
  ownedPool?: Map<number, number>;
}

function usable(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Claims up to `quantity` units of `typeID` from the shared owned pool,
 * seeding the pool from `sourcing` the first time this typeID is reached.
 * Mutates `pool` — every subsequent claim across the tree sees the reduced
 * remainder, which is what keeps one physical stock from being credited to
 * two different branches that both consume it.
 */
function claimOwned(
  typeID: number,
  quantity: number,
  sourcing: MaterialSourcingMap | undefined,
  pool: Map<number, number>
): number {
  if (!pool.has(typeID)) {
    pool.set(typeID, usable(sourcing?.[typeID]?.ownedQuantity) ?? 0);
  }
  const available = Math.floor(pool.get(typeID) ?? 0);
  const claimed = Math.min(available, quantity);
  pool.set(typeID, available - claimed);
  return claimed;
}

/**
 * Resolves what one material actually costs the job that needs it.
 *
 * Never throws: bad blueprint data (an out-of-range ME, a runs count outside
 * the engine's bounds) falls back to pricing the material as bought — the
 * same "one bad recipe must not blank the table" contract `planSubBuild`
 * already keeps, now honoured at every depth rather than just the first.
 */
export function resolveMaterial(
  material: EffectiveMaterial,
  opts: ResolveMaterialOptions
): ResolvedMaterial {
  const {
    buildHere,
    recipeFor,
    materialPrices,
    sourcing,
    visited = new Set(),
    depth = 0,
    ownedPool = new Map<number, number>(),
  } = opts;
  const owned = claimOwned(material.typeID, material.quantity, sourcing, ownedPool);
  const remainingQuantity = material.quantity - owned;

  const eligible =
    remainingQuantity > 0 &&
    buildHere.has(material.typeID) &&
    depth < MAX_SUB_BUILD_DEPTH &&
    !visited.has(material.typeID);
  const recipe = eligible ? recipeFor(material.typeID) : null;

  if (recipe?.method === 'manufacturing') {
    const sub = resolveSubBuild(material.typeID, remainingQuantity, recipe.blueprint, recipe.me, {
      ...opts,
      visited: new Set([...visited, material.typeID]),
      depth: depth + 1,
      ownedPool,
    });
    if (sub) {
      return {
        ...material,
        ownedQuantity: owned,
        remainingQuantity,
        unitPrice: null,
        lineCost: sub.unitCost === null ? 0 : remainingQuantity * sub.unitCost,
        unpriced: sub.unitCost === null,
        subBuild: sub,
      };
    }
  }

  const overridePrice = sourcing?.[material.typeID]?.overridePrice;
  const unitPrice = usable(overridePrice) ?? usable(materialPrices[material.typeID]) ?? null;
  return {
    ...material,
    ownedQuantity: owned,
    remainingQuantity,
    unitPrice,
    lineCost: unitPrice === null ? 0 : remainingQuantity * unitPrice,
    unpriced: remainingQuantity > 0 && unitPrice === null,
  };
}

/** Plans one level's job, then resolves what it consumes — recursively. `null` mirrors `planSubBuild`'s own "nothing to plan" and error cases. */
function resolveSubBuild(
  typeID: number,
  needed: number,
  blueprint: IndustryBlueprint,
  me: number,
  opts: ResolveMaterialOptions
): ResolvedSubBuild | null {
  const sub = planSubBuild({ typeID, remainingQuantity: needed }, blueprint, me, opts.ctx);
  if (!sub) return null;

  const inputs = sub.inputs.map((input) => resolveMaterial(input, opts));
  const materialCost = inputs.reduce((sum, i) => sum + i.lineCost, 0);
  const descendantFees = inputs.reduce((sum, i) => sum + (i.subBuild?.totalFees ?? 0), 0);
  const totalFees = sub.jobFee.total + descendantFees;
  const totalCost = materialCost + totalFees;
  const poisoned = inputs.some((i) => i.unpriced);

  return {
    ...sub,
    inputs,
    materialCost,
    totalFees,
    totalCost,
    unitCost: poisoned ? null : totalCost / sub.unitsMade,
  };
}

/** Every sub-job's own installation fee, added up across the whole resolved tree. */
export function resolvedSubBuildFeeTotal(materials: readonly ResolvedMaterial[]): number {
  let total = 0;
  for (const material of materials) {
    if (material.subBuild) total += material.subBuild.totalFees;
  }
  return total;
}

/** Wall-clock every sub-job in the tree adds, added up — each level runs before its parent can start. */
export function resolvedSubBuildSeconds(materials: readonly ResolvedMaterial[]): number {
  let seconds = 0;
  for (const material of materials) {
    if (!material.subBuild) continue;
    seconds += material.subBuild.seconds + resolvedSubBuildSeconds(material.subBuild.inputs);
  }
  return seconds;
}

/**
 * The typeIDs actually blocking a price, at whatever depth they sit — never a
 * built material's own typeID standing in for whichever descendant of it is
 * really unpriced. A built row's `unpriced` flag only ever reflects its own
 * `subBuild.unitCost` being poisoned by something underneath it, so the real
 * culprit is always further down the tree; this walks past every built node
 * to find it, the same way a plan's own "what's blocking this" question
 * should be answered regardless of how many levels of building sit above it.
 */
export function unpricedLeafTypeIds(materials: readonly ResolvedMaterial[]): number[] {
  const ids: number[] = [];
  for (const material of materials) {
    if (!material.unpriced) continue;
    if (material.subBuild) ids.push(...unpricedLeafTypeIds(material.subBuild.inputs));
    else ids.push(material.typeID);
  }
  return ids;
}
