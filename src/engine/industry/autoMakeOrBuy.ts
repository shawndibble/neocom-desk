/**
 * Craft Sweep engine (issue #694, generalized from issue #652's Auto Build
 * Depth): decides, without the player marking anything, which materials in a
 * build's tree to mark buildable — walking down to a chosen depth, within a
 * chosen Craft Scope (which production methods may be marked buildable), by
 * a chosen Sweep Strategy (how to decide build-or-buy within that scope).
 * Unrelated to Opportunities' own order-book "depth" (`classifyOrderDepth`).
 *
 * The only depth ceiling left is `MAX_SUB_BUILD_DEPTH`
 * (`materialResolution.ts`) — the recursive engine's own safety valve against
 * a pathological chain, not a size chosen for this feature.
 * `MAX_AUTO_BUILD_DEPTH` still exists, but only to size Build Opportunities'
 * own 0-3 depth control; it no longer clamps this walk.
 *
 * A material outside the given Craft Scope (or forced to buy by the `buy`
 * strategy) is never marked buildable, but the walk still recurses into that
 * material's own recipe inputs looking for further in-scope materials
 * beneath it — reaction and planetary are treated identically, neither
 * special-cased over the other (see the Craft Scope scope decision).
 *
 * Reuses `makeOrBuy`'s per-material cost compare for the `cost-effective`
 * strategy rather than inventing a second cost engine: the result is a plain
 * typeID set that feeds straight into a plan's `buildHere`
 * (`resolveMaterial`/`buildVsBuy` already know how to cost that recursively),
 * so the actual owned-stock and job-fee accounting a chosen plan settles on
 * is exactly what a pilot would get by ticking the same boxes by hand.
 */

import type { EffectiveMaterial, IndustryBlueprint } from '@/engine/industry/types';
import { effectiveMaterials } from '@/engine/industry/materials';
import {
  makeOrBuy,
  type MakeMethod,
  type MakeOrBuyContext,
  type MaterialRecipe,
} from '@/engine/industry/makeOrBuy';
import { MAX_SUB_BUILD_DEPTH } from '@/engine/industry/materialResolution';
import { sizeRuns } from '@/engine/industry/runSizing';

/** Build Opportunities' own UI-sizing constant only — see the module doc comment. */
export const MAX_AUTO_BUILD_DEPTH = 3;

/**
 * Which rule decides build-or-buy for a material within Craft Scope: `buy`
 * (force buy), `build` (force craft), or `cost-effective` (build only where
 * cheaper — Auto Build Depth's own heuristic, and the default here).
 */
export type SweepStrategy = 'buy' | 'build' | 'cost-effective';

export interface AutoBuildHereOptions {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  ctx: MakeOrBuyContext;
  /** Player-chosen depth; 0 disables the pass, clamped to `MAX_SUB_BUILD_DEPTH`. */
  depth: number;
  /**
   * Runs the job will actually be sized to. Job fees amortize per job, not
   * per unit (`materials.ts`'s per-job rounding, `makeOrBuy.test.ts`'s "sizes
   * the job to what is left to buy" case) — quoting every verdict at 1 run
   * regardless of the real count would decide build-or-buy at a different
   * scale than the recursive engine actually bills once `buildHere` is
   * applied, occasionally flipping a marginal verdict.
   */
  runs: number;
  /**
   * Production methods this walk may mark buildable. Defaults to
   * manufacturing-only — Build Opportunities' own scope, and
   * `resolveMaterial` silently ignores a `buildHere` entry for a reaction or
   * planetary material there, so widening this default would name a typeID
   * that caller then does nothing with.
   */
  scope?: readonly MakeMethod[];
  /** Defaults to `'cost-effective'` — Build Opportunities' own heuristic. */
  strategy?: SweepStrategy;
}

interface WalkContext {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  ctx: MakeOrBuyContext;
  maxDepth: number;
}

/**
 * Shared depth-first descent through a material's own recipe inputs,
 * cycle-safe per branch. `visitMaterial` decides what to record for each
 * material reached and whether to keep descending beneath it; the descent
 * shape itself (planetary schematics vs. blueprints, per-job run-sizing,
 * the never-throw contract) is identical for every caller, so it lives here
 * once rather than being reimplemented per feature — see the module doc
 * comment on why this file avoids a second tree-walker.
 */
