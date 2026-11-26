import type { BuildPlanRecord } from '@/db';
import { industryActivityOf, type IndustryBlueprint } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { loadMarketSnapshots, type MarketSnapshot, type MarketSnapshotRequest } from './marketData';
import { reactionPlanFacilityContextFor } from './planFacilityContext';
import { buildPlanTypeIds, type RecipeCatalog } from './recipes';
import {
  blueprintTypeIdsIn,
  loadBlueprintPurchaseOffers,
  NO_BLUEPRINT_PURCHASE_OFFERS,
  type BlueprintOffersLookup,
} from './blueprintPurchaseOffers';
import { loadInventionMarket, type InventionMarket } from './inventionSources';

export interface PlanSnapshots {
  snapshot: Promise<MarketSnapshot>;
  reactionSnapshot: Promise<MarketSnapshot> | null;
  blueprintOffers: Promise<BlueprintOffersLookup>;
  inventionMarket: Promise<InventionMarket | null>;
}

export function loadPlanSnapshots(
  members: readonly { plan: BuildPlanRecord; blueprint: IndustryBlueprint }[],
  sources: RecipeCatalog,
  pricePercent?: number
): PlanSnapshots[] {
  const requests: MarketSnapshotRequest[] = [];
  const offerGroups = new Map<string, { characterId: number; hub: TradeHub; ids: Set<number> }>();
  const indexes = members.map(({ plan, blueprint }) => {
    const hub = getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB;
    const typeIds = buildPlanTypeIds(blueprint, sources);
    const offerKey = `${plan.characterId}|${hub.id}`;
    const group = offerGroups.get(offerKey) ?? {
      characterId: plan.characterId,
      hub,
      ids: new Set<number>(),
    };
    for (const id of blueprintTypeIdsIn(typeIds, sources.catalog)) group.ids.add(id);
    offerGroups.set(offerKey, group);
    const primary =
      requests.push({
        hub,
        typeIds,
        costIndexSystemId: plan.buildSystemId,
        activity: industryActivityOf(blueprint),
        pricePercent,
      }) - 1;
    const reaction =
      reactionPlanFacilityContextFor(plan) !== null
        ? requests.push({
            hub,
            typeIds,
            costIndexSystemId: plan.reactionBuildSystemId,
            activity: 'reaction',
            pricePercent,
          }) - 1
        : null;
    return { primary, reaction, offerKey };
  });
  const snapshots = loadMarketSnapshots(requests);
  const offers = new Map<string, Promise<BlueprintOffersLookup>>();
  const inventionMarkets = new Map<string, Promise<InventionMarket | null>>();
  for (const [key, group] of offerGroups) {
    offers.set(
      key,
      loadBlueprintPurchaseOffers(group.characterId, group.hub, [...group.ids]).catch(
        () => NO_BLUEPRINT_PURCHASE_OFFERS
      )
    );
    inventionMarkets.set(key, loadInventionMarket(group.hub, [...group.ids], pricePercent));
  }
  return indexes.map(({ primary, reaction, offerKey }) => ({
    snapshot: snapshots[primary]!,
    reactionSnapshot: reaction === null ? null : snapshots[reaction]!,
    blueprintOffers: offers.get(offerKey)!,
    inventionMarket: inventionMarkets.get(offerKey)!,
  }));
}
