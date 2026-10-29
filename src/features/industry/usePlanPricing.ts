import { useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import type { IndustryBlueprint } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import type { PiData } from '@/sde/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { pricingSourcesForHub, type BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { blueprintTypeIdsIn, useBlueprintPurchaseOffers } from './blueprintPurchaseOffers';
import { buildPlanTypeIds } from './recipes';

/**
 * What a plan is priced against: its Trade Hub, that hub's share of the
 * pricing inputs, and the typeIDs whose prices the page has to fetch.
 *
 * The pricing inputs are this plan's share for its own Trade Hub: the
 * assumed ME every unowned sub-build is quoted at, whether Blueprint
 * Acquisition's cost counts toward profit, the corp's blueprints, the
 * standing toward this hub's NPC owner (issue #1238, for the broker
 * fee/break-even price) and BPC Sourcing offers in this hub's region (issue
 * #838; none when BPC Sourcing isn't synced, so the price cascade falls
 * through to the BPO's own hub sell price). `IndustryPlanPage` doesn't
 * mount the plan until `pricingInputs.hydrated`, so these are always
 * the pilot's own settings, never the defaults (#2054).
 */
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

  // One level deeper than the plan itself needs: the make-or-buy marker
  // quotes each material's own recipe, and a quote is only as good as the
  // inputs it can price. Same batched Fuzzwork call either way. Shared with
  // `useComparedBuildResults.ts` (issue #453) via `buildPlanTypeIds`, so the
  // Compare table widens its price fetch exactly the same way this does.
  const typeIds = useMemo(() => {
    if (!blueprint) return [] as number[];
    return buildPlanTypeIds(blueprint, { catalog, pi });
  }, [blueprint, catalog, pi]);
  // Region market and LP Store offers for every blueprint in the tree, so a
  // blueprint the hub station doesn't sell still gets a price.
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
