/**
 * Filters EVE's own Market Group tree in place by item name: a branch with no
 * matching descendant disappears, a branch with one stays fully expanded up
 * to the root. Pure and synchronous — the route debounces keystrokes itself.
 */
import { rankedSearch } from '@/lib/rankedSearch';
import { fuzzySearch } from '@/lib/fuzzySearch';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

/** Search starts filtering the tree at this many characters (CONTEXT.md). */
export const MARKET_TREE_MIN_QUERY_LENGTH = 3;

/** Cap on matched items shown, so a broad query doesn't dump the whole catalogue into the tree. */
export const MARKET_TREE_MATCH_LIMIT = 50;

/**
 * Walks `id`'s ancestor chain to the root, adding each level to `into`. Stops
 * at a level already present — a shared-ancestor short-circuit that doubles as a cycle guard.
 */
export function addAncestors(
  id: number,
  groupsById: ReadonlyMap<number, MarketGroupNode>,
  into: Set<number>
): void {
  let cur: number | null = id;
  while (cur !== null && !into.has(cur)) {
    into.add(cur);
    cur = groupsById.get(cur)?.parentId ?? null;
  }
}

export interface MarketTreeFilterResult {
  /** Every group id that must render: matched leaf groups plus their ancestors (bestMatch excluded). */
  visibleGroupIds: ReadonlySet<number>;
  /** Matched items, capped at MARKET_TREE_MATCH_LIMIT, keyed by their market group (bestMatch excluded). */
  matchedTypesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  /** The item whose name equals the query, pinned above the tree; null when none does. */
  bestMatch: MarketTypeEntry | null;
  /** Full match count before the cap, for the "N total" / capped copy. */
  totalMatches: number;
  capped: boolean;
  /** True when no name contained the query and these are the closest spellings instead. */
  fuzzy: boolean;
}

/**
 * Null means "no filter active" (query under MARKET_TREE_MIN_QUERY_LENGTH) —
 * the caller renders the full tree, unfiltered, at its own expansion state.
 */
export function filterMarketTree(
  groups: readonly MarketGroupNode[],
  types: readonly MarketTypeEntry[],
  query: string
): MarketTreeFilterResult | null {
  if (query.trim().length < MARKET_TREE_MIN_QUERY_LENGTH) return null;

  const byName = { primary: (entry: MarketTypeEntry) => entry.name, limit: Infinity };
  const exactMatches = rankedSearch(types, query, byName);
  // A typo is the usual reason for no hits, so only then look for close spellings.
  const closeMatches = exactMatches.length === 0 ? fuzzySearch(types, query, byName) : [];
  const fuzzy = closeMatches.length > 0;
  const matches = fuzzy ? closeMatches : exactMatches;
  const totalMatches = matches.length;
  const capped = totalMatches > MARKET_TREE_MATCH_LIMIT;
  const shown = capped ? matches.slice(0, MARKET_TREE_MATCH_LIMIT) : matches;

  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const visibleGroupIds = new Set<number>();
  const matchedTypesByGroup = new Map<number, MarketTypeEntry[]>();

  // Pinned above the tree, so it is left out of the tree itself rather than shown twice.
  const needle = query.trim().toLowerCase();
  const bestMatch = shown.find((type) => type.name.toLowerCase() === needle) ?? null;

  for (const type of shown) {
    if (type === bestMatch) continue;
    let list = matchedTypesByGroup.get(type.marketGroupId);
    if (!list) {
      list = [];
      matchedTypesByGroup.set(type.marketGroupId, list);
    }
    list.push(type);
    addAncestors(type.marketGroupId, groupsById, visibleGroupIds);
  }

  return { visibleGroupIds, matchedTypesByGroup, bestMatch, totalMatches, capped, fuzzy };
}

/**
 * A search's matched rows fit on screen at about this many, so that is as many
 * as may start expanded across several top-level categories; more starts them
 * all collapsed so the pilot sees the category list first.
 */
export const MARKET_TREE_OPEN_ROW_LIMIT = 12;

export interface SearchCategorySummary {
  /** Matched items under each top-level category that has any (bestMatch excluded). */
  countsByRoot: ReadonlyMap<number, number>;
  /** Whether every category starts expanded: a lone category, or few enough rows to fit. */
  openByDefault: boolean;
}

/** Walks up to the top-level category; stops on a cycle rather than looping. */
function rootOf(id: number, groupsById: ReadonlyMap<number, MarketGroupNode>): number {
  const seen = new Set<number>();
  let cur = id;
  for (;;) {
    seen.add(cur);
    const parent = groupsById.get(cur)?.parentId ?? null;
    if (parent === null || seen.has(parent)) return cur;
    cur = parent;
  }
}

/** Per-category match counts and the default expand state for a search's top-level groups. */
export function summarizeSearchCategories(
  groupsById: ReadonlyMap<number, MarketGroupNode>,
  result: MarketTreeFilterResult
): SearchCategorySummary {
  const countsByRoot = new Map<number, number>();
  let total = 0;
  for (const [groupId, items] of result.matchedTypesByGroup) {
    const root = rootOf(groupId, groupsById);
    countsByRoot.set(root, (countsByRoot.get(root) ?? 0) + items.length);
    total += items.length;
  }
  return {
    countsByRoot,
    openByDefault: countsByRoot.size <= 1 || total <= MARKET_TREE_OPEN_ROW_LIMIT,
  };
}
