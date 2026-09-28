/**
 * A skillbook's lowest sell at the Trade Hub station and anywhere in the
 * hub's region, from one region order book. Both matter: NPC-seeded books
 * sit in NPC stations all over a region, often none at the hub station itself
 * (Upwell Hauler: zero sells at Jita 4-4, two dozen elsewhere in The Forge).
 */
interface SellCandidate {
  price: number;
  location_id: number;
  is_buy_order: boolean;
}

export interface SkillSellPrices {
  /** Lowest sell at the hub station; null when it has none. */
  hub: number | null;
  /** Lowest sell anywhere in the region; null when the region has none. */
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
