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

/** Stage 1 (prepare: source/space/jump/filter narrowing) then stage 2 (rank), run by `useBpcOfferSearch`. */
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
  // Stage 1 never reads the type query, so a keystroke reruns only stage 2.
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
  // The URL parse returns a new Set on every write; key on content so a
  // keystroke's `sourcing.q` write doesn't rerun stage 1.
  const sourcesKey = sourceToggleKey(sources);
  const stableSources = useMemo(() => sourceToggleSet(sourcesKey), [sourcesKey]);
  // Deferred so a filter edit doesn't block input while the full snapshot reruns.
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
