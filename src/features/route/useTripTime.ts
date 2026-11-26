import { useEffect, useMemo, useState } from 'react';
import {
  tripTime,
  type GatePositions,
  type HullFlight,
  type TripTime,
} from '@/engine/route/tripTime';
import type { RouteSafetyTrip } from '@/engine/route/routeSafetyTrip';
import { loadGatePositions } from '@/sde/loadMarketSde';
import { loadShipFlight } from '@/sde/loadSde';
import { useRouteShipMass } from './routeShip';

export type TripTimeState =
  | { kind: 'no-ship' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; time: TripTime };

interface Tables {
  gates: GatePositions;
  flight: Readonly<Record<string, readonly [number, number, number]>>;
}

function useTables(wanted: boolean): Tables | 'failed' | null {
  const [tables, setTables] = useState<Tables | 'failed' | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    Promise.all([loadGatePositions(), loadShipFlight()])
      .then(([gates, flight]) => live && setTables({ gates, flight }))
      .catch(() => live && setTables('failed'));
    return () => {
      live = false;
    };
  }, [wanted]);
  return tables;
}

export function useTripTime(trip: RouteSafetyTrip | null): TripTimeState {
  const { ship } = useRouteShipMass();
  const tables = useTables(ship !== null && trip !== null);
  return useMemo<TripTimeState>(() => {
    if (ship === null) return { kind: 'no-ship' };
    if (trip === null || tables === null) return { kind: 'loading' };
    if (tables === 'failed') return { kind: 'unavailable' };
    const row = tables.flight[String(ship.typeId)];
    if (!row) return { kind: 'unavailable' };
    const hull: HullFlight = {
      massKg: ship.massKg,
      agility: row[0],
      maxVelocityMs: row[1],
      warpSpeedAuPerS: row[2],
    };
    const time = tripTime(trip.rows, trip.stopIndexes, tables.gates, hull);
    return time ? { kind: 'ready', time } : { kind: 'unavailable' };
  }, [ship, trip, tables]);
}
