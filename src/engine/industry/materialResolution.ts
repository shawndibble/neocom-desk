import type {
  AcquisitionResolution,
  AcquisitionTier,
  EffectiveMaterial,
  HubPrices,
  IndustryBlueprint,
  MaterialCostLine,
  MaterialSourcingMap,
} from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { planSubBuild, type SubBuild, type SubBuildContext } from './subBuild';

export const MAX_SUB_BUILD_DEPTH = 10;

export interface ResolvedMaterial extends MaterialCostLine {
  subBuild?: ResolvedSubBuild;
  acquisitionTier?: AcquisitionTier;
}

export interface ResolvedSubBuild extends Omit<SubBuild, 'inputs'> {
  inputs: ResolvedMaterial[];
  materialCost: number;
  totalFees: number;
  totalCost: number;
  unitCost: number | null;
}

export interface ResolveMaterialOptions {
  buildHere: ReadonlySet<number>;
  recipeFor: (typeID: number) => MaterialRecipe | null;
  materialPrices: HubPrices;
  sourcing: MaterialSourcingMap | undefined;
  ctx: SubBuildContext;
  reactionCtx?: SubBuildContext;
  visited?: ReadonlySet<number>;
  depth?: number;
  ownedPool?: Map<number, number>;
  acquisitionFor?: (
    productTypeID: number,
    needed: number,
    ctx: SubBuildContext,
    materialPrices: HubPrices
  ) => AcquisitionResolution | null;
}

export function usable(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function withoutOwnedQuantities(
  sourcing: MaterialSourcingMap | undefined
): MaterialSourcingMap | undefined {
  if (!sourcing) return sourcing;
  const stripped: MaterialSourcingMap = {};
  for (const [typeID, entry] of Object.entries(sourcing)) {
    stripped[Number(typeID)] =
      entry.overridePrice === undefined ? {} : { overridePrice: entry.overridePrice };
  }
  return stripped;
}

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

  if (recipe?.method === 'manufacturing' || recipe?.method === 'reaction') {
    const subCtx = recipe.method === 'reaction' ? (opts.reactionCtx ?? opts.ctx) : opts.ctx;
    const acquisition =
      opts.acquisitionFor?.(material.typeID, remainingQuantity, subCtx, opts.materialPrices) ??
      null;
    const me = acquisition ? acquisition.me : recipe.method === 'manufacturing' ? recipe.me : 0;
    const sub = resolveSubBuild(
      material.typeID,
      remainingQuantity,
      recipe.blueprint,
      me,
      subCtx,
      {
        ...opts,
        visited: new Set([...visited, material.typeID]),
        depth: depth + 1,
        ownedPool,
      },
      acquisition
    );
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

export function acquisitionMaterialFor(
  acquisition: AcquisitionResolution,
  overridePrice: number | undefined
): ResolvedMaterial | null {
  if (!acquisition.line) return null;
  const resolvedOverride = usable(overridePrice);
  const quantity = acquisition.line.owned ? 1 : (acquisition.line.quantity ?? 1);
  const remainingQuantity = acquisition.line.owned ? 0 : quantity;
  const unitPrice = resolvedOverride ?? acquisition.line.unitPrice;
  return {
    typeID: acquisition.blueprintTypeID,
    baseQuantity: quantity,
    quantity,
    ownedQuantity: quantity - remainingQuantity,
    remainingQuantity,
    unitPrice,
    lineCost: remainingQuantity * (unitPrice ?? 0),
    unpriced: remainingQuantity > 0 && unitPrice === null,
    acquisitionTier: {
      me: acquisition.me,
      te: acquisition.te,
      ...(acquisition.line.community ? { community: acquisition.line.community } : {}),
      ...(acquisition.line.invented ? { invented: true as const } : {}),
      ...(acquisition.copyOnly ? { copyOnly: true as const } : {}),
      ...(acquisition.line.pool
        ? {
            pool: {
              ...acquisition.line.pool,
              copyPrice: resolvedOverride ?? acquisition.line.pool.copyPrice,
            },
          }
        : {}),
    },
  };
}

function resolveSubBuild(
  typeID: number,
  needed: number,
  blueprint: IndustryBlueprint,
  me: number,
  ctx: SubBuildContext,
  opts: ResolveMaterialOptions,
  acquisition: AcquisitionResolution | null = null
): ResolvedSubBuild | null {
  const sub = planSubBuild({ typeID, remainingQuantity: needed }, blueprint, me, ctx);
  if (!sub) return null;

  const acquisitionMaterial = acquisition
    ? acquisitionMaterialFor(
        acquisition,
        opts.sourcing?.[acquisition.blueprintTypeID]?.overridePrice
      )
    : null;

  const inputs = acquisitionMaterial
    ? [acquisitionMaterial, ...sub.inputs.map((input) => resolveMaterial(input, opts))]
    : sub.inputs.map((input) => resolveMaterial(input, opts));
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

export function resolvedSubBuildSeconds(materials: readonly ResolvedMaterial[]): number {
  let seconds = 0;
  for (const material of materials) {
    if (!material.subBuild) continue;
    seconds += material.subBuild.seconds + resolvedSubBuildSeconds(material.subBuild.inputs);
  }
  return seconds;
}

export function unpricedLeafTypeIds(materials: readonly ResolvedMaterial[]): number[] {
  const ids: number[] = [];
  for (const material of materials) {
    if (!material.unpriced) continue;
    if (material.subBuild) ids.push(...unpricedLeafTypeIds(material.subBuild.inputs));
    else ids.push(material.typeID);
  }
  return ids;
}
