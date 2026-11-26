import { useCallback, useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import { depthPriceMap } from '@/engine/industry/depthPrice';
import { hubPricesAtPercent } from '@/features/market/hubPricesAtPercent';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import type { HubPrices } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { planDepthNeeds, useDepthPrices } from './depthPriceLoader';
import type { MarketSnapshot } from './marketData';
import {
  resolveBuildPlan,
  type BuildPlanSources,
  type ResolvedBuildPlan,
} from './resolveBuildPlan';

export interface UseResolvedPlanInput {
  plan: BuildPlanRecord;
  hub: TradeHub;
  sources: BuildPlanSources;
  snapshot: MarketSnapshot | null;
  reactionSystemCostIndex: number | null | undefined;
  fetchedAtMs: number | undefined;
}

export interface UseResolvedPlanResult {
  resolved: ResolvedBuildPlan;
  depth: ReturnType<typeof useDepthPrices>['depth'];
  resolveAt: (candidate: BuildPlanRecord) => ResolvedBuildPlan;
  resolveQuantitiesAt: (candidate: BuildPlanRecord) => ResolvedBuildPlan;
}

export function useResolvedPlan({
  plan,
  hub,
  sources,
  snapshot,
  reactionSystemCostIndex,
  fetchedAtMs,
}: UseResolvedPlanInput): UseResolvedPlanResult {
  const {
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
  } = sources;

  const resolveWith = useCallback(
    (candidate: BuildPlanRecord, depthPrices?: HubPrices) =>
      resolveBuildPlan(
        candidate,
        {
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
        { snapshot, reactionSystemCostIndex, depthPrices }
      ),
    [
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
      snapshot,
      reactionSystemCostIndex,
    ]
  );
  const depthNeedsOf = useCallback(
    (candidate: BuildPlanRecord, lowestSell: ResolvedBuildPlan) =>
      planDepthNeeds(candidate, lowestSell.result, snapshot?.hubSellVolumes ?? {}),
    [snapshot?.hubSellVolumes]
  );
  const pricePercent = usePricePercentFor('industry');
  const depthAt = useCallback(
    (prices: HubPrices) => hubPricesAtPercent(prices, pricePercent),
    [pricePercent]
  );
  const topOfBook = useMemo(() => resolveWith(plan), [resolveWith, plan]);
  const depthNeeds = useMemo(() => depthNeedsOf(plan, topOfBook), [depthNeedsOf, plan, topOfBook]);
  const { depth, walk: walkDepth } = useDepthPrices(hub, depthNeeds, fetchedAtMs);
  const resolved = useMemo(
    () => (depth.size > 0 ? resolveWith(plan, depthAt(depthPriceMap(depth))) : topOfBook),
    [depth, resolveWith, plan, topOfBook, depthAt]
  );
  const resolveAt = useCallback(
    (candidate: BuildPlanRecord) => {
      const lowestSell = resolveWith(candidate);
      const trialDepth = walkDepth(depthNeedsOf(candidate, lowestSell));
      return trialDepth.size > 0
        ? resolveWith(candidate, depthAt(depthPriceMap(trialDepth)))
        : lowestSell;
    },
    [resolveWith, walkDepth, depthNeedsOf, depthAt]
  );

  return { resolved, depth, resolveAt, resolveQuantitiesAt: resolveWith };
}
