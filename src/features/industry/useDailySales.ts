import { useMemo } from 'react';
import { idSetKey } from '@/lib/idSetKey';
import { useBatchedMap } from '@/lib/useBatchedMap';
import { loadDailySales } from './dailySales';

export interface DailySalesState {
  sales: ReadonlyMap<number, number | null>;
  pending: number;
}

const readSales = (entry: string) => {
  const [regionId, typeId] = entry.split(':').map(Number);
  return loadDailySales(regionId, typeId).catch(() => null);
};

export function useDailySales(
  typeIds: readonly number[],
  regionId: number,
  enabled: boolean
): DailySalesState {
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
