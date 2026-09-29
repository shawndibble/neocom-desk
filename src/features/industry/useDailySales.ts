/**
 * `loadDailySales` for the market-wide scan's ranked rows, fetched only while
 * the "rarely sold" filter is on. Results land in batches rather than one
 * render per product, so checking a few hundred rows doesn't re-render the
 * table a few hundred times.
 */
import { useEffect, useState } from 'react';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadDailySales } from './dailySales';

const PUBLISH_EVERY = 25;

export interface DailySalesState {
  /** Units a day per product; null where it couldn't be read. Absent until checked. */
  sales: ReadonlyMap<number, number | null>;
  /** Products still to check. */
  pending: number;
}

const NO_SALES: ReadonlyMap<number, number | null> = new Map();
const IDLE: DailySalesState = { sales: NO_SALES, pending: 0 };

export function useDailySales(typeIds: readonly number[], enabled: boolean): DailySalesState {
  // Value-stable across renders that rebuild the same id list.
  const key = enabled ? [...typeIds].sort((a, b) => a - b).join(',') : '';
  const [state, setState] = useState<{ key: string; value: DailySalesState }>({
    key: '',
    value: IDLE,
  });

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    const ids = key.split(',').map(Number);
    const sales = new Map<number, number | null>();
    const publish = () => {
      if (!cancelled) {
        setState({ key, value: { sales: new Map(sales), pending: ids.length - sales.size } });
      }
    };
    void mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
      sales.set(id, await loadDailySales(id).catch(() => null));
      if (sales.size % PUBLISH_EVERY === 0) publish();
    }).then(publish);
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (key === '') return IDLE;
  if (state.key !== key) return { sales: NO_SALES, pending: key.split(',').length };
  return state.value;
}
