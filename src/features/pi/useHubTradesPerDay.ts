/**
 * Units a day the PI hub's region trades, per product: what a plan's sales are
 * held to a share of (`@/engine/pi/salesCap`). Reads the same region volume
 * object Industry does. A product that could not be read, or reads as zero
 * (absent from the object: a data gap as much as no market), is left out of
 * the map, which the engine reads as uncapped and unflagged.
 */
import { useMemo } from 'react';
import { useDailySales } from '@/features/industry/useDailySales';

export interface HubTradesState {
  trades: ReadonlyMap<number, number>;
  /** Products still being read. */
  pending: boolean;
}

export function useHubTradesPerDay(
  typeIds: readonly number[],
  regionId: number,
  enabled = true
): HubTradesState {
  const { sales, pending } = useDailySales(typeIds, regionId, enabled && typeIds.length > 0);
  return useMemo(
    () => ({
      trades: new Map(
        [...sales].filter((entry): entry is [number, number] => entry[1] !== null && entry[1] > 0)
      ),
      pending: pending > 0,
    }),
    [sales, pending]
  );
}
