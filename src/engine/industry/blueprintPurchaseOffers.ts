/**
 * The Blueprint Acquisition sources automatic tier selection reads beyond
 * BPC Sourcing's listed copies — a market sell order and an LP Store
 * redemption — shaped as `BpcOffer`s so `selectBlueprintTier` weighs them on
 * total cost like any listing. Pure: the caller fetches the prices, the LP
 * offers and the pilot's assets.
 */
import type { BpcOffer } from './blueprintAcquisition';

/** One LP Store redemption that hands out a blueprint copy. */
export interface LpBlueprintRedemption {
  /** Copies one redemption hands over. */
  quantity: number;
  /** Turn-in items the offer demands, per redemption. */
  requiredItems: readonly { typeId: number; quantity: number }[];
}

/**
 * One redemption as an offer: `baseIskPrice` (its ISK cost plus LP at the
 * pilot's LP Value, `lpPickPrice`) plus every turn-in the pilot still has to
 * buy, at `unitPriceFor`'s hub price. Turn-ins already in the pilot's assets
 * (`ownedFor`) cost nothing — only the remainder is priced — so an offer the
 * pilot can redeem from their own hangar is not charged for a hull they
 * already have. A remainder with no hub price makes the whole offer
 * unpriceable (`null`) rather than cheaper than it really is.
 *
 * ESI's LP offer carries no ME/TE and no runs: an LP Store copy is issued
 * unresearched, and its runs are counted as one per copy — the conservative
 * reading, so a many-run node never assumes one redemption covers it.
 */
export function lpRedemptionOffer(
  redemption: LpBlueprintRedemption,
  baseIskPrice: number,
  unitPriceFor: (typeId: number) => number | undefined,
  ownedFor: (typeId: number) => number
): BpcOffer | null {
  let price = baseIskPrice;
  for (const item of redemption.requiredItems) {
    const toBuy = Math.max(0, item.quantity - Math.max(0, ownedFor(item.typeId)));
    if (toBuy === 0) continue;
    const unitPrice = unitPriceFor(item.typeId);
    if (unitPrice === undefined) return null;
    price += unitPrice * toBuy;
  }
  return { me: 0, te: 0, runs: 1, quantity: redemption.quantity, price };
}

/**
 * A market sell order as an offer. Only a blueprint original is ever a
 * market item, and it always sells unresearched — hence ME0/TE0 and
 * unlimited runs. No price (or a zero one) is no offer.
 */
export function marketSellOffer(sellPrice: number | null): BpcOffer | null {
  if (sellPrice === null || !(sellPrice > 0)) return null;
  return { me: 0, te: 0, runs: -1, quantity: 1, price: sellPrice };
}
