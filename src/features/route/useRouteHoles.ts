import { useEffect, useMemo, useState } from 'react';
import { routeHoles } from '@/engine/route/routeHoles';
import type { TheraConnection } from '@/engine/route/theraConnections';
import type { RouteHoleQuery } from '@/features/route/routeHoleSettings';
import {
  EVE_SCOUT_CACHE_MS,
  loadTheraConnections,
  type TheraConnectionsResult,
} from '@/lib/eveScout';
import { useTicker } from '@/lib/ticker';
import { MINUTE_MS } from '@/lib/age';

export type RouteHolesState =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | {
      kind: 'ready';
      holes: TheraConnection[];
      listed: TheraConnection[];
      fetchedAt: Date;
      now: number;
    };

const TICK_MS = MINUTE_MS;

export function useRouteHoles(query: RouteHoleQuery): RouteHolesState {
  const now = useTicker(TICK_MS);
  const active = query.enabled && query.hydrated;
  const cacheWindow = Math.floor(now / EVE_SCOUT_CACHE_MS);
  const [result, setResult] = useState<TheraConnectionsResult | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void loadTheraConnections().then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [active, cacheWindow]);

  const { shipSize, minLifeHours, hubs } = query.settings;
  return useMemo((): RouteHolesState => {
    if (!active) return { kind: 'off' };
    if (result === null) return { kind: 'loading' };
    if (result.kind === 'unavailable') return { kind: 'unavailable' };
    return {
      kind: 'ready',
      holes: routeHoles(result.connections, { shipSize, minLifeHours, hubs }, now),
      listed: result.connections.filter((connection) => connection.expiresAt > now),
      fetchedAt: result.fetchedAt,
      now,
    };
  }, [active, result, shipSize, minLifeHours, hubs, now]);
}
