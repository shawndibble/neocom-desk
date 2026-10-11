/**
 * ISK per unit for named ores at a Trade Hub: the highest buy order of the
 * ore's Compressed form where it has one, as the Moon Mining Tax ledger prices
 * ore (`features/miningTax/pricing.ts`). The read behind `useOrePrices`, and
 * what the Overview's Mining survey widget calls without a component.
 */
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { loadCompressedOreTypeIds, loadOreAndIceTypeIds, loadTypes } from '@/sde/loadSde';
import { oreFormTypeId } from '@/engine/miningTax/oreForm';
import { readCompressedOre } from '@/features/miningTax/oreForm';

export async function loadOrePrices(
  oreNames: readonly string[],
  hub: TradeHub
): Promise<{ prices: ReadonlyMap<string, number>; compressed: boolean }> {
  const [types, oreIds, compressedByRaw, compressed] = await Promise.all([
    loadTypes(),
    loadOreAndIceTypeIds(),
    loadCompressedOreTypeIds(),
    readCompressedOre(),
  ]);
  const wanted = new Set(oreNames);
  const rawByName = new Map<string, number>();
  for (const id of oreIds) {
    const name = types[String(id)]?.name;
    if (name !== undefined && wanted.has(name)) rawByName.set(name, id);
  }
  const priced = new Map(
    [...rawByName].map(([n, id]) => [n, oreFormTypeId(id, compressedByRaw, compressed)])
  );
  const aggregates = await getHubPrices(hub, [...new Set(priced.values())]);
  const prices = new Map<string, number>();
  for (const [name, typeId] of priced) {
    const buy = aggregates.get(typeId)?.buyMax;
    if (buy) prices.set(name, buy);
  }
  return { prices, compressed };
}
