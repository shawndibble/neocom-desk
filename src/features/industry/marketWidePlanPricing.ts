import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { PricedMarketWideCandidate } from '@/engine/industry/marketWideOpportunities';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import { loadPi } from '@/sde/loadSde';
import type { MarketWideTreeEntry } from '@/sde/types';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { loadBpcContractRows, offersForRegion } from './buildPlanPricingInputs';
import { loadLatestBuildPlan } from './buildPlanStore';
import {
  blueprintTypeIdsIn,
  loadBlueprintPurchaseOffers,
  NO_BLUEPRINT_PURCHASE_OFFERS,
} from './blueprintPurchaseOffers';
import { loadActivityFacilityDefaults } from './facilityDefaults';
import { loadInventionMarket } from './inventionSources';
import { loadMarketSnapshot, type MarketSnapshot } from './marketData';
import { newBuildPlan, startingLocation } from './newBuildPlan';
import { buildPlanTypeIds } from './recipes';
import { resolveBuildPlan, type BuildPlanSources } from './resolveBuildPlan';
import type { MarketWideResearch } from './marketWideOpportunities';
import { atPercent } from '@/features/market/pagePricePercents';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';

export interface MarketWidePlanCandidate {
  productTypeID: number;
  tree: MarketWideTreeEntry;
  sellPrice: number;
  sellDepthIsk: number;
  me: number;
  te: number;
}

export interface MarketWidePlanContext {
  hub: TradeHub;
  catalog: BlueprintCatalog;
  modifiers: CharacterModifiers;
  standing?: ResolvedStandings;
  characterId: number | null;
  research?: MarketWideResearch;
  pricePercent?: number;
}

function snapshotAt(
  snapshot: MarketSnapshot,
  productTypeID: number,
  price: number
): MarketSnapshot {
  if (snapshot.hubPrices[productTypeID] === price) return snapshot;
  return { ...snapshot, hubPrices: { ...snapshot.hubPrices, [productTypeID]: price } };
}

export async function priceCandidatesAsPlans(
  candidates: readonly MarketWidePlanCandidate[],
  context: MarketWidePlanContext
): Promise<PricedMarketWideCandidate[]> {
  const { hub, catalog, modifiers, standing, characterId, research, pricePercent } = context;
  const entries = candidates.map(
    (candidate) => catalog.byBlueprintTypeID.get(candidate.tree.blueprintTypeID) ?? null
  );

  const [facilityDefaults, pi, bpcRows, latestPlan] = await Promise.all([
    loadActivityFacilityDefaults(),
    loadPi().catch(() => null),
    loadBpcContractRows().catch(() => null),
    characterId === null ? null : loadLatestBuildPlan(characterId).catch(() => null),
  ]);
  const typeIds = new Set<number>();
  for (const entry of entries) {
    if (!entry) continue;
    for (const id of buildPlanTypeIds(toIndustryBlueprint(entry.blueprint), { catalog, pi })) {
      typeIds.add(id);
    }
  }
  for (const candidate of candidates) typeIds.add(candidate.productTypeID);
  const blueprintIds = blueprintTypeIdsIn([...typeIds], catalog);

  const location = startingLocation('manufacturing', facilityDefaults, latestPlan);
  const [snapshot, purchaseOffers, inventionMarket] = await Promise.all([
    loadMarketSnapshot(
      hub,
      [...typeIds],
      location.buildSystemId !== undefined && location.buildSystemName !== undefined
        ? location.buildSystemId
        : undefined,
      'manufacturing',
      pricePercent
    ),
    loadBlueprintPurchaseOffers(characterId, hub, blueprintIds).catch(
      () => NO_BLUEPRINT_PURCHASE_OFFERS
    ),
    loadInventionMarket(hub, blueprintIds, pricePercent),
  ]);

  const rows = bpcRows ?? [];
  const sources: BuildPlanSources = {
    catalog,
    pi,
    ownedBlueprints: research?.owned ?? [],
    assumedMe: research?.assumedMe ?? 0,
    modifiers,
    standing,
    bpcOffersFor: offersForRegion(rows, hub.regionId),
    bpcLastResortOffersFor: offersForRegion(rows, hub.regionId, true),
    blueprintPurchaseOffersFor: purchaseOffers,
    inventionMarket,
  };

  const priced: PricedMarketWideCandidate[] = [];
  candidates.forEach((candidate, index) => {
    const entry = entries[index];
    if (!entry) return;
    const plan: BuildPlanRecord = {
      ...newBuildPlan(characterId ?? 0, entry, null, latestPlan, facilityDefaults, {
        me: candidate.me,
        te: candidate.te,
        runs: 1,
      }),
      hubId: hub.id,
    };
    const { result } = resolveBuildPlan(plan, sources, {
      snapshot: snapshotAt(
        snapshot,
        candidate.productTypeID,
        atPercent(candidate.sellPrice, pricePercent ?? DEFAULT_PRICE_PERCENT)
      ),
    });
    if (!result || result.unpriceable || result.profit === null || result.iskPerHour === null) {
      return;
    }
    priced.push({
      productTypeID: candidate.productTypeID,
      profit: result.profit,
      marginPct: result.marginPct,
      seconds: result.seconds,
      iskPerHour: result.iskPerHour,
      buildCost: result.totalCost,
      outputQuantity: candidate.tree.outputQuantity,
      sellDepthIsk: candidate.sellDepthIsk,
      me: candidate.me,
      te: candidate.te,
    });
  });
  return priced;
}
