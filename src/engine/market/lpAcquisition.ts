export interface LpStoreOfferInput {
  offerId: number;
  corporationId: number;
  corpName: string;
  quantityPerRedemption: number;
  lpCostPerRedemption: number;
  iskCostPerRedemption: number;
  requiredItemsCostPerRedemption: number | null;
  playerLp: number;
}

export interface AppraisalLpOption {
  offerId: number;
  corporationId: number;
  corpName: string;
  lpCost: number;
  iskCost: number;
  affordableLp: boolean;
}

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
    offerId: offer.offerId,
    corporationId: offer.corporationId,
    corpName: offer.corpName,
    lpCost,
    iskCost,
    affordableLp: offer.playerLp >= lpCost,
  };
}

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
