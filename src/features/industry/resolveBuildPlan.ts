import { applyCostIndexOverride } from './costIndexOverride';
import i18n from '@/i18n';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { BuildPlanRecord } from '@/db';
import { MAX_JOB_RUNS } from '@/engine/industry/types';
import type {
  AcquisitionResolution,
  BuildResult,
  HubPrices,
  IndustryBlueprint,
  ReactionFacilityContext,
} from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { MakeOrBuyContext } from '@/engine/industry/makeOrBuy';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { clampInt } from './clampInt';
import { computeBuildPlan } from './computeBuildPlan';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import { applyProductSalePrice, capProductPrice } from './productPriceCap';
import type { MarketSnapshot } from './marketData';
import { facilityContextFor, reactionPlanFacilityContextFor } from './planFacilityContext';
import { buyOrderFeePct } from '@/engine/industry/buyOrderPrices';
import { materialPriceBasisOf, materialPricesFor } from './priceBasis';
import {
  inventionOffersLookup,
  type InventionMarket,
  type InventionPricingContext,
} from './inventionSources';
import {
  acquisitionForLookup,
  cloneBlueprintPools,
  recipeForLookup,
  verdictAcquisitionFor,
  type BlueprintTierPools,
  type RecipeSources,
} from './recipes';

export type CorpBlueprintSource = Pick<CorpOwnedBlueprintsState, 'available' | 'blueprints'>;

export interface BuildPlanSources {
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  corpBlueprints?: CorpBlueprintSource;
  assumedMe: number;
  modifiers: CharacterModifiers;
  standing?: ResolvedStandings;
  bpcOffersFor: (blueprintTypeID: number) => readonly BpcOffer[];
  bpcLastResortOffersFor?: (blueprintTypeID: number) => readonly BpcOffer[];
  blueprintPurchaseOffersFor?: (blueprintTypeID: number) => readonly BpcOffer[];
  communityOffersFor?: (blueprintTypeID: number) => readonly BpcOffer[];
  inventionMarket?: InventionMarket | null;
}

export interface BuildPlanPrices {
  snapshot: MarketSnapshot | null;
  reactionSystemCostIndex?: number | null;
  depthPrices?: HubPrices;
}

export interface ResolveBuildPlanOptions {
  withGroupResult?: boolean;
}

export interface ResolvedBuildPlan {
  result: BuildResult | null;
  error: string | null;
  groupResult: BuildResult | null;
  groupError: string | null;
  resolvedMe: number;
  resolvedTe: number;
  bpcCoverage: { coveredRuns: number; neededRuns: number } | null;
  makeOrBuyContext: MakeOrBuyContext | null;
  materialPrices: HubPrices;
}

export function planOwnedBlueprints(
  plan: Pick<BuildPlanRecord, 'includeCorpAssets'>,
  ownedBlueprints: readonly CharacterBlueprint[],
  corpBlueprints: CorpBlueprintSource | undefined
): readonly CharacterBlueprint[] {
  return (plan.includeCorpAssets ?? false) &&
    corpBlueprints?.available &&
    corpBlueprints.blueprints.length > 0
    ? [...ownedBlueprints, ...corpBlueprints.blueprints]
    : ownedBlueprints;
}

function reactionFacilityFor(
  plan: Parameters<typeof reactionPlanFacilityContextFor>[0],
  reactionSystemCostIndex: number | null | undefined
): ReactionFacilityContext | undefined {
  const location = reactionPlanFacilityContextFor(plan);
  return location && reactionSystemCostIndex != null
    ? { ...location, systemCostIndex: reactionSystemCostIndex }
    : undefined;
}

function resolveTopLevelTier(
  plan: Pick<BuildPlanRecord, 'me' | 'te' | 'runs'>,
  blueprint: IndustryBlueprint,
  acquisitionFor: ReturnType<typeof acquisitionForLookup>,
  ctx: MakeOrBuyContext | null,
  materialPrices: HubPrices
): { me: number; te: number; acquisition: AcquisitionResolution | null } {
  const product = blueprint.products[0];
  const acquisition =
    product && ctx
      ? acquisitionFor(
          product.typeID,
          clampInt(plan.runs, 1, MAX_JOB_RUNS) * product.quantity,
          ctx,
          materialPrices
        )
      : null;
  return { me: acquisition?.me ?? plan.me, te: acquisition?.te ?? plan.te, acquisition };
}

