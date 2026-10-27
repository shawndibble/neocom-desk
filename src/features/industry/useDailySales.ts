/**
 * `loadDailySales` for the market-wide scan's ranked rows, in the scanned hub's
 * region. Results land in batches rather than one
 * render per product, so checking a few hundred rows doesn't re-render the
 * table a few hundred times.
 */
import { useMemo } from 'react';
import { idSetKey } from '@/lib/idSetKey';
import { useBatchedMap } from '@/lib/useBatchedMap';
import { loadDailySales } from './dailySales';

export interface DailySalesState {
  /** Units a day per product; null where it couldn't be read. Absent until checked. */
  sales: ReadonlyMap<number, number | null>;
  /** Products still to check. */
  pending: number;
}

/** An entry is `<regionId>:<typeId>`, so a hub change reads again. */
const readSales = (entry: string) => {
  const [regionId, typeId] = entry.split(':').map(Number);
  return loadDailySales(regionId, typeId).catch(() => null);
};

export function useDailySales(
  typeIds: readonly number[],
  regionId: number,
  enabled: boolean
): DailySalesState {
  // Value-stable across renders that rebuild the same id list.
  const key = enabled
    ? idSetKey(typeIds)
        .split(',')
        .filter(Boolean)
        .map((id) => `${regionId}:${id}`)
        .join(',')
    : '';
  const { values, pending } = useBatchedMap(key, readSales);
  return useMemo(
    () => ({
      sales: new Map([...values].map(([entry, sold]) => [Number(entry.split(':')[1]), sold])),
      pending,
    }),
    [values, pending]
  );
}
