/**
 * Filters EVE's own Market Group tree in place by item name: a branch with no
 * matching descendant disappears, a branch with one stays fully expanded up
 * to the root. Pure and synchronous — the route debounces keystrokes itself.
 */
import { rankedSearch } from '@/lib/rankedSearch';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

/** Search starts filtering the tree at this many characters (CONTEXT.md). */
export const MARKET_TREE_MIN_QUERY_LENGTH = 3;

/** Cap on matched items shown, so a broad query doesn't dump the whole catalogue into the tree. */
export const MARKET_TREE_MATCH_LIMIT = 50;

export interface MarketTreeFilterResult {
  /** Every group id that must render: matched leaf groups plus their ancestors. */
  visibleGroupIds: ReadonlySet<number>;
  /** Matched items, capped at MARKET_TREE_MATCH_LIMIT, keyed by their market group. */
  matchedTypesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  /** Full match count before the cap, for the "N total" / capped copy. */
  totalMatches: number;
  capped: boolean;
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

  const matches = rankedSearch(types, query, {
    primary: (entry) => entry.name,
    limit: Infinity,
  });
  const totalMatches = matches.length;
  const capped = totalMatches > MARKET_TREE_MATCH_LIMIT;
  const shown = capped ? matches.slice(0, MARKET_TREE_MATCH_LIMIT) : matches;

  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const visibleGroupIds = new Set<number>();
  const matchedTypesByGroup = new Map<number, MarketTypeEntry[]>();

  for (const type of shown) {
    let list = matchedTypesByGroup.get(type.marketGroupId);
    if (!list) {
      list = [];
      matchedTypesByGroup.set(type.marketGroupId, list);
    }
    list.push(type);

    // Walk the ancestor chain to the root, marking every level visible.
    let groupId: number | null = type.marketGroupId;
    while (groupId !== null && !visibleGroupIds.has(groupId)) {
      visibleGroupIds.add(groupId);
      groupId = groupsById.get(groupId)?.parentId ?? null;
    }
  }

  return { visibleGroupIds, matchedTypesByGroup, totalMatches, capped };
}
