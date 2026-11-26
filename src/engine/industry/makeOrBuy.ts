import type {
  AdjustedPrices,
  FacilityPreset,
  HubPrices,
  IndustryBlueprint,
  IndustryInputs,
  MaterialCostLine,
  QuantityEntry,
  ReactionFacilityContext,
  RigFit,
  SecurityBand,
  SkillLevels,
} from '@/engine/industry/types';
import { EMPTY_RIG_FIT, FACILITY_PRESETS } from '@/engine/industry/types';
import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { acquisitionMaterialFor } from '@/engine/industry/materialResolution';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { sizeRuns } from '@/engine/industry/runSizing';
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';

export type MakeMethod = 'manufacturing' | 'planetary' | 'reaction';

export type MaterialRecipe =
  | {
      method: 'manufacturing';
      blueprint: IndustryBlueprint;
      me: number;
    }
  | {
      method: 'planetary';
      outputQuantity: number;
      inputs: readonly QuantityEntry[];
    }
  | {
      method: 'reaction';
      blueprint: IndustryBlueprint;
    };

export interface MakeOrBuyContext {
  facility: FacilityPreset;
  rigFit: RigFit;
  security: SecurityBand;
  facilityTaxPct?: number;
  systemCostIndex: number;
  regionalTaxPct?: number;
  adjustedPrices: AdjustedPrices;
  materialPrices: HubPrices;
  modifiers: CharacterModifiers;
  reactionFacility?: ReactionFacilityContext;
  accountSkills?: ReadonlyMap<number, SkillLevels>;
  acquisitionFor?: NonNullable<IndustryInputs['acquisitionFor']>;
}

export interface MakeOrBuy {
  method: MakeMethod;
  verdict: 'build' | 'buy';
  makeUnitPrice: number;
  buyUnitPrice: number;
  savings: number;
  me: number | null;
  blueprintCost: number;
  skillGate?: Extract<SkillGateVerdict, { gated: true }>;
}

interface JobQuote {
  unitCost: number;
  me: number | null;
  blueprintCost: number;
}

function jobUnitCost(
  blueprint: IndustryBlueprint,
  recipeMe: number,
  needed: number,
  ctx: MakeOrBuyContext
): JobQuote | null {
  const product = blueprint.products[0];
  if (!product) return null;
  const sizing = sizeRuns(needed, product.quantity);
  if (!sizing) return null;
  const { runs } = sizing;
  const acquisition = ctx.acquisitionFor?.(product.typeID, needed, ctx, ctx.materialPrices) ?? null;
  const me = acquisition?.me ?? recipeMe;
  const row = acquisition ? acquisitionMaterialFor(acquisition, undefined) : null;
  if (row?.unpriced) return null;
  const blueprintCost = row?.lineCost ?? 0;
  const result = buildVsBuy({
    blueprint,
    runs,
    me,
    te: 0,
    facility: ctx.facility,
    rigFit: ctx.rigFit,
    security: ctx.security,
    facilityTaxPct: ctx.facilityTaxPct,
    systemCostIndex: ctx.systemCostIndex,
    regionalTaxPct: ctx.regionalTaxPct,
    adjustedPrices: ctx.adjustedPrices,
    hubPrices: ctx.materialPrices,
    modifiers: ctx.modifiers,
  });
  if (result.unpricedMaterials.length > 0) return null;
  return {
    unitCost: (result.totalCost + blueprintCost) / (product.quantity * runs),
    me,
    blueprintCost,
  };
}

function reactionUnitCost(
  blueprint: IndustryBlueprint,
  needed: number,
  ctx: MakeOrBuyContext
): JobQuote | null {
  const location = ctx.reactionFacility;
  const ownFacilityIsReaction = ctx.facility.activity === 'reaction';
  return jobUnitCost(blueprint, 0, needed, {
    ...ctx,
    facility:
      location?.facility ?? (ownFacilityIsReaction ? ctx.facility : FACILITY_PRESETS.athanor),
    rigFit: location?.rigFit ?? (ownFacilityIsReaction ? ctx.rigFit : EMPTY_RIG_FIT),
    security: location?.security ?? ctx.security,
    facilityTaxPct: location?.facilityTaxPct ?? ctx.facilityTaxPct,
    systemCostIndex: location?.systemCostIndex ?? ctx.systemCostIndex,
    regionalTaxPct: undefined,
  });
}

function planetaryUnitCost(
  inputs: readonly QuantityEntry[],
  outputQuantity: number,
  materialPrices: HubPrices
): number | null {
  if (inputs.length === 0 || outputQuantity <= 0) return null;
  let total = 0;
  for (const input of inputs) {
    const price = materialPrices[input.typeID];
    if (price === undefined) return null;
    total += price * input.quantity;
  }
  return total / outputQuantity;
}

export function makeOrBuy(
  material: MaterialCostLine,
  recipe: MaterialRecipe | null,
  ctx: MakeOrBuyContext
): MakeOrBuy | null {
  if (!recipe) return null;
  const buyUnitPrice = material.unitPrice;
  if (buyUnitPrice === null) return null;

  const needed = material.remainingQuantity > 0 ? material.remainingQuantity : material.quantity;

  let quote: JobQuote | null;
  try {
    if (recipe.method === 'planetary') {
      const unitCost = planetaryUnitCost(recipe.inputs, recipe.outputQuantity, ctx.materialPrices);
      quote = unitCost === null ? null : { unitCost, me: null, blueprintCost: 0 };
    } else {
      quote =
        recipe.method === 'manufacturing'
          ? jobUnitCost(recipe.blueprint, recipe.me, needed, ctx)
          : reactionUnitCost(recipe.blueprint, needed, ctx);
    }
  } catch {
    return null;
  }
  if (quote === null || !Number.isFinite(quote.unitCost)) return null;
  const makeUnitPrice = quote.unitCost;

  const blueprintSkills = recipe.method !== 'planetary' ? recipe.blueprint.skills : undefined;
  const skillGateVerdict =
    blueprintSkills && ctx.accountSkills
      ? evaluateSkillGate(blueprintSkills, ctx.accountSkills)
      : null;
  const skillGate = skillGateVerdict?.gated ? skillGateVerdict : undefined;

  return {
    method: recipe.method,
    verdict: skillGate ? 'buy' : makeUnitPrice < buyUnitPrice ? 'build' : 'buy',
    makeUnitPrice,
    buyUnitPrice,
    savings: Math.abs(buyUnitPrice - makeUnitPrice) * material.remainingQuantity,
    me: recipe.method === 'manufacturing' ? quote.me : null,
    blueprintCost: quote.blueprintCost,
    ...(skillGate ? { skillGate } : {}),
  };
}
