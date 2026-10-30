/**
 * Each picked product's latest price against its 90-day median in the PI hub's
 * region, for the plan rows' "vs 90d" flag. Reads only the type ids given, so
 * only picked products cost a history read.
 */
import { useCallback, useMemo } from 'react';
import { loadPriceVsMedian } from '@/features/market/priceVsMedian';
import { useBatchedMap } from '@/lib/useBatchedMap';

/** Percent from the median by type id; null where unreadable, absent while still being read. */
export function usePiPriceVsMedian(
  typeIds: readonly number[],
  regionId: number
): ReadonlyMap<number, number | null> {
  const key = [...new Set(typeIds)].sort((a, b) => a - b).join(',');
  const load = useCallback(
    (entry: string) => loadPriceVsMedian(regionId, Number(entry)),
    [regionId]
  );
  const { values } = useBatchedMap(key, load);
  return useMemo(() => new Map([...values].map(([id, pct]) => [Number(id), pct])), [values]);
}
