import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildTheraConnectionRows,
  type ConnectionDistances,
  type TheraConnectionRow,
} from '@/engine/route/theraConnections';
import { localJumpDistances } from '@/features/route/localRoute';
import type { RouteQuery } from '@/features/route/routeRules';
import {
  EVE_SCOUT_CACHE_MS,
  loadTheraConnections,
  type TheraConnectionsResult,
} from '@/lib/eveScout';
import { useTicker } from '@/lib/ticker';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { MINUTE_MS } from '@/lib/age';

export type TheraConnectionsState =
  | { kind: 'loading' }
  | {
      kind: 'unavailable';
      retry: () => void;
    }
  | {
      kind: 'ready';
      rows: TheraConnectionRow[];
      fetchedAt: Date;
      distancesLoading: boolean;
      originUngated: boolean;
    };

const TICK_MS = MINUTE_MS;

const NO_SYSTEMS: ReadonlyMap<number, { security: number }> = new Map();

export function useTheraConnections(
  originId: number | null,
  route: RouteQuery
): TheraConnectionsState {
  const now = useTicker(TICK_MS);
  const cacheWindow = Math.floor(now / EVE_SCOUT_CACHE_MS);
  const [result, setResult] = useState<TheraConnectionsResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [systems, setSystems] = useState<ReadonlyMap<number, { security: number }> | null>(null);
  const [distances, setDistances] = useState<{
    key: string;
    value: ConnectionDistances;
  } | null>(null);
  const { rules, key: routeKey, hydrated } = route;
  const distanceKey = `${originId}:${routeKey}`;

  useEffect(() => {
    let cancelled = false;
    void loadTheraConnections().then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheWindow, attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSolarSystemsById()
      .catch(() => null)
      .then((next) => {
        if (!cancelled) setSystems(next ?? NO_SYSTEMS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (originId === null || !hydrated) return;
    let cancelled = false;
    void localJumpDistances(originId, rules).then((next) => {
      if (!cancelled) setDistances({ key: distanceKey, value: next });
    });
    return () => {
      cancelled = true;
    };
  }, [originId, hydrated, rules, distanceKey]);

  return useMemo((): TheraConnectionsState => {
    if (result === null || systems === null) return { kind: 'loading' };
    if (result.kind === 'unavailable') return { kind: 'unavailable', retry };
    const settled = distances?.key === distanceKey ? distances.value : null;
    const value: ConnectionDistances =
      originId === null ? { kind: 'no-origin' } : (settled ?? { kind: 'unknown' });
    return {
      kind: 'ready',
      rows: buildTheraConnectionRows(result.connections, { now, systems, distances: value }),
      fetchedAt: result.fetchedAt,
      distancesLoading: originId !== null && settled === null,
      originUngated: settled?.kind === 'known' && settled.jumps.size <= 1,
    };
  }, [result, systems, distances, distanceKey, originId, now, retry]);
}
