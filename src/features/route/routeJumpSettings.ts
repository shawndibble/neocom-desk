import { useEffect, useMemo, useState } from 'react';
import {
  indexSystemPositions,
  type JumpSystem,
  type SystemPosition,
} from '@/engine/route/jumpDrive';
import { hullJumpDrive, type JumpDriveOptions } from '@/engine/route/jumpLegs';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { onReconnect } from '@/stores/network';
import { loadSystemPositions } from '@/sde/loadMarketSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { useRouteShipMass } from './routeShip';

export const ROUTE_JUMPS_KEY = 'routeJumps';
export const ROUTE_JUMP_RANGE_KEY = 'routeJumpRange';

export const useRouteJumpsEnabled = createLocalSetting<boolean>({
  key: ROUTE_JUMPS_KEY,
  defaultValue: false,
});

export const ROUTE_JUMP_RANGES = ['short', 'max'] as const;
export type RouteJumpRange = (typeof ROUTE_JUMP_RANGES)[number];

export const SHORT_JUMP_SHARE = 0.5;

export const useRouteJumpRange = createLocalSetting<RouteJumpRange>({
  key: ROUTE_JUMP_RANGE_KEY,
  defaultValue: 'max',
  parse: (raw) => (raw === 'short' || raw === 'max' ? raw : 'max'),
});

export interface RouteJumpSetup {
  key: string;
  systems: readonly JumpSystem[];
  positions: ReadonlyMap<number, SystemPosition>;
  drive: JumpDriveOptions;
}

export interface RouteJump {
  setup: RouteJumpSetup | null;
  ready: boolean;
  unavailable: boolean;
}

interface JumpMap {
  systems: readonly JumpSystem[];
  positions: ReadonlyMap<number, SystemPosition>;
}

let jumpMap: Promise<JumpMap | null> | null = null;

function loadJumpMap(): Promise<JumpMap | null> {
  jumpMap ??= Promise.all([loadSystemPositions(), loadSolarSystemsById()])
    .then(([flat, entries]) => {
      if (!entries) {
        jumpMap = null;
        return null;
      }
      const positions = indexSystemPositions(flat);
      const systems: JumpSystem[] = [];
      for (const [id, position] of positions) {
        const entry = entries.get(id);
        if (entry)
          systems.push({ id, ...position, security: entry.security, regionId: entry.regionId });
      }
      return { systems, positions };
    })
    .catch(() => {
      jumpMap = null;
      return null;
    });
  return jumpMap;
}

export function useRouteJump(): RouteJump {
  const enabled = useRouteJumpsEnabled((state) => state.value);
  const enabledHydrated = useRouteJumpsEnabled((state) => state.hydrated);
  const range = useRouteJumpRange((state) => state.value);
  const rangeHydrated = useRouteJumpRange((state) => state.hydrated);
  const { ship } = useRouteShipMass();
  const [map, setMap] = useState<JumpMap | null>(null);
  const [mapSettled, setMapSettled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    void useRouteJumpsEnabled.getState().hydrate();
    void useRouteJumpRange.getState().hydrate();
  }, []);
  const wanted = enabled && ship?.drive != null;
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restarting the map read
    setMapSettled(false);
    void loadJumpMap().then((loaded) => {
      if (!live) return;
      setMap(loaded);
      setMapSettled(true);
    });
    return () => {
      live = false;
    };
  }, [wanted, attempt]);
  useEffect(() => {
    if (!wanted || !mapSettled || map) return;
    return onReconnect(() => {
      setMapSettled(false);
      setAttempt((n) => n + 1);
    });
  }, [wanted, mapSettled, map]);
  return useMemo((): RouteJump => {
    const hydrated = enabledHydrated && rangeHydrated;
    if (!hydrated) return { setup: null, ready: false, unavailable: false };
    if (!wanted || !ship?.drive) return { setup: null, ready: true, unavailable: false };
    if (!mapSettled) return { setup: null, ready: false, unavailable: false };
    if (!map) return { setup: null, ready: true, unavailable: true };
    const hull = hullJumpDrive(ship.groupId, ship.drive);
    const drive: JumpDriveOptions = {
      rangeLy: range === 'short' ? hull.rangeLy * SHORT_JUMP_SHARE : hull.rangeLy,
      fuelPerLy: hull.fuelPerLy,
      distanceFactor: hull.distanceFactor,
    };
    const key = `${drive.rangeLy}:${drive.fuelPerLy}:${drive.distanceFactor}`;
    return { setup: { key, ...map, drive }, ready: true, unavailable: false };
  }, [enabledHydrated, rangeHydrated, wanted, ship, mapSettled, map, range]);
}
