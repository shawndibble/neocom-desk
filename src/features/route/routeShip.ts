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
  drive: HullJumpDrive | null;
}

export interface RouteShipMass {
  ship: RouteShipOption | null;
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
