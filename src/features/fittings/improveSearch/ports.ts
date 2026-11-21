/**
 * The production adapter of the Improve search's ports: the page's evaluator
 * (its cached baseline, and the search's own worker pool for variants), the
 * engine's hull and skill checks, the pilot's Trade Hub prices and the hull's
 * community fits.
 */
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
import { loadFittingPrice } from '../fittingPrice';
import { searchPoolSize, type WorkerPool } from '../fittingWorker';
import { loadHullCommonality } from '../hullCommonalityLoad';
import { fitCheckOf } from '../improveModulePool';
import type { FittingCatalogue } from '../useFittingCatalogue';
import type { VariantEvaluator } from '../useFittingEvaluation';
import type { ImproveSearchPorts } from './types';

export interface ImprovePortsInput {
  variants: VariantEvaluator;
  catalogue: FittingCatalogue;
  /** The pilot's Trade Hub; an unknown one prices at the default hub. */
  hubId: TradeHub['id'];
  /** The Fittings page's price percent; 100 prices at the hub as it stands. */
  percent?: number;
  /** The search's own workers (`searchPoolSize` of them), started on first use; the caller ends them. */
  workers: () => WorkerPool;
}

export function createImprovePorts({
  variants,
  catalogue,
  hubId,
  percent = 100,
  workers,
}: ImprovePortsInput): ImproveSearchPorts {
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  return {
    fitting: variants.fitting,
    compare: (variant, signal) => variants.compare(variant, signal),
    stats: async (fitting, signal) =>
      (await variants.compare(fitting, signal, workers().send)).after,
    concurrency: searchPoolSize(),
    fitCheck: fitCheckOf(variants),
    chargeGroups: (slot, typeId) =>
      variants.engine.chargeGroupIdsFor(variants.fitting.shipTypeId, slot, typeId),
    prices: async (typeIds) => {
      const prices = await getHubPricesAt(hub, typeIds, percent);
      return (typeId) => prices.get(typeId)?.sellMin ?? null;
    },
    fitTotal: async () => (await loadFittingPrice(variants.fitting, hub, [], percent)).totals.sell,
    commonality: () => loadHullCommonality(variants.fitting.shipTypeId, catalogue.types),
  };
}