export function inventionPricingContextFor(
  plan: BuildPlanRecord,
  sources: Pick<
    BuildPlanSources,
    'catalog' | 'inventionMarket' | 'ownedBlueprints' | 'corpBlueprints' | 'modifiers'
  >,
  snapshot: MarketSnapshot | null
): InventionPricingContext | null {
  const market = sources.inventionMarket;
  const copyingCostIndex = snapshot?.copyingCostIndex;
  const inventionCostIndex = snapshot?.inventionCostIndex;
  if (
    !market ||
    !snapshot?.adjustedPrices ||
    copyingCostIndex == null ||
    inventionCostIndex == null
  ) {
    return null;
  }
  const { facility, facilityTaxPct } = facilityContextFor(plan);
  return {
    market,
    catalog: sources.catalog,
    ownedBlueprints: planOwnedBlueprints(plan, sources.ownedBlueprints, sources.corpBlueprints),
    skills: sources.modifiers.skills,
    facility,
    facilityTaxPct,
    adjustedPrices: snapshot.adjustedPrices,
    copyingCostIndex,
    inventionCostIndex,
  };
}

function extraOffersFor(
  plan: BuildPlanRecord,
  sources: BuildPlanSources,
  snapshot: MarketSnapshot | null
): ((blueprintTypeID: number) => readonly BpcOffer[]) | undefined {
  const purchase = sources.blueprintPurchaseOffersFor;
  const inventionCtx = inventionPricingContextFor(plan, sources, snapshot);
  if (!inventionCtx) return purchase;
  const invented = inventionOffersLookup(inventionCtx);
  return (blueprintTypeID) => [
    ...(purchase?.(blueprintTypeID) ?? []),
    ...invented(blueprintTypeID),
  ];
}

function prepareResolution(
  plan: BuildPlanRecord,
  sources: BuildPlanSources,
  prices: BuildPlanPrices
) {
  const productTypeID = sources.catalog.byBlueprintTypeID.get(plan.blueprintTypeID)?.productTypeID;
  const snapshot = applyProductSalePrice(
    applyCostIndexOverride(
      capProductPrice(prices.snapshot, productTypeID).snapshot,
      plan.costIndexOverridePct
    ),
    productTypeID,
    plan.productSalePrice
  );
  const ownedBlueprints = planOwnedBlueprints(
    plan,
    sources.ownedBlueprints,
    sources.corpBlueprints
  );
  const recipeSources: RecipeSources = {
    catalog: sources.catalog,
    pi: sources.pi,
    ownedBlueprints,
    assumedMeForUnowned: sources.assumedMe,
    blueprintAcquisition: {
      offersFor: sources.bpcOffersFor,
      extraOffersFor: extraOffersFor(plan, sources, snapshot),
      lastResortOffersFor: sources.bpcLastResortOffersFor,
      communityOffersFor: sources.communityOffersFor,
      hubPrices: snapshot?.hubPrices ?? {},
      sourcing: plan.materialSourcing,
    },
  };
  const recipeFor = recipeForLookup(recipeSources);
  const basePrices = materialPricesFor(
    snapshot,
    plan.materialPriceBasis,
    buyOrderFeePct(sources.modifiers.skills, sources.standing)
  );
  const materialPrices =
    prices.depthPrices && materialPriceBasisOf(plan.materialPriceBasis) === 'sell'
      ? { ...basePrices, ...prices.depthPrices }
      : basePrices;
  const reactionFacility = reactionFacilityFor(plan, prices.reactionSystemCostIndex);
  const makeOrBuyContext: MakeOrBuyContext | null =
    snapshot && snapshot.adjustedPrices !== null && snapshot.systemCostIndex !== null
      ? {
          ...facilityContextFor(plan),
          systemCostIndex: snapshot.systemCostIndex,
          regionalTaxPct: snapshot.regionalTaxPct,
          adjustedPrices: snapshot.adjustedPrices,
          materialPrices,
          modifiers: sources.modifiers,
          reactionFacility,
          acquisitionFor: verdictAcquisitionFor(recipeSources),
        }
      : null;
  return {
    snapshot,
    recipeSources,
    recipeFor,
    materialPrices,
    reactionFacility,
    makeOrBuyContext,
  };
}

