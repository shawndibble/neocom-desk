import { formatMarketIsk } from '@/lib/isk';
import { roundPriceUp } from '@/engine/market/priceTick';
import type { OrderFloor } from '@/engine/market/orderFloor';

/** The floor as shown: rounded UP to a legal price (issue #1421), safe to type; sort/compare code keeps the exact `floor.relist`. */
export function formatOrderFloorPrice(floor: OrderFloor): string {
  return formatMarketIsk(roundPriceUp(floor.relist) ?? floor.relist);
}

/** "N / M" units remaining. */
export function formatOrderRemaining(volumeRemain: number, volumeTotal: number): string {
  return `${volumeRemain.toLocaleString()} / ${volumeTotal.toLocaleString()}`;
}
