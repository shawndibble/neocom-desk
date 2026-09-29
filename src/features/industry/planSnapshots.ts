/**
 * Prices several Build Plans in one `loadMarketSnapshots` call: each plan's
 * own request plus, when it has a Reaction Location (issue #698), a
 * reaction-activity request for that location's cost index. One call, not
 * two: a second call the same tick would race the first on a cold cache and
 * fetch hub prices, adjusted prices and cost indices twice.
 *
 * Blueprint Acquisition's region-market and LP Store offers load alongside,
 * one load per (Character, Trade Hub) covering every blueprint those plans
 * need, not one per plan.
 */
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

export interface PlanSnapshots {
  snapshot: Promise<MarketSnapshot>;
  /** Null when the plan has no Reaction Location configured. */
  reactionSnapshot: Promise<MarketSnapshot> | null;
  /** Region market and LP Store offers for the plan's blueprints; never rejects. */
  blueprintOffers: Promise<BlueprintOffersLookup>;
}

/** Returns one entry per `members` item, in order. */
export function loadPlanSnapshots(
  members: readonly { plan: BuildPlanRecord; blueprint: IndustryBlueprint }[],
  sources: RecipeCatalog
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
      }) - 1;
    const reaction =
      reactionPlanFacilityContextFor(plan) !== null
        ? requests.push({
            hub,
            typeIds,
            costIndexSystemId: plan.reactionBuildSystemId,
            activity: 'reaction',
          }) - 1
        : null;
    return { primary, reaction, offerKey };
  });
  const snapshots = loadMarketSnapshots(requests);
  const offers = new Map<string, Promise<BlueprintOffersLookup>>();
  for (const [key, group] of offerGroups) {
    offers.set(
      key,
      loadBlueprintPurchaseOffers(group.characterId, group.hub, [...group.ids]).catch(
        () => NO_BLUEPRINT_PURCHASE_OFFERS
      )
    );
  }
  return indexes.map(({ primary, reaction, offerKey }) => ({
    snapshot: snapshots[primary]!,
    reactionSnapshot: reaction === null ? null : snapshots[reaction]!,
    blueprintOffers: offers.get(offerKey)!,
  }));
}