function walkMaterials(
  materials: readonly EffectiveMaterial[],
  depth: number,
  visited: ReadonlySet<number>,
  wctx: WalkContext,
  visitMaterial: (material: EffectiveMaterial, recipe: MaterialRecipe, depth: number) => boolean
): void {
  if (depth >= wctx.maxDepth) return;
  for (const material of materials) {
    if (visited.has(material.typeID)) continue;
    const recipe = wctx.recipeFor(material.typeID);
    if (!recipe) continue;

    const recurse = visitMaterial(material, recipe, depth);
    if (!recurse) continue;

    try {
      const subVisited = new Set([...visited, material.typeID]);
      if (recipe.method === 'planetary') {
        const sizing = sizeRuns(material.quantity, recipe.outputQuantity);
        if (!sizing) continue;
        const inputs: EffectiveMaterial[] = recipe.inputs.map((input) => ({
          typeID: input.typeID,
          baseQuantity: input.quantity * sizing.runs,
          quantity: input.quantity * sizing.runs,
        }));
        walkMaterials(inputs, depth + 1, subVisited, wctx, visitMaterial);
      } else {
        // Same "runs to cover what's needed" sizing `jobUnitCost` used to
        // reach a cost-effective verdict — the child's own material list
        // must reflect the job actually being evaluated, not an arbitrary
        // single run. Reaction formulas are always ME0 (module doc on
        // `MaterialRecipe`'s reaction variant).
        const sizing = sizeRuns(material.quantity, recipe.blueprint.products[0]?.quantity ?? 0);
        if (!sizing) continue;
        const subME = recipe.method === 'manufacturing' ? recipe.me : 0;
        const inputs = effectiveMaterials(recipe.blueprint, sizing.runs, subME, wctx.ctx);
        walkMaterials(inputs, depth + 1, subVisited, wctx, visitMaterial);
      }
    } catch {
      // Never-throw contract — bad recipe data below this material must not
      // blank the row. Its own build/buy decision above already stands
      // regardless of whether recursing beneath it succeeds.
    }
  }
}

/**
 * Materials chosen to auto-build, at any level within the requested depth.
 * Depth counts the same way `materialResolution.ts`'s recursion does: the
 * product's own materials sit at depth 0, so a depth of 1 evaluates only
 * those, a depth of 2 also evaluates the materials of whichever of those got
 * picked, and so on. Never throws — bad blueprint data (an out-of-range ME,
 * a self-referencing recipe) is skipped rather than crashing the row.
 */
export function autoBuildHere(
  blueprint: IndustryBlueprint,
  me: number,
  opts: AutoBuildHereOptions
): Set<number> {
  const buildHere = new Set<number>();
  const scope = opts.scope ?? ['manufacturing'];
  const strategy = opts.strategy ?? 'cost-effective';
  const maxDepth = Math.min(MAX_SUB_BUILD_DEPTH, Math.max(0, Math.round(opts.depth)));
  if (maxDepth <= 0) return buildHere;

  const runs = Math.max(1, Math.round(opts.runs));
  try {
    walkMaterials(
      effectiveMaterials(blueprint, runs, me, opts.ctx),
      0,
      new Set(),
      { recipeFor: opts.recipeFor, ctx: opts.ctx, maxDepth },
      (material, recipe) => {
        const inScope = scope.includes(recipe.method);
        const decision = !inScope ? 'buy' : decide(material, recipe);
        if (decision === 'build') {
          buildHere.add(material.typeID);
        }
        // A material chosen to build is recursed into the same way it
        // always was. A material outside Craft Scope is recursed into too —
        // it was never a build/buy cost decision to begin with, so it can't
        // "dead end" the way a genuine buy verdict does; there may be
        // further in-scope materials beneath it. A material bought on cost,
        // or forced to buy by the `buy` strategy, still ends the branch
        // here.
        return !(decision === 'buy' && inScope);
      }
    );
  } catch {
    // materialModifier range-checks ME; bad data must not blank the row.
  }
  return buildHere;

  function decide(material: EffectiveMaterial, recipe: MaterialRecipe): 'build' | 'buy' {
    if (strategy === 'build') return 'build';
    if (strategy === 'buy') return 'buy';
    const unitPrice = opts.ctx.materialPrices[material.typeID] ?? null;
    const verdict = makeOrBuy(
      {
        ...material,
        ownedQuantity: 0,
        remainingQuantity: material.quantity,
        unitPrice,
        lineCost: 0,
        unpriced: unitPrice === null,
      },
      recipe,
      opts.ctx
    );
    return verdict?.verdict === 'build' ? 'build' : 'buy';
  }
}

export interface SweepDepthOptions {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  ctx: MakeOrBuyContext;
  /** Runs the job would actually be sized to, matching `AutoBuildHereOptions.runs`. */
  runs: number;
}

/**
 * Deepest level a plan's own material tree actually reaches, for sizing a
 * Craft Sweep's Sweep Depth control to the plan rather than to a fixed
 * range. Counts the same way `autoBuildHere` does — depth 1 means only the
 * product's own materials have a recipe, depth 2 means at least one of
 * those has a recipe of its own, and so on — and, like `autoBuildHere`,
 * keeps walking beneath a material regardless of Craft Scope: Sweep Depth
 * bounds how far a sweep can reach, not which materials within reach are
 * eligible to build, so depth discovery must not undercount a tree whose
 * eligible materials sit beneath a reaction or planetary step. Capped at
 * `MAX_SUB_BUILD_DEPTH`. Never throws.
 */
export function maxSweepDepth(
  blueprint: IndustryBlueprint,
  me: number,
  opts: SweepDepthOptions
): number {
  let deepest = 0;
  const runs = Math.max(1, Math.round(opts.runs));
  try {
    walkMaterials(
      effectiveMaterials(blueprint, runs, me, opts.ctx),
      0,
      new Set(),
      { recipeFor: opts.recipeFor, ctx: opts.ctx, maxDepth: MAX_SUB_BUILD_DEPTH },
      (_material, _recipe, depth) => {
        deepest = Math.max(deepest, depth + 1);
        return true;
      }
    );
  } catch {
    // materialModifier range-checks ME; bad data must not blank the result.
  }
  return deepest;
}
