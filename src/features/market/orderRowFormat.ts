import { formatIskAuto } from '@/lib/isk';
import { roundPriceUp } from '@/engine/market/priceTick';
import type { OrderFloor } from '@/engine/market/orderFloor';

/** The floor figure as shown to a player: rounded UP to the nearest legal price (issue #1421) — safe to type into an order, never below the exact break-even `floor.relist` sort/compare code must keep using instead. Shared by `OpenOrdersPanel`'s table column and `OpenOrdersList`'s phone row, so the two can never format it differently. */
export function formatOrderFloorPrice(floor: OrderFloor): string {
  return formatIskAuto(roundPriceUp(floor.relist) ?? floor.relist);
}

/** "N / M" units remaining, shared by the same two callers as `formatOrderFloorPrice`. */
export function formatOrderRemaining(volumeRemain: number, volumeTotal: number): string {
  return `${volumeRemain.toLocaleString()} / ${volumeTotal.toLocaleString()}`;
}
