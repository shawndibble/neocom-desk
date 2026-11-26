import type { BuildPlanRecord } from '@/db';
import { depthPriceMap, type DepthPrice } from '@/engine/industry/depthPrice';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import type { HubPrices } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { hubPricesAtPercent } from '@/features/market/hubPricesAtPercent';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';
import { planDepthNeeds } from '../depthPriceLoader';
import { resolveBuildPlan, type BuildPlanPrices, type BuildPlanSources } from '../resolveBuildPlan';
import { planVerdictOf, type PlanVerdict } from './planVerdict';

export type DepthSource = (
  hub: Pick<TradeHub, 'regionId' | 'stationId'>,
  needs: ReadonlyMap<number, number>
) => Promise<ReadonlyMap<number, DepthPrice>>;

export interface PricePlanOptions {
  depth: DepthSource | null;
  profitBasis: ProfitBasis;
  saleBasis?: LiquidationBasis;
  withGroupResult?: boolean;
  pricePercent?: number;
}

export async function pricePlan(
  plan: BuildPlanRecord,
  sources: BuildPlanSources,
  prices: BuildPlanPrices,
  options: PricePlanOptions
): Promise<PlanVerdict> {
  const resolveAt = (depthPrices: HubPrices | undefined) =>
    resolveBuildPlan(
      plan,
      sources,
      { ...prices, depthPrices },
      { withGroupResult: options.withGroupResult }
    );
  let resolved = resolveAt(prices.depthPrices);
  let depth: ReadonlyMap<number, DepthPrice> | undefined;
  if (options.depth && resolved.result && prices.snapshot) {
    const needs = planDepthNeeds(plan, resolved.result, prices.snapshot.hubSellVolumes);
    if (needs.size > 0) {
      const hub = getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB;
      const walked = await options.depth(hub, needs).catch(() => null);
      if (walked && walked.size > 0) {
        resolved = resolveAt(
          hubPricesAtPercent(depthPriceMap(walked), options.pricePercent ?? DEFAULT_PRICE_PERCENT)
        );
        depth = walked;
      }
    }
  }
  const entry = sources.catalog.byBlueprintTypeID.get(plan.blueprintTypeID);
  return planVerdictOf(resolved, {
    snapshot: prices.snapshot,
    productTypeID: entry?.productTypeID ?? null,
    productQuantity: entry ? (entry.blueprint.products[0]?.quantity ?? 0) * plan.runs : null,
    profitBasis: options.profitBasis,
    saleBasis: options.saleBasis,
    modifiers: sources.modifiers,
    standing: sources.standing,
    depth,
  });
}
