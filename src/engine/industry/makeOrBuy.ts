/**
 * Make-or-buy for a single material of a build plan: is producing this one
 * material yourself cheaper than acquiring it the way the plan currently
 * assumes? One level deep only — the recipe's own inputs are priced at the
 * hub, never recursively costed (CONTEXT.md round 29).
 *
 * Deliberately not `buildVsBuy`'s `recommendation`, which asks a different
 * question: that one is "build this to sell", so it nets sales tax and broker
 * fee out of a hub sale. A material gets consumed by the parent job, never
 * listed, so neither fee is ever paid on it.
 */

import type {
  AdjustedPrices,
  FacilityPreset,
  HubPrices,
  IndustryBlueprint,
  MaterialCostLine,
  QuantityEntry,
  RigLevel,
  SecurityBand,
  SkillLevels,
} from '@/engine/industry/types';
import { buildVsBuy } from '@/engine/industry/buildVsBuy';

export type MakeMethod = 'manufacturing' | 'planetary';

/**
 * How a material is produced. A single value rather than a list: no type in
 * the SDE is both manufactured from a blueprint and produced by a planetary
 * schematic (verified against blueprints.json/pi.json — zero overlap).
 */
export type MaterialRecipe =
  | {
      method: 'manufacturing';
      blueprint: IndustryBlueprint;
      /** ME of the copy the character owns, else 0 — the same rule the ME field's "Owned" hint shows. */
      me: number;
    }
  | {
      method: 'planetary';
      /** Units the schematic yields per cycle. */
      outputQuantity: number;
      inputs: readonly QuantityEntry[];
    };

/** Where the hypothetical sub-job would run: the parent plan's own facility and market. */
export interface MakeOrBuyContext {
  facility: FacilityPreset;
  rig: RigLevel;
  security: SecurityBand;
  facilityTaxPct?: number;
  systemCostIndex: number;
  adjustedPrices: AdjustedPrices;
  /** Must already cover the recipe's inputs, not just the plan's own materials. */
  hubPrices: HubPrices;
  skills: SkillLevels;
}

export interface MakeOrBuy {
  method: MakeMethod;
  verdict: 'build' | 'buy';
  /** All-in cost of producing one unit. */
  makeUnitPrice: number;
  /** What one unit costs the plan as it stands: the material's override price, else the hub's. */
  buyUnitPrice: number;
  /** What the verdict is worth across the units still to be acquired; 0 for a fully owned row. */
  savings: number;
  /** ME the manufacturing quote assumes; null for a planetary one, which has no equivalent. */
  me: number | null;
}

/**
 * Cost per unit of manufacturing the material, sized to a real job.
 *
 * Runs matter: EVE rounds material use once per job, not per run, and the job
 * fee is a fixed proportion of EIV, so quoting a single run would overstate a
 * material the plan needs hundreds of. `null` when an input has no price —
 * a partial cost would read as a suspiciously cheap build.
 */
function manufacturingUnitCost(
  blueprint: IndustryBlueprint,
  me: number,
  needed: number,
  ctx: MakeOrBuyContext
): number | null {
  const product = blueprint.products[0];
  if (!product || product.quantity <= 0) return null;
  const runs = Math.max(1, Math.ceil(needed / product.quantity));
  // TE is irrelevant to cost, so the cheapest honest value is passed.
  const result = buildVsBuy({
    blueprint,
    runs,
    me,
    te: 0,
    facility: ctx.facility,
    rig: ctx.rig,
    security: ctx.security,
    facilityTaxPct: ctx.facilityTaxPct,
    systemCostIndex: ctx.systemCostIndex,
    adjustedPrices: ctx.adjustedPrices,
    hubPrices: ctx.hubPrices,
    skills: ctx.skills,
  });
  // Not `unpriceable`: that also trips when the *product* — the material we
  // are pricing — has no hub listing, which says nothing about build cost.
  if (result.unpricedMaterials.length > 0) return null;
  return result.totalCost / (product.quantity * runs);
}

/**
 * Cost per unit of running the planetary schematic: its inputs at the hub,
 * spread over one cycle's output. There is no ISK installation fee in
 * planetary industry; the planet, its extractors and the customs-office
 * export tax are all outside this number.
 */
function planetaryUnitCost(
  inputs: readonly QuantityEntry[],
  outputQuantity: number,
  hubPrices: HubPrices
): number | null {
  if (inputs.length === 0 || outputQuantity <= 0) return null;
  let total = 0;
  for (const input of inputs) {
    const price = hubPrices[input.typeID];
    if (price === undefined) return null;
    total += price * input.quantity;
  }
  return total / outputQuantity;
}

/**
 * Whether to make or buy one material. `null` — no advice rather than bad
 * advice — whenever nothing produces the material, the material itself has no
 * price to beat, or a price the comparison needs is missing.
 */
export function makeOrBuy(
  material: MaterialCostLine,
  recipe: MaterialRecipe | null,
  ctx: MakeOrBuyContext
): MakeOrBuy | null {
  if (!recipe) return null;
  const buyUnitPrice = material.unitPrice;
  if (buyUnitPrice === null) return null;

  // A fully owned row has nothing left to acquire, so it is quoted at the
  // whole requirement instead: the per-unit verdict still answers "was
  // stockpiling this the right call", it just has no money riding on it.
  const needed = material.remainingQuantity > 0 ? material.remainingQuantity : material.quantity;

  let makeUnitPrice: number | null;
  try {
    makeUnitPrice =
      recipe.method === 'manufacturing'
        ? manufacturingUnitCost(recipe.blueprint, recipe.me, needed, ctx)
        : planetaryUnitCost(recipe.inputs, recipe.outputQuantity, ctx.hubPrices);
  } catch {
    // The engine range-checks ME and runs. A blueprint or an owned-ME value
    // outside those bounds is bad data, not a reason to fail the whole table.
    return null;
  }
  if (makeUnitPrice === null || !Number.isFinite(makeUnitPrice)) return null;

  return {
    method: recipe.method,
    verdict: makeUnitPrice < buyUnitPrice ? 'build' : 'buy',
    makeUnitPrice,
    buyUnitPrice,
    savings: Math.abs(buyUnitPrice - makeUnitPrice) * material.remainingQuantity,
    me: recipe.method === 'manufacturing' ? recipe.me : null,
  };
}