export interface MakeOrBuyResolution {
  blueprint: IndustryBlueprint;
  recipeFor: ReturnType<typeof recipeForLookup>;
  ctx: MakeOrBuyContext;
  me: number;
  te: number;
}

export function resolveMakeOrBuy(
  plan: BuildPlanRecord,
  sources: BuildPlanSources,
  prices: BuildPlanPrices
): MakeOrBuyResolution | null {
  const { recipeSources, recipeFor, materialPrices, makeOrBuyContext } = prepareResolution(
    plan,
    sources,
    prices
  );
  const catalogEntry = sources.catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
  if (!catalogEntry || !makeOrBuyContext) return null;
  const blueprint = toIndustryBlueprint(catalogEntry.blueprint);
  const { me, te } = resolveTopLevelTier(
    plan,
    blueprint,
    acquisitionForLookup(recipeSources, new Map()),
    makeOrBuyContext,
    materialPrices
  );
  return { blueprint, recipeFor, ctx: makeOrBuyContext, me, te };
}

export function resolveBuildPlan(
  plan: BuildPlanRecord,
  sources: BuildPlanSources,
  prices: BuildPlanPrices,
  options: ResolveBuildPlanOptions = {}
): ResolvedBuildPlan {
  const { snapshot, recipeSources, recipeFor, materialPrices, reactionFacility, makeOrBuyContext } =
    prepareResolution(plan, sources, prices);

  const base = {
    groupResult: null,
    groupError: null,
    makeOrBuyContext,
    materialPrices,
    bpcCoverage: null,
  };

  const catalogEntry = sources.catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
  if (!catalogEntry) {
    return {
      ...base,
      result: null,
      error: i18n.t('industry.blueprintMissing'),
      resolvedMe: plan.me,
      resolvedTe: plan.te,
    };
  }
  const blueprint = toIndustryBlueprint(catalogEntry.blueprint);

  const blueprintPools: BlueprintTierPools = new Map();
  const acquisitionForPass = (pools: BlueprintTierPools) =>
    acquisitionForLookup(recipeSources, pools);
  const acquisitionFor = acquisitionForPass(blueprintPools);

  const {
    me: resolvedMe,
    te: resolvedTe,
    acquisition: topLevelAcquisition,
  } = resolveTopLevelTier(plan, blueprint, acquisitionFor, makeOrBuyContext, materialPrices);
  const blueprintAcquisition = topLevelAcquisition
    ? { blueprintTypeID: topLevelAcquisition.blueprintTypeID, line: topLevelAcquisition.line }
    : undefined;
  const poolsAfterTopLevel = options.withGroupResult ? cloneBlueprintPools(blueprintPools) : null;

  const common = {
    plan: { ...plan, me: resolvedMe, te: resolvedTe },
    blueprint,
    systemCostIndex: snapshot?.systemCostIndex ?? 0,
    regionalTaxPct: snapshot?.regionalTaxPct,
    adjustedPrices: snapshot?.adjustedPrices ?? {},
    hubPrices: snapshot?.hubPrices ?? {},
    materialPrices,
    modifiers: sources.modifiers,
    standing: sources.standing,
    recipeFor,
    blueprintAcquisition,
    reactionFacility,
  };
  const { result, error } = computeBuildPlan({ ...common, acquisitionFor });

  let groupResult: BuildResult | null = null;
  let groupError: string | null = null;
  if (poolsAfterTopLevel) {
    ({ result: groupResult, error: groupError } = computeBuildPlan({
      ...common,
      acquisitionFor: acquisitionForPass(poolsAfterTopLevel),
      ignoreOwnedStock: true,
    }));
  }

  return {
    ...base,
    result,
    error,
    groupResult,
    groupError,
    resolvedMe,
    resolvedTe,
    bpcCoverage: topLevelAcquisition?.coverage ?? null,
  };
}
