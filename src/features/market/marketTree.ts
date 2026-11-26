import { rankedSearch } from '@/lib/rankedSearch';
import { fuzzySearch } from '@/lib/fuzzySearch';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';

export const MARKET_TREE_MIN_QUERY_LENGTH = 3;

export const MARKET_TREE_MATCH_LIMIT = 50;

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
  visibleGroupIds: ReadonlySet<number>;
  matchedTypesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  bestMatch: MarketTypeEntry | null;
  totalMatches: number;
  capped: boolean;
  fuzzy: boolean;
}

export function filterMarketTree(
  groups: readonly MarketGroupNode[],
  types: readonly MarketTypeEntry[],
  query: string
): MarketTreeFilterResult | null {
  if (query.trim().length < MARKET_TREE_MIN_QUERY_LENGTH) return null;

  const byName = { primary: (entry: MarketTypeEntry) => entry.name, limit: Infinity };
  const exactMatches = rankedSearch(types, query, byName);
  const closeMatches = exactMatches.length === 0 ? fuzzySearch(types, query, byName) : [];
  const fuzzy = closeMatches.length > 0;
  const matches = fuzzy ? closeMatches : exactMatches;
  const totalMatches = matches.length;
  const capped = totalMatches > MARKET_TREE_MATCH_LIMIT;
  const shown = capped ? matches.slice(0, MARKET_TREE_MATCH_LIMIT) : matches;

  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const visibleGroupIds = new Set<number>();
  const matchedTypesByGroup = new Map<number, MarketTypeEntry[]>();

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

export const MARKET_TREE_OPEN_ROW_LIMIT = 12;

export interface SearchCategorySummary {
  countsByRoot: ReadonlyMap<number, number>;
  openByDefault: boolean;
}

export function rootOf(id: number, groupsById: ReadonlyMap<number, MarketGroupNode>): number {
  const seen = new Set<number>();
  let cur = id;
  for (;;) {
    seen.add(cur);
    const parent = groupsById.get(cur)?.parentId ?? null;
    if (parent === null || seen.has(parent)) return cur;
    cur = parent;
  }
}

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
