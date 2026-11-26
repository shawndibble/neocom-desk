import { formatMarketIsk } from '@/lib/isk';
import { roundPriceUp } from '@/engine/market/priceTick';
import type { OrderFloor } from '@/engine/market/orderFloor';
import { formatCount } from '@/lib/formatCount';

export function shownFloorPrice(floor: OrderFloor): number {
  return roundPriceUp(floor.relist) ?? floor.relist;
}

export function formatOrderFloorPrice(floor: OrderFloor): string {
  return formatMarketIsk(shownFloorPrice(floor));
}

export function formatOrderRemaining(volumeRemain: number, volumeTotal: number): string {
  return `${formatCount(volumeRemain)} / ${formatCount(volumeTotal)}`;
}
