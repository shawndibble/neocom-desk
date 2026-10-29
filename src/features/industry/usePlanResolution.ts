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

/**
 * The plan's data pipeline: market snapshots, recipe lookup, the one
 * `resolveBuildPlan` pass, and everything derived from its result — the
 * input-cost move, the owned stock's sale value, price readiness and the
 * Materials table's rows.
 */
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

  /**
   * The whole plan, resolved in one pass by `resolveBuildPlan` — the same
   * call Compare and every Group Rollup make, so this page cannot price a
   * plan differently from them. Everything the page reads off it:
   *
   * - `result`/`error`: the Results panel and materials table.
   * - `makeOrBuyContext`: every make-or-buy verdict; null until live prices
   *   land (a fee-free quote would call almost everything worth building).
   * - `resolvedMe`/`resolvedTe`: the tier Blueprint Acquisition resolved for
   *   the plan's own product. `plan.me`/`plan.te` stay whatever they
   *   last were (Setup no longer edits them); every reader below uses the
   *   resolved pair, so there is exactly one number in play.
   * - `materialPrices`: the plan's price basis — both sides come from the
   *   snapshot already in hand, so toggling it re-computes, never refetches.
   *
   * One memo, one fresh tier pool: the top-level claim and the tree's nested
   * claims share it, and a re-run of this memo starts from nothing rather
   * than re-claiming against copies a previous run already took.
   */
  const { resolved, depth, resolveAt } = useResolvedPlan({
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
    costMove,
    ownedSale,
    pricesUnreachable,
    pricesReady,
    materials,
  };
}
