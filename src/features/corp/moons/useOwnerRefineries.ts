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
  mining: RefineryMining[];
  extractions: ExtractionRow[];
}

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
