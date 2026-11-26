import { useMemo } from 'react';
import { useDailySales } from '@/features/industry/useDailySales';

export interface HubTradesState {
  trades: ReadonlyMap<number, number>;
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
