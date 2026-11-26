import { useCallback, useMemo } from 'react';
import { classNeedsOmega } from '@/engine/shipTree/rules';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import type { ShipTreeShip } from '@/sde/types';
import { useShipTreeData } from './shipTree/useShipTreeData';

export interface HullFlyMark {
  status: ShipTreeHullStatus;
  needsOmega: boolean;
}

export type HullFlyMarks = (typeId: number) => HullFlyMark | undefined;

export function useHullFlyMarks(characterId: number): HullFlyMarks | null {
  const { source } = useShipTreeData(characterId);
  const tree = source !== null && source !== 'failed' ? source : null;

  const shipsById = useMemo(
    () => new Map<number, ShipTreeShip>(tree?.data.ships.map((ship) => [ship.typeID, ship])),
    [tree?.data]
  );

  const mark = useCallback(
    (typeId: number): HullFlyMark | undefined => {
      const status = tree?.statuses.get(typeId);
      const ship = shipsById.get(typeId);
      if (!tree || !status || !ship) return undefined;
      const needsOmega =
        !status.canFly &&
        tree.cloneState === 'alpha' &&
        classNeedsOmega(
          tree.data.groups[String(ship.treeGroupID)],
          ship.factionID,
          tree.alphaMaxLevel
        );
      return { status, needsOmega };
    },
    [tree, shipsById]
  );

  return tree === null || tree.statuses.size === 0 ? null : mark;
}
