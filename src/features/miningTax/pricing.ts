/**
 * Jita price lookups for the Moon Mining Tax ledger (issue #523): "valued at
 * Jita price" per the ticket, read as the lowest Jita sell order — the same
 * aggregate `features/industry/marketData.ts` reads for material cost, and
 * the conventional meaning of an unqualified "Jita price" — via Fuzzwork
 * (primary, ADR 0002).
 */
import { getHubPrices } from '@/market/prices';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

/** Per-unit Jita sell price for each typeId, 0 for a type Fuzzwork has no sell orders for. */
export async function loadJitaUnitPrices(typeIds: readonly number[]): Promise<Map<number, number>> {
  const unique = [...new Set(typeIds)];
  if (unique.length === 0) return new Map();
  const aggregates = await getHubPrices(DEFAULT_TRADE_HUB, unique);
  const prices = new Map<number, number>();
  for (const typeId of unique) {
    prices.set(typeId, aggregates.get(typeId)?.sellMin ?? 0);
  }
  return prices;
}
