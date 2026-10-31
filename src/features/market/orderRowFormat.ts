import { formatMarketIsk } from '@/lib/isk';
import { roundPriceUp } from '@/engine/market/priceTick';
import type { OrderFloor } from '@/engine/market/orderFloor';
import { formatCount } from '@/lib/formatCount';

/** The floor's figure as shown: rounded UP to a legal price (issue #1421), safe to type; sort/compare code keeps the exact `floor.relist`. */
export function shownFloorPrice(floor: OrderFloor): number {
  return roundPriceUp(floor.relist) ?? floor.relist;
}

/** The floor as shown, formatted. */
export function formatOrderFloorPrice(floor: OrderFloor): string {
  return formatMarketIsk(shownFloorPrice(floor));
}

/** "N / M" units remaining. */
export function formatOrderRemaining(volumeRemain: number, volumeTotal: number): string {
  return `${formatCount(volumeRemain)} / ${formatCount(volumeTotal)}`;
}
