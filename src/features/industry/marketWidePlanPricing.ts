/**
 * Prices Market-Wide candidates with the Build Plan engine.
 *
 * A row used to be priced from a flattened material tree
 * (`computeMarketWideRows`), which could not see what a plan sees: what the
 * blueprint itself costs from the contract, LP Store or market it comes from,
 * make-or-buy on intermediates, invention. The scan said +94% where the plan
 * it opened said −213%. Each candidate is now a Build Plan record — the one
 * a click on its row would create — run through `resolveBuildPlan`, the same
 * call the plan page, Compare and Group Rollups make, so the row's figures
 * are the plan's.
 *
 * Everything the plan reads is loaded once for the whole scan, never per
 * candidate: one price snapshot over the union of every plan's types, one
 * blueprint-offers read (a Fuzzwork call per region, cached LP lookups), one
 * contract snapshot. Resolving is pure arithmetic over those.
 *
 * Not carried: Depth Prices (order-book walks for a large need — one request
 * per material, a plan page does them for the plan it shows) and Community
 * Offers (free Shared Blueprints, read by a page hook).
 */
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

/** One liquidity-selected candidate, ready to be priced as a plan. */
export interface MarketWidePlanCandidate {
  productTypeID: number;
  tree: MarketWideTreeEntry;
  /** The product's sell price the row is priced at — the hub's, or CCP's average when that was a troll order. */
  sellPrice: number;
  /** ISK value of sell orders for the product at the hub, carried to the row's order-depth read. */
  sellDepthIsk: number;
  /** The ME/TE the row is priced at (`researchFor`). */
  me: number;
  te: number;
}

export interface MarketWidePlanContext {
  hub: TradeHub;
  catalog: BlueprintCatalog;
  modifiers: CharacterModifiers;
  standing?: ResolvedStandings;
  /** The plan's owner, and whose blueprints `research.owned` are. Absent reads as no Character. */
  characterId: number | null;
  research?: MarketWideResearch;
}

/** The snapshot with one product repriced, for a troll-capped sell order; shared otherwise. */
function snapshotAt(
  snapshot: MarketSnapshot,
  productTypeID: number,
  price: number
): MarketSnapshot {
  if (snapshot.hubPrices[productTypeID] === price) return snapshot;
  return { ...snapshot, hubPrices: { ...snapshot.hubPrices, [productTypeID]: price } };
}

/**
 * Prices every candidate as the Build Plan a click on its row would create.
 * A candidate the plan engine cannot price (an unpriced material, no product
 * price) is left out rather than shown at a guess.
 */
export async function priceCandidatesAsPlans(
  candidates: readonly MarketWidePlanCandidate[],
  context: MarketWidePlanContext
): Promise<PricedMarketWideCandidate[]> {
  const { hub, catalog, modifiers, standing, characterId, research } = context;
  const entries = candidates.map(
    (candidate) => catalog.byBlueprintTypeID.get(candidate.tree.blueprintTypeID) ?? null
  );

  const [facilityDefaults, pi, bpcRows, latestPlan] = await Promise.all([
    loadActivityFacilityDefaults(),
    loadPi().catch(() => null),
    loadBpcContractRows().catch(() => null),
    // A new plan starts its price basis (and hub) from the Character's latest plan.
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

  // The job fee is charged where a new plan builds: the remembered system, else the hub's own.
  const location = startingLocation('manufacturing', facilityDefaults);
  const [snapshot, purchaseOffers, inventionMarket] = await Promise.all([
    loadMarketSnapshot(
      hub,
      [...typeIds],
      location.buildSystemId !== undefined && location.buildSystemName !== undefined
        ? location.buildSystemId
        : undefined,
      'manufacturing'
    ),
    loadBlueprintPurchaseOffers(characterId, hub, blueprintIds).catch(
      () => NO_BLUEPRINT_PURCHASE_OFFERS
    ),
    loadInventionMarket(hub, blueprintIds),
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
      snapshot: snapshotAt(snapshot, candidate.productTypeID, candidate.sellPrice),
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
