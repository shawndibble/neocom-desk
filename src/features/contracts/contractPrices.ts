import { loadHubSnapshotRange } from '@/features/market/hubSnapshot';
import { getHubPricesWithStatus } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import type { SidePrices } from '@/engine/miningTax/priceBasis';

export type PriceBasisChoice = { kind: 'day'; date: string } | { kind: 'live' };

export interface ContractPrices {
  prices: Map<number, SidePrices>;
  unreachable: boolean;
}

export async function loadContractPrices(
  hub: TradeHub,
  typeIds: readonly number[],
  basis: PriceBasisChoice,
  sellOverrides: ReadonlyMap<number, number> = new Map()
): Promise<ContractPrices> {
  const unique = [...new Set(typeIds)];
  const prices = new Map<number, SidePrices>();
  let unreachable = false;
  if (unique.length > 0) {
    if (basis.kind === 'live') {
      const live = await getHubPricesWithStatus(hub, unique);
      unreachable = live.unreachable;
      for (const [typeId, aggregate] of live.prices) {
        prices.set(typeId, { buy: aggregate.buyMax, sell: aggregate.sellMin });
      }
    } else {
      const range = await loadHubSnapshotRange(basis.date, basis.date, unique, hub);
      for (const [typeId, day] of range.saved.get(basis.date) ?? []) prices.set(typeId, day);
    }
  }
  if (basis.kind === 'live') {
    for (const [typeId, sell] of sellOverrides) prices.set(typeId, { buy: null, sell });
  }
  return { prices, unreachable };
}
