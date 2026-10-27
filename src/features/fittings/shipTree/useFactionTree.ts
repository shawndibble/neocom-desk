/**
 * One faction's tree as both views read it: classes, hulls per class, the
 * per-class rules bound to the pilot, and the layout (map geometry, ladder Ω chips).
 */
import { useMemo } from 'react';
import { hullCountsFor, hullsByClass, layoutShipTree } from '@/engine/shipTree/layout';
import { classNeedsOmega, classUnlocked, parentEmpires } from '@/engine/shipTree/rules';
import { treeFor } from '@/engine/shipTree/templates';
import type { ShipTreeLayout, ShipTreeNodeDef } from '@/engine/shipTree/types';
import type { ShipTreeGroup, ShipTreeShip } from '@/sde/types';
import type { ShipTreeSource } from './useShipTreeData';

export interface FactionTree {
  factionID: number;
  defs: ShipTreeNodeDef[];
  hulls: Map<number, ShipTreeShip[]>;
  group: (classId: number) => ShipTreeGroup | undefined;
  unlocked: (classId: number) => boolean;
  needsOmega: (classId: number) => boolean;
  /** [bottom, top] parent empires for a pirate class; [] otherwise. */
  parentEmpires: (classId: number) => readonly number[];
  layout: ShipTreeLayout;
}

export function useFactionTree(source: ShipTreeSource, factionID: number): FactionTree {
  const { data, trainedLevel, alphaMaxLevel, skillName } = source;
  return useMemo(() => {
    const hulls = hullsByClass(data, factionID);
    const group = (id: number) => data.groups[String(id)];
    const defs = treeFor(factionID, new Set(hulls.keys()));
    const needsOmega = (id: number) => classNeedsOmega(group(id), factionID, alphaMaxLevel);
    const empires = (id: number) => parentEmpires(group(id), factionID, skillName);
    return {
      factionID,
      defs,
      hulls,
      group,
      unlocked: (id) => classUnlocked(group(id), factionID, trainedLevel),
      needsOmega,
      parentEmpires: empires,
      layout: layoutShipTree({
        factionID,
        defs,
        hullCounts: hullCountsFor(data, factionID),
        needsOmega,
        parentEmpires: empires,
      }),
    };
  }, [data, factionID, trainedLevel, alphaMaxLevel, skillName]);
}
