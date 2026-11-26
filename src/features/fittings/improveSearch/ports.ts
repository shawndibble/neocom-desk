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
  hubId: TradeHub['id'];
  percent?: number;
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
