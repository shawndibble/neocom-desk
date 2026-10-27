/**
 * Per-type hub prices for a contract's price check, from one of two places:
 * the Open Price of a past UTC day (an own contract that is over) or the live
 * book (anything that can still be taken). Fetch glue over the pure
 * `engine/contracts/contractPriceCheck`, which does the arithmetic.
 *
 * The day basis reads the hub *station*'s Open Price only. The loader's
 * region-wide `historical` tier is a different quantity, and the panel names
 * the station ("Jita 4-4"), so a day the station has no price for is a day
 * with no price, not one quietly filled from the region.
 */
import { loadHubSnapshotRange } from '@/features/market/hubSnapshot';
import { getHubPricesWithStatus } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import type { SidePrices } from '@/engine/miningTax/priceBasis';

export type PriceBasisChoice = { kind: 'day'; date: string } | { kind: 'live' };

export interface ContractPrices {
  prices: Map<number, SidePrices>;
  /** The live price source could not be reached: an empty map means unknown, not unlisted. */
  unreachable: boolean;
}

export async function loadContractPrices(
  hub: TradeHub,
  typeIds: readonly number[],
  basis: PriceBasisChoice,
  /** Live sell prices for types the hub never lists (PLEX); used on the live basis only, since a past day has no such price. */
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
