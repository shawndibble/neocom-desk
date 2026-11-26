import { useEffect, useReducer } from 'react';
import type { VettingParty, VettingRawRow, VettingRawSource } from '@/engine/vetting';
import { vettingBackend } from './vettingClient';
import { loadRawPages, rawEntry, rawKey } from './vettingRawStore';

export interface RawRows {
  rows: readonly VettingRawRow[];
  parties: ReadonlyMap<number, VettingParty>;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}

export function useVettingRawRows(
  characterId: number,
  corporationId: number,
  reviewId: string,
  source: VettingRawSource
): RawRows {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const key = rawKey(characterId, corporationId, reviewId, source);
  const entry = rawEntry(key);
  const start = () =>
    loadRawPages(entry, (cursor) =>
      vettingBackend().rawRows(characterId, corporationId, reviewId, source, cursor)
    );
  useEffect(() => {
    entry.listeners.add(rerender);
    start();
    return () => {
      entry.listeners.delete(rerender);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    rows: entry.rows,
    parties: entry.parties,
    loading: entry.next !== null && !entry.error,
    failed: entry.error,
    retry: start,
  };
}
