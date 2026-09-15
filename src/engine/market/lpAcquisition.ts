/**
 * Appraisal's LP-store alternative (issue TBD): some items an Appraisal
 * prices — the Astero, and every other faction/navy hull or module dropped
 * straight from an NPC corp's LP store — have no blueprint at all, so the
 * market's sell side is the only acquisition path `appraisal.ts` otherwise
 * knows. When the pasted item is also redeemable at an LP store the
 * character holds points with, that redemption is a second, often far
 * cheaper, way to acquire it. This module prices that path; the caller
 * (`features/market/appraisalLpAcquisition.ts`) resolves which corp offers
 * match and fetches the LP balance and required-item prices this needs.
 *
 * Pure, like everything in `src/engine`: no ESI/Dexie shape leaks in here,
 * only the numbers a redemption actually costs.
 */

/** One LP-store offer this item can be redeemed from, already resolved to one corp's numbers. */
export interface LpStoreOfferInput {
  corporationId: number;
  corpName: string;
  /** Units of the item one redemption hands over — `LoyaltyStoreOffer.quantity`. */
  quantityPerRedemption: number;
  /** LP one redemption costs. */
  lpCostPerRedemption: number;
  /** ISK one redemption costs, beyond the LP. */
  iskCostPerRedemption: number;
  /**
   * Hub cost of the `required_items` turn-in one redemption also demands.
   * `null` when at least one required item has no hub price — poisons this
   * offer's price the same way an unpriced material poisons a build.
   */
  requiredItemsCostPerRedemption: number | null;
  /** The character's current LP balance with this offer's corporation. */
  playerLp: number;
}

/** What redeeming enough of one offer to cover a pasted quantity actually costs. */
export interface AppraisalLpOption {
  corporationId: number;
  corpName: string;
  /** Total LP needed to cover the pasted quantity, across however many redemptions that takes. */
  lpCost: number;
  /**
   * Total ISK needed for the same redemptions — never scaled by the
   * Appraisal's Price Percent, since this is a fixed NPC price, not a market
   * order someone is negotiating a fraction of.
   */
  iskCost: number;
  /** Whether the character's current LP balance covers `lpCost`. */
  affordableLp: boolean;
}

/**
 * Prices one offer for `neededQuantity` units, in whole redemptions — an LP
 * store hands over a fixed bundle per redemption, so covering a quantity
 * that does not divide evenly still costs a whole extra redemption, the same
 * "batch size forces overproduction" rule a blueprint's own run count
 * follows. `null` when the offer's required items can't be priced.
 */
export function priceLpOffer(
  offer: LpStoreOfferInput,
  neededQuantity: number
): AppraisalLpOption | null {
  if (offer.requiredItemsCostPerRedemption === null) return null;
  const perRedemption = offer.quantityPerRedemption > 0 ? offer.quantityPerRedemption : 1;
  const redemptions = Math.max(1, Math.ceil(neededQuantity / perRedemption));
  const lpCost = redemptions * offer.lpCostPerRedemption;
  const iskCost = redemptions * (offer.iskCostPerRedemption + offer.requiredItemsCostPerRedemption);
  return {
    corporationId: offer.corporationId,
    corpName: offer.corpName,
    lpCost,
    iskCost,
    affordableLp: offer.playerLp >= lpCost,
  };
}

/**
 * The cheapest way to redeem `neededQuantity` units across every offer that
 * hands this item out — a pilot can hold LP with more than one corp selling
 * the same faction ship. Affordability never filters the comparison here:
 * `appraisal.ts` decides whether an option the character can't yet afford
 * still counts toward "the total" (see `lpBeatsMarket`); this only ranks by
 * raw ISK cost, the same "show the facts, let the reader judge" split
 * `loyaltyOfferProfit` and `selectBlueprintTier` both keep.
 */
export function cheapestLpOffer(
  offers: readonly LpStoreOfferInput[],
  neededQuantity: number
): AppraisalLpOption | null {
  let best: AppraisalLpOption | null = null;
  for (const offer of offers) {
    const priced = priceLpOffer(offer, neededQuantity);
    if (!priced) continue;
    if (!best || priced.iskCost < best.iskCost) best = priced;
  }
  return best;
}
