import { useMemo } from 'react';
import { refineryListRows, type RefineryListRow } from '@/engine/corpTaxBook/refineryList';
import type { RefineryRow } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { ownerRefineriesOf } from './useOwnerRefineries';
import { useBook } from './useBook';
import { useMoonOwnersInput } from './useMoonOwners';

export interface RefineryEntry extends Omit<RefineryListRow, 'moonId'> {
  moonId?: number;
  ownerId?: number;
  row?: RefineryRow;
}

export interface RefineryList {
  active: RefineryEntry[];
  archived: { row: RefineryRow; ownerId: number }[];
}

const EMPTY = { extractionCount: 0, states: {}, tax: 0 } as const;

export function useRefineryList(): RefineryList {
  const { view, data } = useBook();
  const input = useMoonOwnersInput();
  return useMemo(() => {
    const stats = new Map(refineryListRows(view.extractions).map((r) => [r.structureId, r]));
    const active: RefineryEntry[] = [];
    const archived: RefineryList['archived'] = [];
    const seen = new Set<number>();
    const add = (structureId: number, ownerId: number | undefined, row?: RefineryRow) => {
      if (seen.has(structureId)) return;
      seen.add(structureId);
      const s = stats.get(structureId);
      active.push({
        ...EMPTY,
        ...s,
        structureId,
        ...(s ? {} : row?.moonId !== undefined ? { moonId: row.moonId } : {}),
        ...(ownerId !== undefined ? { ownerId } : {}),
        ...(row ? { row } : {}),
      });
    };
    for (const feeder of data.feeders ?? []) {
      const mine = ownerRefineriesOf(feeder.corporationId, view, data.feeders, input);
      for (const row of mine.archived) {
        seen.add(row.structureId);
        archived.push({ row, ownerId: feeder.corporationId });
      }
      for (const row of mine.active) add(row.structureId, feeder.corporationId, row);
    }
    for (const s of stats.values()) add(s.structureId, s.sourceCorporationId);
    return { active, archived };
  }, [view, data.feeders, input]);
}
