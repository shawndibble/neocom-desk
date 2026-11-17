import { useMemo } from 'react';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { moonOwnerRefineryMining, type MoonOwnersInput } from '@/engine/corpTaxBook/moonOwners';
import {
  refineryRows,
  type RefineryMining,
  type RefineryRow,
} from '@/engine/corpTaxBook/moonOwnerRefineries';
import type { BookView } from '@/engine/corpTaxBook/bookView';
import type { BookData } from '../taxBook/bookClient';
import { useBook } from './useBook';
import { useMoonOwnersInput } from './useMoonOwners';

export interface OwnerRefineries {
  active: RefineryRow[];
  archived: RefineryRow[];
  /** The covered mining lines at its refineries, valued at 100%. */
  mining: RefineryMining[];
  /** The Extractions at its refineries. */
  extractions: ExtractionRow[];
}

/**
 * A moon owner's refineries (#6298): every one its mining or Extractions name, and every one an
 * officer archived, split into the page's list and its Archived section.
 */
export function ownerRefineriesOf(
  corp: number,
  view: BookView,
  feeders: BookData['feeders'],
  input: MoonOwnersInput
): OwnerRefineries {
  const feeder = feeders?.find((f) => f.corporationId === corp);
  const mining = moonOwnerRefineryMining(input, corp) ?? [];
  const extractions = view.extractions.filter((x) => x.sourceCorporationId === corp);
  const structureIds = [
    ...new Set([
      ...mining.map((m) => m.structureId),
      ...extractions.map((x) => x.structureId),
      ...Object.keys(feeder?.refineryArchive ?? {}).map(Number),
    ]),
  ];
  return {
    ...refineryRows({
      now: input.now,
      structureIds,
      extractions,
      mining,
      // The structure lookup was refused (403 or 404); absent until the grant reads names.
      isGone: (id) => feeder?.refineryStructures?.[String(id)]?.denied === true,
      ...(feeder?.refineryArchive ? { archive: feeder.refineryArchive } : {}),
    }),
    mining,
    extractions,
  };
}

export function useOwnerRefineries(corp: number): OwnerRefineries {
  const { view, data } = useBook();
  const input = useMoonOwnersInput();
  return useMemo(
    () => ownerRefineriesOf(corp, view, data.feeders, input),
    [view, data.feeders, input, corp]
  );
}
