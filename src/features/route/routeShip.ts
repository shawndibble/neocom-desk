/**
 * The ship a Route Safety route is checked for mass against (issue #2906):
 * whether it can pass the wormholes and Ansiblex on the route. Device-local,
 * like the bridge switch: it is a note about the move being planned, not a
 * setting other devices need. Hull mass only — no cargo.
 */
import { useEffect, useMemo, useState } from 'react';
import type { HoleMassTable } from '@/engine/route/jumpMass';
import type { HullJumpDrive } from '@/engine/route/jumpLegs';
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
  groupId: number;
  massKg: number;
  /** The hull's base jump drive, or `null` for a hull without one. */
  drive: HullJumpDrive | null;
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

interface MassTables {
  hulls: readonly RouteShipOption[];
  holeTable: HoleMassTable;
}

let tables: Promise<MassTables> | null = null;

/** Built (and the hulls sorted) once, however many hops on the route ask. */
function loadMassTables(): Promise<MassTables> {
  tables ??= Promise.all([loadShipMass(), loadWormholeMass()])
    .then(([ships, holeTable]) => ({
      hulls: Object.entries(ships)
        .map(([id, [name, groupId, massKg, drive]]) => ({
          typeId: Number(id),
          name,
          groupId,
          massKg,
          drive: drive ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      holeTable,
    }))
    .catch((error: unknown) => {
      tables = null;
      throw error;
    });
  return tables;
}

/** The ship being moved and the mass tables, loaded once from the baked SDE files. */
export function useRouteShipMass(): RouteShipMass {
  const typeId = useRouteShipTypeId((state) => state.value);
  const [hulls, setHulls] = useState<readonly RouteShipOption[]>(NO_HULLS);
  const [holeTable, setHoleTable] = useState<HoleMassTable>(NO_TABLE);
  useEffect(() => {
    void useRouteShipTypeId.getState().hydrate();
    let live = true;
    loadMassTables()
      .then((loaded) => {
        if (!live) return;
        setHulls(loaded.hulls);
        setHoleTable(loaded.holeTable);
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
