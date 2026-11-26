import { useCallback } from 'react';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { useSavedFittingRecords } from './useSavedFittingRecords';

const NO_HULLS: number[] = [];

export function recentHullIds(
  saved: readonly { hullTypeId: number; updatedAt: number }[],
  limit: number
): number[] {
  const ids: number[] = [];
  for (const { hullTypeId } of [...saved].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (!ids.includes(hullTypeId)) ids.push(hullTypeId);
    if (ids.length === limit) break;
  }
  return ids;
}

export function useRecentHullIds(characterId: number | null, limit = 5): number[] {
  const records = useSavedFittingRecords(characterId);
  const load = useCallback(async () => {
    if (!records) return [];
    const saved: { hullTypeId: number; updatedAt: number }[] = [];
    for (const record of [...records].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const decoded = await decodeFittingShare(record.code).catch(() => null);
      if (decoded?.ok) {
        saved.push({ hullTypeId: decoded.value.hullTypeId, updatedAt: record.updatedAt });
        if (recentHullIds(saved, limit).length === limit) break;
      }
    }
    return recentHullIds(saved, limit);
  }, [records, limit]);
  return useAsyncLoad(load).data ?? NO_HULLS;
}
