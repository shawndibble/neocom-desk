/**
 * Market Browser item search: case-insensitive substring match over the SDE
 * type names (`loadTypes()`'s ~9k-entry map). Pure and synchronous — the
 * route debounces keystrokes before calling this, this module does no
 * debouncing/async of its own.
 */
import type { TypeMap } from '@/sde/types';
import { rankedSearch } from '@/lib/rankedSearch';

export interface TypeSearchResult {
  typeId: number;
  name: string;
  volume: number;
}

/** Cap on rendered matches (CONTEXT.md scope: "show top 50 matches"). */
export const SEARCH_RESULT_LIMIT = 50;

/**
 * The SDE map is loaded once and never mutated, so its flattened form is
 * derived once per map instead of on every keystroke — `Object.entries` over
 * ~9k entries was the single largest cost in a search. Keyed weakly so a
 * replaced map does not pin the old one.
 */
const indexCache = new WeakMap<TypeMap, TypeSearchResult[]>();

function indexOf(types: TypeMap): TypeSearchResult[] {
  const cached = indexCache.get(types);
  if (cached) return cached;
  const index = Object.entries(types).map(([id, info]) => ({
    typeId: Number(id),
    name: info.name,
    volume: info.volume,
  }));
  indexCache.set(types, index);
  return index;
}

/**
 * Empty/whitespace-only query returns no results (never dumps all ~9k types).
 * Matches are ranked exact > prefix > substring, alphabetical within a rank,
 * then capped at SEARCH_RESULT_LIMIT — so an exact/prefix hit further down
 * the alphabet still surfaces over an early alphabetical substring hit.
 */
export function searchTypes(types: TypeMap, query: string): TypeSearchResult[] {
  return rankedSearch(indexOf(types), query, {
    primary: (entry) => entry.name,
    limit: SEARCH_RESULT_LIMIT,
  });
}
