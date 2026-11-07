/**
 * The hull picker's can-fly marks (issue #6011): each hull's Ship Tree status
 * for the active Character, from the Ship Tree's own data and rules — never a
 * second skill check. `null` with no Character, and until the tree and the
 * Character's skills have loaded: the picker lists hulls without marks rather
 * than wait for them.
 */
import { useCallback, useMemo } from 'react';
import { classNeedsOmega } from '@/engine/shipTree/rules';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { ShipTreeShip } from '@/sde/types';
import { useShipTreeData } from './shipTree/useShipTreeData';

export interface HullFlyMark {
  status: ShipTreeHullStatus;
  /** An Alpha can't fly it yet, and its class needs skills past the Alpha cap. */
  needsOmega: boolean;
}

export type HullFlyMarks = (typeId: number) => HullFlyMark | undefined;

export function useHullFlyMarks(): HullFlyMarks | null {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const { source } = useShipTreeData(characterId);
  const tree = source !== null && source !== 'failed' && characterId !== null ? source : null;

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
