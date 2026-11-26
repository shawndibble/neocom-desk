import type {
  AcquisitionResolution,
  HubPrices,
  IndustryBlueprint,
  MaterialSourcing,
  MaterialSourcingMap,
  QuantityEntry,
} from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { MAX_SUB_BUILD_DEPTH, usable } from '@/engine/industry/materialResolution';
import { effectiveMaterials } from '@/engine/industry/materials';
import { clampMe } from '@/engine/industry/efficiency';
import { isCopyOnlyBlueprint } from '@/engine/industry/copyOnlyBlueprints';
import { sizeRuns } from '@/engine/industry/runSizing';
import type { SubBuildContext } from '@/engine/industry/subBuild';
import {
  claimBlueprintTier,
  pooledOwnedCopies,
  resolveTierOption,
  selectBlueprintTier,
  tierOptions,
  type BpcOffer,
  type SelectBlueprintTierInputs,
  type OwnedBlueprintPool,
} from '@/engine/industry/blueprintAcquisition';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { findOwnedBlueprint } from './data';

export interface RecipeCatalog {
  catalog: BlueprintCatalog;
  pi: PiData | null;
}

export interface RecipeSources extends RecipeCatalog {
  ownedBlueprints: readonly CharacterBlueprint[];
  assumedMeForUnowned?: number;
  blueprintAcquisition?: BlueprintAcquisitionSources;
}

export interface BlueprintAcquisitionSources {
  offersFor: (blueprintTypeID: number) => readonly BpcOffer[];
  extraOffersFor?: (blueprintTypeID: number) => readonly BpcOffer[];
  lastResortOffersFor?: (blueprintTypeID: number) => readonly BpcOffer[];
  communityOffersFor?: (blueprintTypeID: number) => readonly BpcOffer[];
  hubPrices: HubPrices;
  sourcing?: MaterialSourcingMap;
}

function recipeInputs(typeID: number, sources: RecipeCatalog): readonly QuantityEntry[] | null {
  const entry = sources.catalog.byProductTypeID.get(typeID);
  if (entry) return entry.blueprint.materials;
  const schematic = sources.pi?.schematics[String(typeID)];
  return schematic ? schematic.inputs : null;
}

function materialEfficiencyFor(
  blueprintTypeID: number,
  ownedBlueprints: readonly CharacterBlueprint[],
  assumedMeForUnowned: number
): number {
  const owned = findOwnedBlueprint(ownedBlueprints, blueprintTypeID);
  return clampMe(owned ? owned.material_efficiency : assumedMeForUnowned);
}

export function materialRecipe(typeID: number, sources: RecipeSources): MaterialRecipe | null {
  const entry = sources.catalog.byProductTypeID.get(typeID);
  if (entry) {
    if (entry.blueprint.activity === 'reaction') {
      return { method: 'reaction', blueprint: toIndustryBlueprint(entry.blueprint) };
    }
    return {
      method: 'manufacturing',
      blueprint: toIndustryBlueprint(entry.blueprint),
      me: materialEfficiencyFor(
        entry.blueprintTypeID,
        sources.ownedBlueprints,
        sources.assumedMeForUnowned ?? 0
      ),
    };
  }
  const schematic = sources.pi?.schematics[String(typeID)];
  if (schematic) {
    return {
      method: 'planetary',
      outputQuantity: schematic.quantity,
      inputs: schematic.inputs.map(({ typeID: id, quantity }) => ({ typeID: id, quantity })),
    };
  }
  return null;
}

export function recipeForLookup(sources: RecipeSources): (typeID: number) => MaterialRecipe | null {
  return (typeID) => materialRecipe(typeID, sources);
}

function ownedCopiesFor(
  blueprintTypeID: number,
  ownedBlueprints: readonly CharacterBlueprint[]
): { me: number; te: number; runs: number }[] {
  return ownedBlueprints
    .filter((b) => b.type_id === blueprintTypeID)
    .map((b) => ({ me: clampMe(b.material_efficiency), te: b.time_efficiency, runs: b.runs }));
}

function materialCostAtMeFor(
  blueprint: IndustryBlueprint,
  neededUnits: number,
  ctx: SubBuildContext,
  materialPrices: HubPrices
): (me: number) => number | null {
  const product = blueprint.products[0];
  const sizing = product ? sizeRuns(neededUnits, product.quantity) : null;
  return (me) => {
    if (!sizing) return null;
    try {
      let total = 0;
      for (const material of effectiveMaterials(blueprint, sizing.runs, me, ctx)) {
        const price = materialPrices[material.typeID];
        if (price === undefined) return null;
        total += price * material.quantity;
      }
      return total;
    } catch {
      return null;
    }
  };
}

export type BlueprintTierPools = Map<number, OwnedBlueprintPool>;

export function cloneBlueprintPools(pools: BlueprintTierPools): BlueprintTierPools {
  const cloned: BlueprintTierPools = new Map();
  for (const [typeID, pool] of pools) cloned.set(typeID, new Map(pool));
  return cloned;
}

