import { useMemo } from 'react';
import { refineryListRows, type RefineryListRow } from '@/engine/corpTaxBook/refineryList';
import type { RefineryRow } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { ownerRefineriesOf } from './useOwnerRefineries';
import { useBook } from './useBook';
import { useMoonOwnersInput } from './useMoonOwners';

/** A refinery on the Refineries tab: what its Extractions say, and whose it is. */
export interface RefineryEntry extends Omit<RefineryListRow, 'moonId'> {
  /** The moon of its newest Extraction; absent until it has one. */
  moonId?: number;
  /** The moon owner whose refinery it is; absent is the book's own corporation. */
  ownerId?: number;
  /** A moon owner's archive offer and state, as its page reads them. */
  row?: RefineryRow;
}

export interface RefineryList {
  active: RefineryEntry[];
  /** Archived moon owner refineries, shown folded under the list with Restore. */
  archived: { row: RefineryRow; ownerId: number }[];
}

const EMPTY = { extractionCount: 0, states: {}, tax: 0 } as const;

/**
 * Every refinery the book knows (#6348): the book's own and each moon owner's, one entry each. A
 * moon owner's also lists a refinery known only from mining, and moves an archived one out of the
 * list into `archived`.
 */
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
    // The book's own refineries, and any Extraction no moon owner record claims.
    for (const s of stats.values()) add(s.structureId, s.sourceCorporationId);
    return { active, archived };
  }, [view, data.feeders, input]);
}
