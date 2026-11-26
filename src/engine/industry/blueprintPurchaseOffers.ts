import type { BpcOffer } from './blueprintAcquisition';

export interface LpBlueprintRedemption {
  quantity: number;
  requiredItems: readonly { typeId: number; quantity: number }[];
}

export function lpRedemptionOffer(
  redemption: LpBlueprintRedemption,
  baseIskPrice: number,
  unitPriceFor: (typeId: number) => number | undefined,
  ownedFor: (typeId: number) => number
): BpcOffer | null {
  const turnIns = turnInCost(redemption.requiredItems, unitPriceFor, ownedFor);
  if (turnIns === null) return null;
  return { me: 0, te: 0, runs: 1, quantity: redemption.quantity, price: baseIskPrice + turnIns };
}

export function turnInCost(
  requiredItems: LpBlueprintRedemption['requiredItems'],
  unitPriceFor: (typeId: number) => number | undefined,
  ownedFor: (typeId: number) => number
): number | null {
  let cost = 0;
  for (const item of requiredItems) {
    const toBuy = Math.max(0, item.quantity - Math.max(0, ownedFor(item.typeId)));
    if (toBuy === 0) continue;
    const unitPrice = unitPriceFor(item.typeId);
    if (unitPrice === undefined) return null;
    cost += unitPrice * toBuy;
  }
  return cost;
}

export function marketSellOffer(sellPrice: number | null): BpcOffer | null {
  if (sellPrice === null || !(sellPrice > 0)) return null;
  return { me: 0, te: 0, runs: -1, quantity: 1, price: sellPrice };
}
