/**
 * The Overview's Price alerts card: the Quickbar items carrying a target
 * (issue #680), each with the hub price the notification poller last read.
 *
 * The board never prices anything itself. The poller already fetches these
 * prices on its own cadence and keeps the last reading, and a landing page
 * that re-priced every target on each visit would spend a market call to
 * repeat a number it already has. The one read of its own is each item's
 * market history for "vs 90d", cached until ESI's daily rollover.
 */
import type { QuickbarItem } from '@/db';
import { priceAlertCrossed, type PriceAlertSnapshot } from '@/engine/notificationDiffs';

export interface BoardPriceAlert {
  typeId: number;
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
  /** The poller's last hub price, or null when it has none for this exact target yet. */
  price: number | null;
  crossed: boolean;
  /** The latest price vs its 90-day median at the Trade Hub Quickbar prices at, in percent; null when unknown. */
  vs90d?: number | null;
}

export function buildPriceAlertRows(
  items: readonly QuickbarItem[],
  snapshot: PriceAlertSnapshot | null
): BoardPriceAlert[] {
  const rows = items.flatMap((item): BoardPriceAlert[] => {
    if (item.targetPrice === undefined || item.targetDirection === undefined) return [];
    const polled = snapshot?.entries.find(
      (entry) =>
        entry.typeId === item.typeId &&
        entry.targetPrice === item.targetPrice &&
        entry.direction === item.targetDirection
    );
    return [
      {
        typeId: item.typeId,
        name: item.name,
        targetPrice: item.targetPrice,
        direction: item.targetDirection,
        price: polled?.price ?? null,
        crossed: polled !== undefined && priceAlertCrossed(polled),
      },
    ];
  });
  // Stable: crossed first, Quickbar order within each half.
  return [...rows.filter((row) => row.crossed), ...rows.filter((row) => !row.crossed)];
}
