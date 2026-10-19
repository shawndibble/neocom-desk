import { useMemo } from 'react';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { BpcContractRow, BpcSearchRow } from '@/engine/contracts/bpcSearch';
import type { SpaceKind } from '@/engine/space';
import type { ContractLocationInfo } from '@/features/bpcContracts/blueprintLocation';
import {
  prepareBpcOffers,
  rankBpcOffers,
  type BpcPrepareInput,
  type BpcQuery,
  type BpcSourceData,
} from '@/features/bpcContracts/searchBpcOffers';
import { sourceToggleKey, sourceToggleSet, type SourceToggle } from './bpcSourcingUrl';
import type { UiFilter } from './BpcFilterBar';

interface BpcRowsInput {
  rows: readonly BpcContractRow[];
  originals: readonly BpcContractRow[];
  contractLocations: ReadonlyMap<number, ContractLocationInfo>;
  blueprintNames: ReadonlyMap<number, string>;
  ownedBlueprints: CharacterBlueprint[];
  communityRows: readonly BpcSearchRow[];
  uiFilter: UiFilter;
  selectedTypeId: number | null;
  sources: ReadonlySet<SourceToggle>;
  activeSpaceKinds: ReadonlySet<SpaceKind> | null;
  allowedSystems: ReadonlySet<number> | null;
  sourceData: BpcSourceData;
}

/** Stage 1 (prepare: source/space/jump/filter narrowing) then stage 2 (rank), each memoized on its own inputs. */
export function useBpcRows({
  rows,
  originals,
  contractLocations,
  blueprintNames,
  ownedBlueprints,
  communityRows,
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
  const prepared = useMemo(
    () =>
      prepareBpcOffers(
        {
          contractRows: rows,
          originals,
          contractLocations,
          blueprintNames,
          ownedBlueprints,
          communityRows: communityRows,
        },
        {
          filter: stableFilter,
          sources: stableSources,
          spaceKinds: activeSpaceKinds,
          allowedSystems: allowedSystems,
        }
      ),
    [
      rows,
      originals,
      contractLocations,
      blueprintNames,
      ownedBlueprints,
      communityRows,
      stableFilter,
      stableSources,
      activeSpaceKinds,
      allowedSystems,
    ]
  );
  return useMemo(() => rankBpcOffers(prepared, sourceData, query), [prepared, sourceData, query]);
}
