import type {
  EffectiveMaterial,
  FacilityContext,
  IndustryBlueprint,
} from '@/engine/industry/types';
import { effectiveMaterials } from '@/engine/industry/materials';
import {
  makeOrBuy,
  type MakeMethod,
  type MakeOrBuyContext,
  type MaterialRecipe,
} from '@/engine/industry/makeOrBuy';
import { MAX_SUB_BUILD_DEPTH } from '@/engine/industry/materialResolution';
import { sizeRuns } from '@/engine/industry/runSizing';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';

export type BuildStrategy = 'buy' | 'build' | 'cost-effective';

export interface AutoBuildHereOptions {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  ctx: MakeOrBuyContext;
  depth: number;
  runs: number;
  scope?: readonly MakeMethod[];
  strategy?: BuildStrategy;
  onSkillGated?: (typeID: number, verdict: Extract<SkillGateVerdict, { gated: true }>) => void;
}

interface WalkContext {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  ctx: MakeOrBuyContext;
  maxDepth: number;
}

export function facilityContextForNode(method: MakeMethod, ctx: MakeOrBuyContext): FacilityContext {
  return method === 'reaction' && ctx.reactionFacility ? ctx.reactionFacility : ctx;
}

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
        const sizing = sizeRuns(material.quantity, recipe.blueprint.products[0]?.quantity ?? 0);
        if (!sizing) continue;
        const subME = recipe.method === 'manufacturing' ? recipe.me : 0;
        const inputs = effectiveMaterials(
          recipe.blueprint,
          sizing.runs,
          subME,
          facilityContextForNode(recipe.method, wctx.ctx)
        );
        walkMaterials(inputs, depth + 1, subVisited, wctx, visitMaterial);
      }
    } catch {}
  }
}

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
        return !(decision === 'buy' && inScope);
      }
    );
  } catch {}
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
    if (verdict?.skillGate) opts.onSkillGated?.(material.typeID, verdict.skillGate);
    return verdict?.verdict === 'build' ? 'build' : 'buy';
  }
}

export interface AutoBuildDepthOptions {
  recipeFor: (typeID: number) => MaterialRecipe | null;
  ctx: MakeOrBuyContext;
  runs: number;
}

export function maxAutoBuildDepth(
  blueprint: IndustryBlueprint,
  me: number,
  opts: AutoBuildDepthOptions
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
  } catch {}
  return deepest;
}
