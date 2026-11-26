interface SellCandidate {
  price: number;
  location_id: number;
  is_buy_order: boolean;
}

export interface SkillSellPrices {
  hub: number | null;
  region: number | null;
}

export function skillSellPrices(
  orders: readonly SellCandidate[],
  hubStationId: number
): SkillSellPrices {
  let hub: number | null = null;
  let region: number | null = null;
  for (const order of orders) {
    if (order.is_buy_order) continue;
    if (region === null || order.price < region) region = order.price;
    if (order.location_id === hubStationId && (hub === null || order.price < hub)) {
      hub = order.price;
    }
  }
  return { hub, region };
}
