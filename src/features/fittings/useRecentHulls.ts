import { useEffect, useState } from 'react';
import { decodeFittingShare } from '@/engine/fittings/fittingShare';
import { useSavedFittingRecords } from './useSavedFittingRecords';

/** Each hull once, by its most recent save, newest first; at most `limit`. */
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

/**
 * The hulls of the Character's most recently saved Fittings, newest first —
 * the hull picker's "Recent hulls". Empty with none saved, or while they decode.
 */
export function useRecentHullIds(characterId: number | null, limit = 5): number[] {
  const records = useSavedFittingRecords(characterId);
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    if (!records) return;
    let cancelled = false;
    void (async () => {
      const saved: { hullTypeId: number; updatedAt: number }[] = [];
      for (const record of records) {
        const decoded = await decodeFittingShare(record.code);
        if (decoded.ok)
          saved.push({ hullTypeId: decoded.value.hullTypeId, updatedAt: record.updatedAt });
      }
      if (!cancelled) setIds(recentHullIds(saved, limit));
    })();
    return () => {
      cancelled = true;
    };
  }, [records, limit]);
  return ids;
}
