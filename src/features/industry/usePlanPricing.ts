import { useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { IndustryBlueprint } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { pricingSourcesForHub, type BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { blueprintTypeIdsIn, useBlueprintPurchaseOffers } from './blueprintPurchaseOffers';
import { buildPlanTypeIds } from './recipes';

export function usePlanPricing(
  plan: BuildPlanRecord,
  blueprint: IndustryBlueprint | null,
  catalog: BlueprintCatalog,
  pi: PiData | null,
  pricingInputs: BuildPlanPricingInputs
) {
  const hub = useMemo(() => getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB, [plan.hubId]);
  const {
    assumedMe,
    corpBlueprints,
    standing,
    bpcOffersFor,
    bpcLastResortOffersFor,
    communityOffersFor,
  } = pricingSourcesForHub(pricingInputs, hub);

  const typeIds = useMemo(() => {
    if (!blueprint) return [] as number[];
    return buildPlanTypeIds(blueprint, { catalog, pi });
  }, [blueprint, catalog, pi]);
  const blueprintTypeIds = useMemo(() => blueprintTypeIdsIn(typeIds, catalog), [typeIds, catalog]);
  const {
    offersFor: blueprintPurchaseOffersFor,
    inventionMarket,
    ready: blueprintOffersReady,
  } = useBlueprintPurchaseOffers(plan.characterId, hub, blueprintTypeIds);

  return {
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
  };
}
