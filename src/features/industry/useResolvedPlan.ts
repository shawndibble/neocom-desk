/**
 * The Build Plan page's one resolution: the plan priced by `resolveBuildPlan`
 * (the same call Compare and every Group Rollup make, so this page cannot
 * price a plan differently from them), then re-priced at Depth Prices for
 * the materials whose need is large against what the hub lists.
 *
 * One memo, one fresh tier pool: the top-level claim and the tree's nested
 * claims share it, and a re-run starts from nothing rather than re-claiming
 * against copies a previous run already took.
 */
import { useCallback, useMemo } from 'react';
import type { BuildPlanRecord } from '@/db';
import { depthCandidates, depthPriceMap } from '@/engine/industry/depthPrice';
import type { HubPrices } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import { useDepthPrices } from './depthPriceLoader';
import type { MarketSnapshot } from './marketData';
import {
  resolveBuildPlan,
  type BuildPlanSources,
  type ResolvedBuildPlan,
} from './resolveBuildPlan';
import { shoppingListMaterials } from './subBuildPlan';

export interface UseResolvedPlanInput {
  plan: BuildPlanRecord;
  hub: TradeHub;
  sources: BuildPlanSources;
  snapshot: MarketSnapshot | null;
  /** The Reaction Location's own cost index; undefined until that fetch lands. */
  reactionSystemCostIndex: number | null | undefined;
  /** When the snapshot was fetched; keys the Depth Price reload. */
  fetchedAtMs: number | undefined;
}

export interface UseResolvedPlanResult {
  resolved: ResolvedBuildPlan;
  /** The plan's Depth Prices by type, for the materials it buys. */
  depth: ReturnType<typeof useDepthPrices>['depth'];
  /** Resolves a candidate plan as the page would, walking its own Depth Prices. */
  resolveAt: (candidate: BuildPlanRecord) => ResolvedBuildPlan;
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

  // One resolver for the page's own plan and for Break Even's trial run counts
  // (each walking its own Depth Prices), so a trial prices as the page would.
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
  // Depth Prices: the lowest-sell pass says what the plan has to buy;
  // materials whose need is large against what the hub lists walk the hub's
  // book, and the plan resolves once more at those prices. One re-resolve,
  // never iterated: a need is read off the lowest-sell pass only.
  const depthNeedsOf = useCallback(
    (candidate: BuildPlanRecord, lowestSell: ResolvedBuildPlan) =>
      lowestSell.result
        ? depthCandidates(
            shoppingListMaterials(lowestSell.result.materials),
            snapshot?.hubSellVolumes ?? {},
            candidate.materialSourcing,
            candidate.materialPriceBasis
          )
        : new Map<number, number>(),
    [snapshot?.hubSellVolumes]
  );
  const topOfBook = useMemo(() => resolveWith(plan), [resolveWith, plan]);
  const depthNeeds = useMemo(() => depthNeedsOf(plan, topOfBook), [depthNeedsOf, plan, topOfBook]);
  const { depth, walk: walkDepth } = useDepthPrices(hub, depthNeeds, fetchedAtMs);
  const resolved = useMemo(
    () => (depth.size > 0 ? resolveWith(plan, depthPriceMap(depth)) : topOfBook),
    [depth, resolveWith, plan, topOfBook]
  );
  // Break Even's trials walk the books for their own run count, as the page would at that count.
  const resolveAt = useCallback(
    (candidate: BuildPlanRecord) => {
      const lowestSell = resolveWith(candidate);
      const trialDepth = walkDepth(depthNeedsOf(candidate, lowestSell));
      return trialDepth.size > 0 ? resolveWith(candidate, depthPriceMap(trialDepth)) : lowestSell;
    },
    [resolveWith, walkDepth, depthNeedsOf]
  );

  return { resolved, depth, resolveAt };
}
