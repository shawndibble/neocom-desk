import { tabPath } from '@/lib/pageTabs';
import { boolParam, enumParam, enumSetParam, optionalIdParam, textParam } from '@/lib/urlState';
import { INDUSTRY_TABS } from '@/features/industry/industryTabs';
import type { BpcSearchSource } from '@/engine/contracts/bpcSearch';
import { DEFAULT_JUMP_RANGE, JUMP_RANGES } from '@/engine/route/jumpRange';

export type SourceToggle = BpcSearchSource | 'contractBpo';
export const SOURCE_TOGGLES: readonly SourceToggle[] = [
  'contract',
  'contractBpo',
  'market',
  'lp',
  'community',
  'owned',
];
export function sourceToggleKey(sources: ReadonlySet<SourceToggle>): string {
  return SOURCE_TOGGLES.filter((source) => sources.has(source)).join();
}

export function sourceToggleSet(key: string): ReadonlySet<SourceToggle> {
  return new Set(key === '' ? [] : (key.split(',') as SourceToggle[]));
}

export const DEFAULT_SOURCE_TOGGLES: readonly SourceToggle[] = SOURCE_TOGGLES;

export const BPC_SOURCING_PARAMS = {
  'sourcing.q': textParam(),
  'sourcing.region': optionalIdParam(),
  'sourcing.minMe': textParam(),
  'sourcing.minTe': textParam(),
  'sourcing.minRuns': textParam(),
  'sourcing.maxPrice': textParam(),
  'sourcing.hideAuctions': boolParam(),
  'sourcing.hidePlex': boolParam(),
  'sourcing.src': enumSetParam(SOURCE_TOGGLES, DEFAULT_SOURCE_TOGGLES),
  'sourcing.jumps': enumParam(JUMP_RANGES, DEFAULT_JUMP_RANGE),
  'sourcing.type': optionalIdParam(),
};

export function bpcSourcingParams(defaults: { hideAuctions: boolean; hidePlex: boolean }) {
  return {
    ...BPC_SOURCING_PARAMS,
    'sourcing.hideAuctions': boolParam(defaults.hideAuctions),
    'sourcing.hidePlex': boolParam(defaults.hidePlex),
  };
}

export const BPC_SOURCING_SORT_KEY = 'sourcing.sort';

export function bpcSourcingHref(blueprintTypeId: number): string {
  const params = new URLSearchParams();
  const typeParam = BPC_SOURCING_PARAMS['sourcing.type'].serialize(blueprintTypeId);
  if (typeParam !== null) params.set('sourcing.type', typeParam);
  return `${tabPath(INDUSTRY_TABS, 'sourcing')}?${params.toString()}`;
}

export function bpcSourcingCommunityHref(): string {
  const params = new URLSearchParams();
  const sources = BPC_SOURCING_PARAMS['sourcing.src'].serialize(new Set(['community', 'owned']));
  if (sources !== null) params.set('sourcing.src', sources);
  return `${tabPath(INDUSTRY_TABS, 'sourcing')}?${params.toString()}`;
}
