import { useCallback, useMemo } from 'react';
import { loadPriceVsMedian } from '@/features/market/priceVsMedian';
import { useBatchedMap } from '@/lib/useBatchedMap';

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
