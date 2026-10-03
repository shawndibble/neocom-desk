/**
 * BPC Sourcing's active filters as removable chips — what a phone shows under
 * the search box, where every filter otherwise hides behind the funnel's
 * sheet and only a count badge admits any is on. The Open Orders pattern
 * (`openOrdersFilter.ts`'s `activeFilterChips`): ids, values and a `clear`
 * here; labels are the panel's, which owns translation and region names.
 */
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';
import { DEFAULT_SOURCE_TOGGLES, type SourceToggle } from './bpcSourcingUrl';

/** The URL-backed filter fields, as the panel's filter sheet edits them. */
export interface BpcSourcingFilter {
  typeQuery: string;
  regionId: number | null;
  minMe: string;
  minTe: string;
  minRuns: string;
  maxPrice: string;
  hideAuctions: boolean;
  hidePlex: boolean;
}

/** Everything the filter sheet sets: the fields plus Source, Space and Jump Range. */
export interface BpcFilterState {
  filter: BpcSourcingFilter;
  sources: ReadonlySet<SourceToggle>;
  spaceKinds: readonly SpaceKind[];
  jumps: JumpRange;
}

/**
 * The pilot's own Exclude defaults (Settings › BPC Sourcing). Hiding auctions
 * when that is the pilot's default is not an active filter: it gets no chip,
 * and clearing a chip returns to the default rather than to "show".
 */
export interface BpcHideDefaults {
  hideAuctions: boolean;
  hidePlex: boolean;
}

export type BpcFilterChip =
  | { id: 'region'; value: number; clear: Clear }
  | { id: 'jumps'; value: JumpRange; clear: Clear }
  | { id: 'minMe' | 'minTe' | 'minRuns' | 'maxPrice'; value: string; clear: Clear }
  | { id: 'hideAuctions' | 'hidePlex'; value?: undefined; clear: Clear }
  | { id: 'sources'; value: SourceToggle[]; clear: Clear }
  | { id: 'space'; value: SpaceKind[]; clear: Clear };

type Clear = (state: BpcFilterState) => BpcFilterState;

function withFilter(state: BpcFilterState, patch: Partial<BpcSourcingFilter>): BpcFilterState {
  return { ...state, filter: { ...state.filter, ...patch } };
}

function isDefaultSources(sources: ReadonlySet<SourceToggle>): boolean {
  return (
    sources.size === DEFAULT_SOURCE_TOGGLES.length &&
    DEFAULT_SOURCE_TOGGLES.every((source) => sources.has(source))
  );
}

/**
 * One chip per filter away from its default, in the filter sheet's order.
 * Never the search text: the search box above the chips already shows it,
 * and clearing it has its own control there.
 */
export function bpcActiveFilterChips(
  state: BpcFilterState,
  hideDefaults: BpcHideDefaults
): BpcFilterChip[] {
  const { filter, sources, spaceKinds, jumps } = state;
  const chips: BpcFilterChip[] = [];
  if (filter.regionId !== null) {
    chips.push({
      id: 'region',
      value: filter.regionId,
      clear: (s) => withFilter(s, { regionId: null }),
    });
  }
  if (jumps !== DEFAULT_JUMP_RANGE) {
    chips.push({ id: 'jumps', value: jumps, clear: (s) => ({ ...s, jumps: DEFAULT_JUMP_RANGE }) });
  }
  for (const id of ['minMe', 'minTe', 'minRuns', 'maxPrice'] as const) {
    const value = filter[id].trim();
    if (value !== '') chips.push({ id, value, clear: (s) => withFilter(s, { [id]: '' }) });
  }
  for (const id of ['hideAuctions', 'hidePlex'] as const) {
    // Labelled by what it does now ("No auctions"), so a chip only ever
    // says "hiding" — set against a default of hiding, showing is the
    // default and gets none.
    if (filter[id] && !hideDefaults[id]) {
      chips.push({ id, clear: (s) => withFilter(s, { [id]: false }) });
    }
  }
  if (!isDefaultSources(sources)) {
    chips.push({
      id: 'sources',
      value: [...sources],
      clear: (s) => ({ ...s, sources: new Set(DEFAULT_SOURCE_TOGGLES) }),
    });
  }
  if (spaceKinds.length !== SPACE_KINDS.length) {
    chips.push({
      id: 'space',
      value: [...spaceKinds],
      clear: (s) => ({ ...s, spaceKinds: SPACE_KINDS }),
    });
  }
  return chips;
}

/** The funnel's badge: every chip, plus the search text, which narrows the table too. */
export function bpcActiveFilterCount(state: BpcFilterState, hideDefaults: BpcHideDefaults): number {
  return (
    bpcActiveFilterChips(state, hideDefaults).length +
    (state.filter.typeQuery.trim() === '' ? 0 : 1)
  );
}
