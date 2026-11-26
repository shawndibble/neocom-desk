import { useEffect, useState } from 'react';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { R2_SNAPSHOT_ORIGIN, fetchJson } from '@/features/contractSearch/r2OfferSnapshot';
import { parseCostIndexHistory, type CostIndexHistory } from './costIndexHistory';
import { HOUR_MS } from '@/lib/age';

const STALE_AFTER_MS = 12 * HOUR_MS;

export async function loadCostIndexHistory(systemId: number): Promise<CostIndexHistory | null> {
  const fetchLive = async () => {
    try {
      return parseCostIndexHistory(
        await fetchJson(`${R2_SNAPSHOT_ORIGIN}/cost-indices/${systemId}.json`)
      );
    } catch {
      return null;
    }
  };
  const cached = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `costIndexHistoryR2:${systemId}`,
    fetchLive,
    { staleAfterMs: STALE_AFTER_MS, allowStaleServe: true }
  );
  return cached?.data ?? null;
}

export function useCostIndexHistory(systemId: number | undefined) {
  const [state, setState] = useState<{ systemId: number; history: CostIndexHistory | null } | null>(
    null
  );
  useEffect(() => {
    if (systemId === undefined) return;
    let live = true;
    void loadCostIndexHistory(systemId)
      .catch(() => null)
      .then((history) => {
        if (live) setState({ systemId, history });
      });
    return () => {
      live = false;
    };
  }, [systemId]);
  return state && state.systemId === systemId ? state.history : null;
}
