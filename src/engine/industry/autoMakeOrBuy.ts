/**
 * Auto make-or-buy depth (issue #652): decides, without the player marking
 * anything, which materials in a build's tree are cheaper to build than buy
 * — down to a small, player-chosen depth (0-3). Unrelated to Opportunities'
 * own order-book "depth" (`classifyOrderDepth`), and much smaller than
 * `materialResolution.ts`'s `MAX_SUB_BUILD_DEPTH`, which exists only to stop
 * a pathological chain, not to size a feature.
 *
 * Reuses `makeOrBuy`'s per-material cost compare at each level rather than
 * inventing a second cost engine: the result is a plain typeID set that feeds
 * straight into a plan's `buildHere` (`resolveMaterial`/`buildVsBuy` already
 * know how to cost that recursively), so the actual owned-stock and job-fee
 * accounting a chosen plan settles on is exactly what a pilot would get by
 * ticking the same boxes by hand.
 *
 * Only ever offers a manufacturing recipe: `resolveMaterial` silently ignores
 * a `buildHere` entry for a reaction or planetary material (ME0 minerals and
 * PI schematics are not recursively built there either), so auto-picking one
 * here would name a typeID the real plan then does nothing with.
 */

import type { EffectiveMaterial, IndustryBlueprint } from '@/engine/industry/types';
import { effectiveMaterials } from '@/engine/industry/materials';
import { makeOrBuy, type MakeOrBuyContext, type MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { sizeRuns } from '@/engine/industry/runSizing';

/** A feature-sized bound, not a safety valve — see the module doc comment. */
export const MAX_AUTO_BUILD_DEPTH = 3;

export interface AutoBuildHereOptions {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  ctx: MakeOrBuyContext;
  /** Player-chosen depth; 0 disables the pass, clamped to `MAX_AUTO_BUILD_DEPTH`. */
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
  const maxDepth = Math.min(MAX_AUTO_BUILD_DEPTH, Math.max(0, Math.round(opts.depth)));
  if (maxDepth <= 0) return buildHere;

  const runs = Math.max(1, Math.round(opts.runs));
  try {
    visit(effectiveMaterials(blueprint, runs, me, opts.ctx), 0, new Set());
  } catch {
    // materialModifier range-checks ME; bad data must not blank the row.
  }
  return buildHere;

  function visit(
    materials: readonly EffectiveMaterial[],
    depth: number,
    visited: ReadonlySet<number>
  ): void {
    if (depth >= maxDepth) return;
    for (const material of materials) {
      if (visited.has(material.typeID)) continue;
      const recipe = opts.recipeFor(material.typeID);
      if (!recipe || recipe.method !== 'manufacturing') continue;

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
      if (verdict?.verdict !== 'build') continue;

      buildHere.add(material.typeID);
      try {
        // Same "runs to cover what's needed" sizing `jobUnitCost` used to
        // reach this verdict — the child's own material list must reflect
        // the job actually being evaluated, not an arbitrary single run.
        const sizing = sizeRuns(material.quantity, recipe.blueprint.products[0]?.quantity ?? 0);
        if (!sizing) continue;
        const inputs = effectiveMaterials(recipe.blueprint, sizing.runs, recipe.me, opts.ctx);
        visit(inputs, depth + 1, new Set([...visited, material.typeID]));
      } catch {
        // Same "never throw" contract — this material still counts as built.
      }
    }
  }
}
