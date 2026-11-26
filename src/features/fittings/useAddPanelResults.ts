import { useMemo } from 'react';
import {
  browserTree,
  CANDIDATE_LIMIT,
  type CandidateEntry,
  type CandidateRack,
} from '@/engine/fittings/candidates';
import type { CandidateCheck } from './dogmaFittingEngine';
import type { FittingContext } from './fittingContext';
import type { FittingCatalogue } from './useFittingCatalogue';

export type BrowserTab = 'modules' | 'charges' | 'drones' | 'cargo';

export type FitFilterKind = 'hull' | 'resources' | 'skills';
export const FIT_FILTER_KINDS: readonly FitFilterKind[] = ['hull', 'resources', 'skills'];

interface BrowseFilterOptions {
  tab: BrowserTab;
  slotRack: CandidateRack | null;
  metaGroupId: number | null;
  hullFit: ReadonlyMap<number, CandidateCheck> | null;
  fitFilters: ReadonlySet<FitFilterKind>;
}

function browseFilter(
  catalogue: FittingCatalogue,
  { tab, slotRack, metaGroupId, hullFit, fitFilters }: BrowseFilterOptions
): (entry: CandidateEntry) => boolean {
  return (entry) => {
    const rack = catalogue.rackOf[String(entry.typeId)];
    if (rack === undefined) return false;
    if (tab === 'drones' ? rack !== 'drone' : rack === 'drone') return false;
    if (slotRack !== null && rack !== slotRack) return false;
    if (
      metaGroupId !== null &&
      (catalogue.variations.types[entry.typeId]?.metaGroupId ?? null) !== metaGroupId
    )
      return false;
    if (hullFit !== null) {
      const check = hullFit.get(entry.typeId);
      if (fitFilters.has('hull') && !check?.fitsHull) return false;
      if (fitFilters.has('resources') && !check?.fitsResources) return false;
      if (fitFilters.has('skills') && !check?.canFly) return false;
    }
    return true;
  };
}

interface AddPanelResultsInput extends BrowseFilterOptions {
  catalogue: FittingCatalogue | null;
  trimmed: string;
  context: FittingContext | null;
}

export function useAddPanelResults({
  catalogue,
  trimmed,
  context,
  tab,
  slotRack,
  metaGroupId,
  hullFit,
  fitFilters,
}: AddPanelResultsInput) {
  const results = useMemo(() => {
    if (catalogue === null || trimmed === '' || (context !== null && hullFit === null)) return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, fitFilters });
    return catalogue.marketTypes
      .filter((entry) => include(entry) && entry.name.toLowerCase().includes(trimmed))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, CANDIDATE_LIMIT);
  }, [catalogue, trimmed, context, tab, slotRack, metaGroupId, hullFit, fitFilters]);
  const tree = useMemo(() => {
    if (catalogue === null || hullFit === null || trimmed !== '') return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, fitFilters });
    return browserTree(catalogue.marketTypes, include, catalogue.groupsById);
  }, [catalogue, trimmed, tab, slotRack, metaGroupId, hullFit, fitFilters]);
  const relaxed = useMemo(() => {
    const next = new Set(fitFilters);
    next.delete('resources');
    next.delete('skills');
    return next;
  }, [fitFilters]);
  const hiddenByFilters = useMemo(() => {
    if (catalogue === null || hullFit === null || relaxed.size === fitFilters.size) return 0;
    const base = { tab, slotRack, metaGroupId, hullFit };
    const shown = browseFilter(catalogue, { ...base, fitFilters });
    const all = browseFilter(catalogue, { ...base, fitFilters: relaxed });
    return catalogue.marketTypes.filter(
      (entry) => all(entry) && !shown(entry) && entry.name.toLowerCase().includes(trimmed)
    ).length;
  }, [catalogue, trimmed, tab, slotRack, metaGroupId, hullFit, fitFilters, relaxed]);
  const metaGroups = useMemo(
    () =>
      catalogue === null
        ? []
        : Object.entries(catalogue.variations.metaGroups)
            .map(([id, name]) => ({ id: Number(id), name }))
            .sort((a, b) => a.id - b.id),
    [catalogue]
  );
  return { results, tree, relaxed, hiddenByFilters, metaGroups };
}
