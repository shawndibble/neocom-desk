import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { craftScope } from '@/engine/industry/craftScope';
import type { IndustryActivity } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { planPriceReadiness } from './planPriceReadiness';
import { materialPriceBasisOf } from './priceBasis';
import { useInputCostMove } from './useInputCostMove';
import { useOwnedSale } from './useOwnedSale';
import { usePlanMarketSnapshots } from './usePlanMarketSnapshots';
import { usePlanMaterials } from './usePlanMaterials';
import type { usePlanPricing } from './usePlanPricing';
import { usePlanRecipes } from './usePlanRecipes';
import { useResolvedPlan } from './useResolvedPlan';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';

const NO_MATERIALS: readonly ResolvedMaterial[] = [];

interface PlanResolutionInput {
  plan: BuildPlanRecord;
  catalog: BlueprintCatalog;
  pi: PiData | null;
  activity: IndustryActivity;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  pricing: ReturnType<typeof usePlanPricing>;
  productTypeID: number | null;
  craftScopeList: ReturnType<typeof craftScope>;
  buildSystemId: number | undefined;
  reactionBuildSystemId: number | undefined;
  refreshTick: number;
}

export function usePlanResolution({
  plan,
  catalog,
  pi,
  activity,
  ownedBlueprints,
  modifiers,
  pricing,
  productTypeID,
  craftScopeList,
  buildSystemId,
  reactionBuildSystemId,
  refreshTick,
}: PlanResolutionInput) {
  const {
    hub,
    assumedMe,
    corpBlueprints,
    standing,
    bpcOffersFor,
    bpcLastResortOffersFor,
    communityOffersFor,
    typeIds,
    blueprintPurchaseOffersFor,
    inventionMarket,
    blueprintOffersReady,
  } = pricing;
  const { snapshot, costIndexMissing, fetchedAt, pricesLoading, reactionSnapshot } =
    usePlanMarketSnapshots(
      hub,
      typeIds,
      buildSystemId,
      reactionBuildSystemId,
      activity,
      plan.costIndexOverridePct,
      productTypeID,
      plan.productSalePrice,
      refreshTick
    );

  const { effectiveOwnedBlueprints, recipeFor, canBuildHere } = usePlanRecipes(
    plan,
    catalog,
    pi,
    ownedBlueprints,
    corpBlueprints,
    assumedMe,
    craftScopeList
  );

  const { resolved, depth, resolveAt, resolveQuantitiesAt } = useResolvedPlan({
    plan,
    hub,
    sources: {
      catalog,
      pi,
      ownedBlueprints,
      corpBlueprints,
      assumedMe,
      modifiers,
      standing,
      bpcOffersFor,
      bpcLastResortOffersFor,
      blueprintPurchaseOffersFor,
      inventionMarket,
      communityOffersFor,
    },
    snapshot,
    reactionSystemCostIndex: reactionSnapshot?.systemCostIndex,
    fetchedAtMs: fetchedAt?.getTime(),
  });
  const { result, makeOrBuyContext, materialPrices } = resolved;
  const costMove = useInputCostMove(
    hub.regionId,
    productTypeID,
    result?.materials ?? NO_MATERIALS,
    materialPriceBasisOf(plan.materialPriceBasis)
  );

  const ownedSale = useOwnedSale(result, snapshot, modifiers, standing);

  const { pricesUnreachable, pricesReady } = planPriceReadiness(snapshot, blueprintOffersReady);

  const materials = usePlanMaterials({
    result,
    catalog,
    depth,
    materialSourcing: plan.materialSourcing,
    materialPrices,
    makeOrBuyContext,
    recipeFor,
  });

  return {
    snapshot,
    costIndexMissing,
    fetchedAt,
    pricesLoading,
    effectiveOwnedBlueprints,
    recipeFor,
    canBuildHere,
    resolved,
    resolveAt,
    resolveQuantitiesAt,
    costMove,
    ownedSale,
    pricesUnreachable,
    pricesReady,
    materials,
  };
}
