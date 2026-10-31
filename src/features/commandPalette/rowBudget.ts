/**
 * The palette's row budget: which sections lead, and how many rows each
 * shows. Pure. Every provider still answers with up to `GROUP_LIMIT` rows;
 * this decides how many of them fit on screen at once.
 */
import { GROUP_LIMIT } from './types';
import type { PaletteGroup } from './usePaletteSearch';

/** Rows a section shows while other sections also match. */
export const COLLAPSED_ROWS = 3;

const WORD_BOUNDARY = /[^\p{L}\p{N}]/u;

/**
 * 0 exact, 1 the label or one of its words starts with the query, 2 substring,
 * 3 matched on something other than the label. A word start ranks with a
 * prefix: "Industry › Opportunities" is as strong a hit for "opp" as any name
 * that begins with it, and the provider order then breaks the tie.
 */
export function matchTier(label: string, query: string): number {
  const q = query.trim().toLowerCase();
  const l = label.toLowerCase();
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

/**
 * Ready sections, strongest match first (ties by provider order). A loading
 * or failed section keeps the slot it had, so one pending never reshuffles
 * the others; a ready section landing late can still rank above the rest.
 */
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

/**
 * Rows to render per section id: everything for a sole match or an expanded
 * section, `COLLAPSED_ROWS` for the rest.
 */
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

/** "4", or "6+" once the provider stopped at its cap. */
export function groupCountLabel(count: number): string {
  return count >= GROUP_LIMIT ? `${GROUP_LIMIT}+` : String(count);
}
