/**
 * The open Thera / Turnur holes a Route Safety route may cross (issue #2476):
 * EVE-Scout's list, cut to the pilot's hubs, ship size and minimum life.
 *
 * Asks EVE-Scout only while the switch is on — a page that never routes
 * through a hole never makes the request. Three states besides off, each said
 * on the page: the list is loading (the gate route shows meanwhile), EVE-Scout
 * could not be reached (gates only, and the page says so), or the holes.
 */
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

export type RouteHolesState =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; holes: TheraConnection[]; fetchedAt: Date; now: number };

/** Remaining life counts down in minutes, so the clock ticks once a minute. */
const TICK_MS = 60_000;

export function useRouteHoles(query: RouteHoleQuery): RouteHolesState {
  const now = useTicker(TICK_MS);
  const active = query.enabled && query.hydrated;
  // Asks again once per cache window; inside it the answer is a memory read.
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
      fetchedAt: result.fetchedAt,
      now,
    };
  }, [active, result, shipSize, minLifeHours, hubs, now]);
}
