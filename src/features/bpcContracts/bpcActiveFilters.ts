import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { DEFAULT_JUMP_RANGE, type JumpRange } from '@/engine/route/jumpRange';
import { DEFAULT_SOURCE_TOGGLES, type SourceToggle } from './bpcSourcingUrl';

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

export interface BpcFilterState {
  filter: BpcSourcingFilter;
  sources: ReadonlySet<SourceToggle>;
  spaceKinds: readonly SpaceKind[];
  jumps: JumpRange;
}

export interface BpcHideDefaults {
  hideAuctions: boolean;
  hidePlex: boolean;
}

export type BpcFilterChip =
  | { id: 'region'; value: number; clear: Clear }
  | { id: 'jumps'; value: JumpRange; clear: Clear }
  | { id: 'minMe' | 'minTe' | 'minRuns' | 'maxPrice'; value: string; clear: Clear }
  | { id: 'exclude'; value: BpcExclude[]; clear: Clear }
  | { id: 'sources'; value: SourceToggle[]; clear: Clear }
  | { id: 'space'; value: SpaceKind[]; clear: Clear };

export type BpcExclude = 'hideAuctions' | 'hidePlex';

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
  const excluded = (['hideAuctions', 'hidePlex'] as const).filter(
    (id) => filter[id] && !hideDefaults[id]
  );
  if (excluded.length > 0) {
    chips.push({
      id: 'exclude',
      value: excluded,
      clear: (s) => excluded.reduce((next, id) => withFilter(next, { [id]: false }), s),
    });
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
