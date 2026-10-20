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

/** The in-game Fitting window's three icon toggles, in their on-screen order. */
export type FitFilterKind = 'hull' | 'resources' | 'skills';
export const FIT_FILTER_KINDS: readonly FitFilterKind[] = ['hull', 'resources', 'skills'];

interface BrowseFilterOptions {
  tab: BrowserTab;
  /** Only this rack — the chosen slot's, with "fits this slot" on. */
  slotRack: CandidateRack | null;
  metaGroupId: number | null;
  /** Null until the hull check is done; then only what fits it. */
  hullFit: ReadonlyMap<number, CandidateCheck> | null;
  /** Which of the three icon filters are currently on. */
  fitFilters: ReadonlySet<FitFilterKind>;
}

/** Whether a market item belongs in the browser under the current tab, slot and filters. */
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
      // Each icon toggle hides on its own rule: the hull's rack rules, its
      // bare CPU/powergrid/calibration, or the pilot's skills.
      if (fitFilters.has('hull') && !check?.fitsHull) return false;
      if (fitFilters.has('resources') && !check?.fitsResources) return false;
      if (fitFilters.has('skills') && !check?.canFly) return false;
    }
    return true;
  };
}

interface AddPanelResultsInput extends BrowseFilterOptions {
  catalogue: FittingCatalogue | null;
  /** The search text, trimmed and lower-cased. */
  trimmed: string;
  context: FittingContext | null;
}

/** What the module browser lists: search hits or the market tree, plus what the filters hide. */
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
    // Once the ship data is in, a search waits for the hull check as browsing
    // does, rather than briefly offering structure modules and the like.
    if (catalogue === null || trimmed === '' || (context !== null && hullFit === null)) return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, fitFilters });
    return catalogue.marketTypes
      .filter((entry) => include(entry) && entry.name.toLowerCase().includes(trimmed))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, CANDIDATE_LIMIT);
  }, [catalogue, trimmed, context, tab, slotRack, metaGroupId, hullFit, fitFilters]);
  // Browsing needs the hull check: without it the tree would be every
  // fittable item in the game, structure modules and all.
  const tree = useMemo(() => {
    if (catalogue === null || hullFit === null || trimmed !== '') return [];
    const include = browseFilter(catalogue, { tab, slotRack, metaGroupId, hullFit, fitFilters });
    return browserTree(catalogue.marketTypes, include, catalogue.groupsById);
  }, [catalogue, trimmed, tab, slotRack, metaGroupId, hullFit, fitFilters]);
  // What Resources and Skills are hiding for this search/browse: the items
  // that pass Hull (as it currently stands) and every other filter but not
  // one of those two. Hull stays fixed here — the market is mostly things
  // that don't fit this hull at all, so counting past it would name numbers
  // in the thousands and the note would stop being useful.
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
