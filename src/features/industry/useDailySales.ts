/**
 * `loadDailySales` for the market-wide scan's ranked rows, fetched only while
 * the "rarely sold" filter is on. Results land in batches rather than one
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

const readSales = (id: string) => loadDailySales(Number(id)).catch(() => null);

export function useDailySales(typeIds: readonly number[], enabled: boolean): DailySalesState {
  // Value-stable across renders that rebuild the same id list.
  const key = enabled ? idSetKey(typeIds) : '';
  const { values, pending } = useBatchedMap(key, readSales);
  return useMemo(
    () => ({ sales: new Map([...values].map(([id, sold]) => [Number(id), sold])), pending }),
    [values, pending]
  );
}
