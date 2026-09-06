/**
 * Jita price lookups for the Moon Mining Tax ledger (issue #523), via
 * Fuzzwork (primary, ADR 0002).
 *
 * Priced at the highest Jita **buy** order, of the ore's **Compressed**
 * counterpart when the SDE has one (`loadCompressedOreTypeIds`) — a corp
 * valuing what got mined values it the way it would actually turn that ore
 * into ISK: sell into buy orders, and compressed ore is generally the more
 * liquid, more commonly traded form even though the personal mining ledger
 * only ever reports the raw type. This is a deliberate divergence from
 * Industry's own "lowest sell" convention for material cost
 * (`docs/context/decisions/20260906-081307-moon-mining-price-compressed-ore-at-jita-buy.md`),
 * not a shared meaning of "Jita price" across the app.
 */
import { getHubPrices } from '@/market/prices';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { loadCompressedOreTypeIds } from '@/sde/loadSde';

/** Per-unit Jita buy price for each raw ore/ice typeId, priced via its Compressed counterpart when one exists; 0 for a type Fuzzwork has no buy orders for. */
export async function loadJitaUnitPrices(typeIds: readonly number[]): Promise<Map<number, number>> {
  const unique = [...new Set(typeIds)];
  if (unique.length === 0) return new Map();

  const compressedByRaw = await loadCompressedOreTypeIds();
  const pricedTypeId = (typeId: number): number => compressedByRaw[String(typeId)] ?? typeId;

  const pricingTypeIds = [...new Set(unique.map(pricedTypeId))];
  const aggregates = await getHubPrices(DEFAULT_TRADE_HUB, pricingTypeIds);

  const prices = new Map<number, number>();
  for (const typeId of unique) {
    prices.set(typeId, aggregates.get(pricedTypeId(typeId))?.buyMax ?? 0);
  }
  return prices;
}
