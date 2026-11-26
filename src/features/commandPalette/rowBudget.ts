import { searchKey } from '@/lib/tokenSearch';
import { GROUP_LIMIT } from './types';
import type { PaletteGroup } from './usePaletteSearch';

export const COLLAPSED_ROWS = 3;

const WORD_BOUNDARY = /[^\p{L}\p{N}]/u;

export function matchTier(label: string, query: string): number {
  const q = searchKey(query.trim());
  const l = searchKey(label);
  if (l === q) return 0;
  if (l.startsWith(q)) return 1;
  let from = l.indexOf(q);
  if (from < 0) return 3;
  while (from >= 0) {
    if (WORD_BOUNDARY.test(l[from - 1])) return 1;
    from = l.indexOf(q, from + 1);
  }
  return 2;
}

function bestTier(group: PaletteGroup, query: string): number {
  return Math.min(...group.results.map((result) => matchTier(result.label, query)));
}

export function rankGroups(groups: readonly PaletteGroup[], query: string): PaletteGroup[] {
  const ready = groups
    .filter((group) => group.status === 'ready' && group.results.length > 0)
    .map((group) => ({ group, tier: bestTier(group, query) }))
    .sort((a, b) => a.tier - b.tier || a.group.provider.order - b.group.provider.order)
    .map(({ group }) => group);
  let next = 0;
  return groups.map((group) =>
    group.status === 'ready' && group.results.length > 0 ? ready[next++] : group
  );
}

export function visibleRowCounts(
  groups: readonly PaletteGroup[],
  expanded: ReadonlySet<string>
): Map<string, number> {
  const matching = groups.filter((group) => group.status === 'ready' && group.results.length > 0);
  const sole = matching.length <= 1;
  return new Map(
    groups.map((group) => [
      group.provider.id,
      sole || expanded.has(group.provider.id)
        ? group.results.length
        : Math.min(COLLAPSED_ROWS, group.results.length),
    ])
  );
}

export function groupCountLabel(count: number): string {
  return count >= GROUP_LIMIT ? `${GROUP_LIMIT}+` : String(count);
}
