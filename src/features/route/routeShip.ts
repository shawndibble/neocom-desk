/**
 * The ship a Route Safety route is checked for mass against (issue #2906):
 * whether it can pass the wormholes and Ansiblex on the route. Device-local,
 * like the bridge switch: it is a note about the move being planned, not a
 * setting other devices need. Hull mass only — no cargo.
 */
import { useEffect, useMemo, useState } from 'react';
import type { HoleMassTable } from '@/engine/route/jumpMass';
import { loadShipMass, loadWormholeMass } from '@/sde/loadSde';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const ROUTE_SHIP_KEY = 'routeShipTypeId';

export const useRouteShipTypeId = createLocalSetting<number | null>({
  key: ROUTE_SHIP_KEY,
  defaultValue: null,
  parse: (raw) => (typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : null),
});

export interface RouteShipOption {
  typeId: number;
  name: string;
  massKg: number;
}

export interface RouteShipMass {
  /** The chosen hull, or `null` for none (or while the hull list loads). */
  ship: RouteShipOption | null;
  /** Every hull, by name, for the picker. */
  hulls: readonly RouteShipOption[];
  holeTable: HoleMassTable;
}

const NO_HULLS: readonly RouteShipOption[] = [];
const NO_TABLE: HoleMassTable = {};

/** The ship being moved and the mass tables, loaded once from the baked SDE files. */
export function useRouteShipMass(): RouteShipMass {
  const typeId = useRouteShipTypeId((state) => state.value);
  const [hulls, setHulls] = useState<readonly RouteShipOption[]>(NO_HULLS);
  const [holeTable, setHoleTable] = useState<HoleMassTable>(NO_TABLE);
  useEffect(() => {
    void useRouteShipTypeId.getState().hydrate();
    let live = true;
    Promise.all([loadShipMass(), loadWormholeMass()])
      .then(([ships, holes]) => {
        if (!live) return;
        setHulls(
          Object.entries(ships)
            .map(([id, [name, , massKg]]) => ({ typeId: Number(id), name, massKg }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setHoleTable(holes);
      })
      // Without the tables there is simply no mass cue.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const ship = useMemo(
    () => (typeId === null ? null : (hulls.find((hull) => hull.typeId === typeId) ?? null)),
    [typeId, hulls]
  );
  return { ship, hulls, holeTable };
}
