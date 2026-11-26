import type { QuickbarItem } from '@/db';
import { priceAlertCrossed, type PriceAlertSnapshot } from '@/engine/notificationDiffs';

export interface BoardPriceAlert {
  typeId: number;
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
  price: number | null;
  crossed: boolean;
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
  return [...rows.filter((row) => row.crossed), ...rows.filter((row) => !row.crossed)];
}
