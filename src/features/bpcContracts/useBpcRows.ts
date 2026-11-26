import { useDeferredValue, useMemo } from 'react';
import type { SpaceKind } from '@/engine/space';
import type {
  BpcPrepareInput,
  BpcQuery,
  BpcSourceData,
} from '@/features/bpcContracts/searchBpcOffers';
import { useBpcOfferSearch } from '@/features/bpcContracts/useBpcOfferSearch';
import { sourceToggleKey, sourceToggleSet, type SourceToggle } from './bpcSourcingUrl';
import type { UiFilter } from './BpcFilterBar';

interface BpcRowsInput {
  uiFilter: UiFilter;
  selectedTypeId: number | null;
  sources: ReadonlySet<SourceToggle>;
  activeSpaceKinds: ReadonlySet<SpaceKind> | null;
  allowedSystems: ReadonlySet<number> | null;
  sourceData: BpcSourceData;
}

export function useBpcRows({
  uiFilter,
  selectedTypeId,
  sources,
  activeSpaceKinds,
  allowedSystems,
  sourceData,
}: BpcRowsInput) {
  const query = useMemo<BpcQuery>(
    () => ({
      filter: uiFilter,
      selectedTypeId,
      sources,
    }),
    [uiFilter, selectedTypeId, sources]
  );
  const stableFilter = useMemo<BpcPrepareInput['filter']>(
    () => ({
      regionId: uiFilter.regionId,
      minMe: uiFilter.minMe,
      minTe: uiFilter.minTe,
      minRuns: uiFilter.minRuns,
      maxPrice: uiFilter.maxPrice,
      hideAuctions: uiFilter.hideAuctions,
      hidePlex: uiFilter.hidePlex,
    }),
    [
      uiFilter.regionId,
      uiFilter.minMe,
      uiFilter.minTe,
      uiFilter.minRuns,
      uiFilter.maxPrice,
      uiFilter.hideAuctions,
      uiFilter.hidePlex,
    ]
  );
  const sourcesKey = sourceToggleKey(sources);
  const stableSources = useMemo(() => sourceToggleSet(sourcesKey), [sourcesKey]);
  const deferredStableFilter = useDeferredValue(stableFilter);
  const deferredQuery = useDeferredValue(query);
  const prepareInput = useMemo<BpcPrepareInput>(
    () => ({
      filter: deferredStableFilter,
      sources: stableSources,
      spaceKinds: activeSpaceKinds,
      allowedSystems,
    }),
    [deferredStableFilter, stableSources, activeSpaceKinds, allowedSystems]
  );
  return useBpcOfferSearch(sourceData, prepareInput, deferredQuery);
}
