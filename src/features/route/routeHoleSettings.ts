import { useEffect } from 'react';
import type { RouteHoleHubs, RouteHoleSettings } from '@/engine/route/routeHoles';
import {
  THERA_HUBS,
  WORMHOLE_SHIP_SIZES,
  type WormholeShipSize,
} from '@/engine/route/theraConnections';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const ROUTE_HOLES_KEY = 'sync.routeHoles';
export const ROUTE_HOLE_SHIP_SIZE_KEY = 'sync.routeHoleShipSize';
export const ROUTE_HOLE_MIN_LIFE_KEY = 'sync.routeHoleMinLife';
export const ROUTE_HOLE_HUBS_KEY = 'sync.routeHoleHubs';

export type { RouteHoleHubs };
export const ROUTE_HOLE_HUBS: readonly RouteHoleHubs[] = ['all', ...THERA_HUBS];

export const DEFAULT_ROUTE_HOLE_SHIP_SIZE: WormholeShipSize = 'medium';
export const DEFAULT_ROUTE_HOLE_MIN_LIFE = 1;
export const MIN_ROUTE_HOLE_MIN_LIFE = 0;
export const MAX_ROUTE_HOLE_MIN_LIFE = 24;

function oneOf<V extends string>(values: readonly V[]): (raw: unknown) => V | null {
  return (raw) =>
    typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as V) : null;
}

export function parseRouteHoleMinLife(raw: unknown): number | null {
  return typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= MIN_ROUTE_HOLE_MIN_LIFE &&
    raw <= MAX_ROUTE_HOLE_MIN_LIFE
    ? raw
    : null;
}

export const useRouteHolesEnabled = createSyncedSetting<boolean>({
  key: ROUTE_HOLES_KEY,
  defaultValue: false,
});

export const useRouteHoleShipSize = createSyncedSetting<WormholeShipSize>({
  key: ROUTE_HOLE_SHIP_SIZE_KEY,
  defaultValue: DEFAULT_ROUTE_HOLE_SHIP_SIZE,
  parse: oneOf(WORMHOLE_SHIP_SIZES),
});

export const useRouteHoleMinLife = createSyncedSetting<number>({
  key: ROUTE_HOLE_MIN_LIFE_KEY,
  defaultValue: DEFAULT_ROUTE_HOLE_MIN_LIFE,
  parse: parseRouteHoleMinLife,
});

export const useRouteHoleHubs = createSyncedSetting<RouteHoleHubs>({
  key: ROUTE_HOLE_HUBS_KEY,
  defaultValue: 'all',
  parse: oneOf(ROUTE_HOLE_HUBS),
});

const ROUTE_HOLE_STORES = [
  useRouteHolesEnabled,
  useRouteHoleShipSize,
  useRouteHoleMinLife,
  useRouteHoleHubs,
] as const;

export const NO_HOLE_OVERRIDES = {
  enabled: null,
  shipSize: null,
  minLifeHours: null,
  hubs: null,
} as const;

export interface RouteHoleOverrides {
  enabled: boolean | null;
  shipSize: WormholeShipSize | null;
  minLifeHours: number | null;
  hubs: RouteHoleHubs | null;
}

export interface RouteHoleQuery {
  enabled: boolean;
  settings: RouteHoleSettings;
  hydrated: boolean;
}

export async function loadRouteHoleQuery(): Promise<RouteHoleQuery> {
  await Promise.all(ROUTE_HOLE_STORES.map((store) => store.getState().hydrate()));
  return {
    enabled: useRouteHolesEnabled.getState().value,
    settings: {
      shipSize: useRouteHoleShipSize.getState().value,
      minLifeHours: useRouteHoleMinLife.getState().value,
      hubs: useRouteHoleHubs.getState().value,
    },
    hydrated: true,
  };
}

export function useRouteHoleQuery(overrides: RouteHoleOverrides): RouteHoleQuery {
  const enabled = useRouteHolesEnabled((state) => state.value);
  const shipSize = useRouteHoleShipSize((state) => state.value);
  const minLifeHours = useRouteHoleMinLife((state) => state.value);
  const hubs = useRouteHoleHubs((state) => state.value);
  const hydrated = [
    useRouteHolesEnabled((state) => state.hydrated),
    useRouteHoleShipSize((state) => state.hydrated),
    useRouteHoleMinLife((state) => state.hydrated),
    useRouteHoleHubs((state) => state.hydrated),
  ].every(Boolean);
  useEffect(() => {
    for (const store of ROUTE_HOLE_STORES) void store.getState().hydrate();
  }, []);
  return {
    enabled: overrides.enabled ?? enabled,
    settings: {
      shipSize: overrides.shipSize ?? shipSize,
      minLifeHours: overrides.minLifeHours ?? minLifeHours,
      hubs: overrides.hubs ?? hubs,
    },
    hydrated,
  };
}

export type RouteHoleChange = {
  [K in keyof RouteHoleOverrides]: { field: K; value: NonNullable<RouteHoleOverrides[K]> };
}[keyof RouteHoleOverrides];

export function saveRouteHoleDefault(change: RouteHoleChange): void {
  switch (change.field) {
    case 'enabled':
      void useRouteHolesEnabled.getState().setValue(change.value);
      return;
    case 'shipSize':
      void useRouteHoleShipSize.getState().setValue(change.value);
      return;
    case 'minLifeHours':
      void useRouteHoleMinLife.getState().setValue(change.value);
      return;
    case 'hubs':
      void useRouteHoleHubs.getState().setValue(change.value);
  }
}
