/**
 * Route Safety's jump drive legs (issue #3147): whether a route may fly a
 * stretch by jump drive, and the longest single jump it may ask for.
 *
 * Route Safety only and device-local, like the bridge switch beside it: it is
 * a note about the move being planned, not a setting other devices need. The
 * drive itself comes from the hull chosen in "My ship" (`routeShip.ts`).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  indexSystemPositions,
  type JumpSystem,
  type SystemPosition,
} from '@/engine/route/jumpDrive';
import { hullJumpDrive, type JumpDriveOptions } from '@/engine/route/jumpLegs';
import { createLocalSetting } from '@/lib/useLocalSetting';
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

/** "Short" caps a single jump at this share of the hull's range: fewer light years per fatigue step. */
export const SHORT_JUMP_SHARE = 0.5;

export const useRouteJumpRange = createLocalSetting<RouteJumpRange>({
  key: ROUTE_JUMP_RANGE_KEY,
  defaultValue: 'max',
  parse: (raw) => (raw === 'short' || raw === 'max' ? raw : 'max'),
});

/** What a Route Safety route needs to plan jump drive legs. */
export interface RouteJumpSetup {
  /** Names the setup: equal keys plan the same trip. */
  key: string;
  systems: readonly JumpSystem[];
  positions: ReadonlyMap<number, SystemPosition>;
  drive: JumpDriveOptions;
}

export interface RouteJump {
  /** `null` while jump legs are off, the hull has no drive, or the map is still loading. */
  setup: RouteJumpSetup | null;
  /** False until the settings are read and, when jump legs are wanted, the positions are in. */
  ready: boolean;
}

interface JumpMap {
  systems: readonly JumpSystem[];
  positions: ReadonlyMap<number, SystemPosition>;
}

let jumpMap: Promise<JumpMap | null> | null = null;

/** Every system's position and security, read once. */
function loadJumpMap(): Promise<JumpMap | null> {
  jumpMap ??= Promise.all([loadSystemPositions(), loadSolarSystemsById()])
    .then(([flat, entries]) => {
      if (!entries) return null;
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

/** The jump drive legs this route may fly: the saved switch and range, on the chosen hull. */
export function useRouteJump(): RouteJump {
  const enabled = useRouteJumpsEnabled((state) => state.value);
  const enabledHydrated = useRouteJumpsEnabled((state) => state.hydrated);
  const range = useRouteJumpRange((state) => state.value);
  const rangeHydrated = useRouteJumpRange((state) => state.hydrated);
  const { ship } = useRouteShipMass();
  const [map, setMap] = useState<JumpMap | null>(null);
  const [mapSettled, setMapSettled] = useState(false);
  useEffect(() => {
    void useRouteJumpsEnabled.getState().hydrate();
    void useRouteJumpRange.getState().hydrate();
  }, []);
  const wanted = enabled && ship?.drive != null;
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void loadJumpMap().then((loaded) => {
      if (!live) return;
      setMap(loaded);
      setMapSettled(true);
    });
    return () => {
      live = false;
    };
  }, [wanted]);
  return useMemo((): RouteJump => {
    const hydrated = enabledHydrated && rangeHydrated;
    if (!hydrated) return { setup: null, ready: false };
    if (!wanted || !ship?.drive) return { setup: null, ready: true };
    if (!mapSettled) return { setup: null, ready: false };
    if (!map) return { setup: null, ready: true };
    const hull = hullJumpDrive(ship.groupId, ship.drive);
    const drive: JumpDriveOptions = {
      rangeLy: range === 'short' ? hull.rangeLy * SHORT_JUMP_SHARE : hull.rangeLy,
      fuelPerLy: hull.fuelPerLy,
      distanceFactor: hull.distanceFactor,
    };
    const key = `${drive.rangeLy}:${drive.fuelPerLy}:${drive.distanceFactor}`;
    return { setup: { key, ...map, drive }, ready: true };
  }, [enabledHydrated, rangeHydrated, wanted, ship, mapSettled, map, range]);
}
