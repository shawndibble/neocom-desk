/**
 * Prices several Build Plans in one `loadMarketSnapshots` call: each plan's
 * own request plus, when it has a Reaction Location (issue #698), a
 * reaction-activity request for that location's cost index. One call, not
 * two: a second call the same tick would race the first on a cold cache and
 * fetch hub prices, adjusted prices and cost indices twice.
 */
import type { BuildPlanRecord } from '@/db';
import { industryActivityOf, type IndustryBlueprint } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { loadMarketSnapshots, type MarketSnapshot, type MarketSnapshotRequest } from './marketData';
import { reactionPlanFacilityContextFor } from './planFacilityContext';
import { buildPlanTypeIds, type RecipeCatalog } from './recipes';

export interface PlanSnapshots {
  snapshot: Promise<MarketSnapshot>;
  /** Null when the plan has no Reaction Location configured. */
  reactionSnapshot: Promise<MarketSnapshot> | null;
}

/** Returns one entry per `members` item, in order. */
export function loadPlanSnapshots(
  members: readonly { plan: BuildPlanRecord; blueprint: IndustryBlueprint }[],
  sources: RecipeCatalog
): PlanSnapshots[] {
  const requests: MarketSnapshotRequest[] = [];
  const indexes = members.map(({ plan, blueprint }) => {
    const hub = getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB;
    const typeIds = buildPlanTypeIds(blueprint, sources);
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
    return { primary, reaction };
  });
  const snapshots = loadMarketSnapshots(requests);
  return indexes.map(({ primary, reaction }) => ({
    snapshot: snapshots[primary]!,
    reactionSnapshot: reaction === null ? null : snapshots[reaction]!,
  }));
}
