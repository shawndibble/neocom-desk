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

/**
 * Walks a hub's books for `needs` (type → units). Production passes
 * `loadDepthPrices`; a test passes an in-memory map.
 */
export type DepthSource = (
  hub: Pick<TradeHub, 'regionId' | 'stationId'>,
  needs: ReadonlyMap<number, number>
) => Promise<ReadonlyMap<number, DepthPrice>>;

export interface PricePlanOptions {
  /**
   * Where Depth Prices come from; null to price at `prices.depthPrices` as
   * given (a Build Group's walk, already summed across its members).
   */
  depth: DepthSource | null;
  profitBasis: ProfitBasis;
  saleBasis?: LiquidationBasis;
  /** Also resolve with owned-stock deduction off (`ResolveBuildPlanOptions`). */
  withGroupResult?: boolean;
  /** The Industry percent (#6531) for the walked Depth Prices, as the snapshot's prices already are. */
  pricePercent?: number;
}

/**
 * A plan priced the way its own page prices it: `resolveBuildPlan` at lowest
 * sells, then once more at Depth Prices for the materials whose need is large
 * against what the hub lists (one re-resolve, never iterated: a need is read
 * off the lowest-sell pass only), then the verdict on the pilot's Profit
 * Basis with the product at its capped sale price. A book that fails to load
 * leaves the plan at lowest sells.
 */
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
