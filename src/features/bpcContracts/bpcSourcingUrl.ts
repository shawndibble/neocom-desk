/**
 * BPC Sourcing's view state in the URL (ADR 0015): the search box, filters,
 * source toggles, Jump Range, Show all, and the blueprint the search is
 * pinned to — so a reload of `/industry/sourcing` reopens the same search.
 * Keys are prefixed `sourcing.` so they never collide with another Industry
 * tab's.
 *
 * The Space filter and visible columns are *not* here: both are persisted
 * local settings already (`bpcSpaceFilterPref.ts`, `bpcSearchColumns.ts`).
 */
import { tabPath } from '@/lib/pageTabs';
import { enumParam, enumSetParam, optionalIdParam, textParam } from '@/lib/urlState';
import { INDUSTRY_TABS } from '@/features/industry/industryTabs';
import type { BpcSearchSource } from '@/engine/contracts/bpcSearch';
import { DEFAULT_JUMP_RANGE, JUMP_RANGES } from '@/engine/route/jumpRange';

/**
 * Which listings the search covers: `contract` BPCs, `contractBpo` contract
 * originals and `market` market BPO sell orders (issue #1241), plus `owned`.
 */
export type SourceToggle = BpcSearchSource | 'contractBpo';
export const SOURCE_TOGGLES: readonly SourceToggle[] = [
  'contract',
  'contractBpo',
  'market',
  'owned',
];
/** Both on by default: an existing user must keep seeing today's contract results, plus their owned blueprints, not a narrower default. */
export const DEFAULT_SOURCE_TOGGLES: readonly SourceToggle[] = ['contract', 'owned'];

export const BPC_SOURCING_PARAMS = {
  'sourcing.q': textParam(),
  'sourcing.region': optionalIdParam(),
  'sourcing.minMe': textParam(),
  'sourcing.minTe': textParam(),
  'sourcing.minRuns': textParam(),
  'sourcing.maxPrice': textParam(),
  'sourcing.src': enumSetParam(SOURCE_TOGGLES, DEFAULT_SOURCE_TOGGLES),
  /** Jump Range from the Current System (`engine/route/jumpRange.ts`). */
  'sourcing.jumps': enumParam(JUMP_RANGES, DEFAULT_JUMP_RANGE),
  'sourcing.type': optionalIdParam(),
};

/** Key for the offers table's sort. */
export const BPC_SOURCING_SORT_KEY = 'sourcing.sort';

/** BPC Sourcing, pinned to one blueprint — the "search BPC Sourcing for this" links (issue #839). */
export function bpcSourcingHref(blueprintTypeId: number): string {
  const params = new URLSearchParams();
  const typeParam = BPC_SOURCING_PARAMS['sourcing.type'].serialize(blueprintTypeId);
  if (typeParam !== null) params.set('sourcing.type', typeParam);
  return `${tabPath(INDUSTRY_TABS, 'sourcing')}?${params.toString()}`;
}