export function acquisitionForLookup(
  sources: RecipeSources,
  blueprintPools: BlueprintTierPools = new Map()
): (
  productTypeID: number,
  needed: number,
  ctx: SubBuildContext,
  materialPrices: HubPrices
) => AcquisitionResolution | null {
  return (productTypeID, needed, ctx, materialPrices) => {
    const acquisitionSources = sources.blueprintAcquisition;
    if (!acquisitionSources) return null;
    const entry = sources.catalog.byProductTypeID.get(productTypeID);
    if (!entry) return null;

    const blueprint = toIndustryBlueprint(entry.blueprint);
    const blueprintTypeID = entry.blueprintTypeID;
    const isReaction = entry.blueprint.activity === 'reaction';
    const purchasable = (offers: readonly BpcOffer[]) =>
      isReaction ? offers.filter((offer) => offer.runs === -1) : offers;

    let pool = blueprintPools.get(blueprintTypeID);
    if (!pool) {
      pool = new Map();
      blueprintPools.set(blueprintTypeID, pool);
    }

    const sizing = sizeRuns(needed, blueprint.products[0]?.quantity ?? 0);
    if (!sizing) return null;
    const neededRuns = sizing.runs;
    const tierInputs: SelectBlueprintTierInputs = {
      ownedCopies: pooledOwnedCopies(
        ownedCopiesFor(blueprintTypeID, sources.ownedBlueprints),
        pool
      ),
      neededRuns,
      materialCostAtMe: materialCostAtMeFor(blueprint, needed, ctx, materialPrices),
      bpcOffers: purchasable(acquisitionSources.offersFor(blueprintTypeID)),
      extraOffers: purchasable(acquisitionSources.extraOffersFor?.(blueprintTypeID) ?? []),
      lastResortOffers: purchasable(
        acquisitionSources.lastResortOffersFor?.(blueprintTypeID) ?? []
      ),
      communityOffers: isReaction ? [] : acquisitionSources.communityOffersFor?.(blueprintTypeID),
      bpoSellPrice: acquisitionSources.hubPrices[blueprintTypeID] ?? null,
      copyOnly: isCopyOnlyBlueprint(blueprintTypeID),
      assumedMeForUnowned: sources.assumedMeForUnowned ?? 0,
    };

    const override = acquisitionSources.sourcing?.[blueprintTypeID]?.acquisitionTierOverride;
    const resolveInputs = override ? inputsForOverride(tierInputs, override) : tierInputs;
    let resolved;
    if (override) {
      const matched = tierOptions(resolveInputs).find(
        (o) => o.me === override.me && o.te === override.te
      );
      resolved = matched
        ? resolveTierOption(matched, neededRuns)
        : { me: override.me, te: override.te, line: { unitPrice: null, owned: false } };
    } else {
      resolved = selectBlueprintTier(tierInputs);
    }
    const tier = resolved.line
      ? tierOptions(resolveInputs).find((o) => o.me === resolved.me && o.te === resolved.te)
      : undefined;
    const line = tier
      ? {
          ...resolved.line!,
          pool: {
            neededRuns,
            ownedRuns: tier.ownedRuns,
            copyRuns: tier.extend ? tier.extend.capacityRuns : null,
            copyPrice: tier.extend ? tier.extend.price : null,
          },
        }
      : resolved.line;
    claimBlueprintTier(pool, resolved, neededRuns);

    return {
      me: resolved.me,
      te: resolved.te,
      blueprintTypeID,
      line,
      coverage: resolved.coverage,
      ...(resolved.copyOnly ? { copyOnly: true as const } : {}),
    };
  };
}

function inputsForOverride(
  inputs: SelectBlueprintTierInputs,
  override: NonNullable<MaterialSourcing['acquisitionTierOverride']>
): SelectBlueprintTierInputs {
  const invented = override.invented;
  if (!invented) {
    return { ...inputs, extraOffers: inputs.extraOffers?.filter((offer) => !offer.invented) };
  }
  return {
    ...inputs,
    bpcOffers: [],
    bpoSellPrice: null,
    lastResortOffers: [],
    communityOffers: [],
    extraOffers: inputs.extraOffers?.filter(
      (offer) => offer.invented && offer.runs === invented.runs
    ),
  };
}

export function verdictAcquisitionFor(
  sources: RecipeSources
): ReturnType<typeof acquisitionForLookup> {
  return (...args) => {
    const resolved = acquisitionForLookup(sources)(...args);
    if (!resolved?.line || resolved.line.owned) return resolved;
    const override = usable(
      sources.blueprintAcquisition?.sourcing?.[resolved.blueprintTypeID]?.overridePrice
    );
    return override === undefined
      ? resolved
      : { ...resolved, line: { ...resolved.line, unitPrice: override } };
  };
}

export function recipeInputTypeIds(typeIDs: readonly number[], sources: RecipeCatalog): number[] {
  const ids = new Set<number>();
  for (const typeID of typeIDs) {
    for (const input of recipeInputs(typeID, sources) ?? []) ids.add(input.typeID);
  }
  return [...ids];
}

export function buildPlanTypeIds(blueprint: IndustryBlueprint, sources: RecipeCatalog): number[] {
  const ids = new Set(blueprint.materials.map((m) => m.typeID));
  const product = blueprint.products[0];
  if (product) ids.add(product.typeID);

  let frontier = [...ids];
  for (let depth = 0; depth < MAX_SUB_BUILD_DEPTH && frontier.length > 0; depth++) {
    const next = recipeInputTypeIds(frontier, sources).filter((id) => !ids.has(id));
    for (const id of next) ids.add(id);
    frontier = next;
  }

  for (const typeID of [...ids]) {
    const entry = sources.catalog.byProductTypeID.get(typeID);
    if (entry) ids.add(entry.blueprintTypeID);
  }

  return [...ids];
}
