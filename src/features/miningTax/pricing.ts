/**
 * Trade-hub price lookups for the Moon Mining Tax ledger (issue #523), via
 * Fuzzwork (primary, ADR 0002).
 *
 * Jita is the default and remains the basis for any Payee that names no hub of
 * its own; a Payee may name another (`PayeeRecord.hubId`) when that is the
 * book the landlord actually bills against.
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
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { loadCompressedOreTypeIds } from '@/sde/loadSde';

export interface UnitPrices {
  /** Per-unit buy price by raw typeId. 0 for anything the hub could not price. */
  prices: Map<number, number>;
  /**
   * Raw typeIds the hub had no buy order for.
   *
   * Reported separately rather than folded into `prices` as a `null`, which
   * would ripple `number | null` through `engine/miningTax/valuation.ts` and
   * every dialog that values a line. The 0 is what keeps the arithmetic
   * working; this set is what stops a pilot reading it as "this ore is worth
   * nothing" — a tax bill of 0 ISK that renders like any other is the failure
   * mode a thin order book would otherwise cause silently.
   */
  unpriced: Set<number>;
}

/** The hub a Payee's `hubId` names, or Jita when it names none (or one this build does not know). */
export function hubForPayee(hubId: string | undefined): TradeHub {
  return TRADE_HUBS.find((hub) => hub.id === hubId) ?? DEFAULT_TRADE_HUB;
}

/**
 * Per-unit buy price for each raw ore/ice typeId at `hub`, priced via its
 * Compressed counterpart when one exists.
 *
 * `hub` defaults to Jita, which is both the historical behaviour and what a
 * Payee with no hub of its own is still priced at.
 */
export async function loadUnitPrices(
  typeIds: readonly number[],
  hub: TradeHub = DEFAULT_TRADE_HUB
): Promise<UnitPrices> {
  const unique = [...new Set(typeIds)];
  if (unique.length === 0) return { prices: new Map(), unpriced: new Set() };

  const compressedByRaw = await loadCompressedOreTypeIds();
  const pricedTypeId = (typeId: number): number => compressedByRaw[String(typeId)] ?? typeId;

  const pricingTypeIds = [...new Set(unique.map(pricedTypeId))];
  const aggregates = await getHubPrices(hub, pricingTypeIds);

  const prices = new Map<number, number>();
  const unpriced = new Set<number>();
  for (const typeId of unique) {
    const buyMax = aggregates.get(pricedTypeId(typeId))?.buyMax ?? 0;
    prices.set(typeId, buyMax);
    // A quoted zero counts as unpriced: an order book that bids nothing values
    // the ore no better than one with no orders at all, and the pilot needs to
    // know before sending the bill either way.
    if (buyMax <= 0) unpriced.add(typeId);
  }
  return { prices, unpriced };
}
