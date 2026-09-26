/**
 * One faction's tree, as both views read it: its classes in template order,
 * its hulls per class, and the per-class rules (lit, needs Omega, parent
 * empires) bound to the pilot.
 */
import { useMemo } from 'react';
import { hullsByClass } from '@/engine/shipTree/layout';
import { classNeedsOmega, classUnlocked, parentEmpires } from '@/engine/shipTree/rules';
import { treeFor } from '@/engine/shipTree/templates';
import type { ShipTreeNodeDef } from '@/engine/shipTree/types';
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
}

export function useFactionTree(source: ShipTreeSource, factionID: number): FactionTree {
  const { data, trainedLevel, alphaMaxLevel, skillName } = source;
  return useMemo(() => {
    const hulls = hullsByClass(data, factionID);
    const group = (id: number) => data.groups[String(id)];
    return {
      factionID,
      defs: treeFor(factionID, new Set(hulls.keys())),
      hulls,
      group,
      unlocked: (id) => classUnlocked(group(id), factionID, trainedLevel),
      needsOmega: (id) => classNeedsOmega(group(id), factionID, alphaMaxLevel),
      parentEmpires: (id) => parentEmpires(group(id), factionID, skillName),
    };
  }, [data, factionID, trainedLevel, alphaMaxLevel, skillName]);
}
