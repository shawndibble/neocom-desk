/**
 * Market Browser item search: case-insensitive substring match over the SDE
 * type names (`loadTypes()`'s ~9k-entry map). Pure and synchronous — the
 * route debounces keystrokes before calling this, this module does no
 * debouncing/async of its own.
 */
import type { TypeMap } from '@/sde/types';

export interface TypeSearchResult {
  typeId: number;
  name: string;
  volume: number;
}

/** Cap on rendered matches (CONTEXT.md scope: "show top 50 matches"). */
export const SEARCH_RESULT_LIMIT = 50;

function relevanceRank(name: string, query: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  return 2;
}

/**
 * Empty/whitespace-only query returns no results (never dumps all ~9k types).
 * Matches are ranked exact > prefix > substring, alphabetical within a rank,
 * then capped at SEARCH_RESULT_LIMIT — so an exact/prefix hit further down
 * the alphabet still surfaces over an early alphabetical substring hit.
 */
export function searchTypes(types: TypeMap, query: string): TypeSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: TypeSearchResult[] = [];
  for (const [id, info] of Object.entries(types)) {
    if (info.name.toLowerCase().includes(q)) {
      matches.push({ typeId: Number(id), name: info.name, volume: info.volume });
    }
  }

  matches.sort((a, b) => {
    const ra = relevanceRank(a.name.toLowerCase(), q);
    const rb = relevanceRank(b.name.toLowerCase(), q);
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
  });

  return matches.slice(0, SEARCH_RESULT_LIMIT);
}
