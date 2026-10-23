/**
 * The Gallery's pure filtering: search, per-category counts and groups, how many
 * of each kind are on the board, and the Featured set. No React or i18n here;
 * the caller passes the resolved search text.
 */
import { categoryOn, type WidgetBoard } from './board';
import { getKind, type KindCategory, type WidgetKindDef } from './kinds';

export type CategoryFilter = 'all' | KindCategory;

type BoardShape = Pick<WidgetBoard, 'id' | 'categories'>;

/** The kinds whose resolved text contains `query`, case-insensitively; a blank query keeps all. */
export function matchKinds(
  kinds: readonly WidgetKindDef[],
  query: string,
  text: (kind: WidgetKindDef) => string
): WidgetKindDef[] {
  const needle = query.trim().toLowerCase();
  return kinds.filter((kind) => !needle || text(kind).toLowerCase().includes(needle));
}

/** How many widgets of each kind a layout holds. */
export function kindInstanceCounts(widgets: readonly { kind: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of widgets) map.set(w.kind, (map.get(w.kind) ?? 0) + 1);
  return map;
}

/**
 * The kinds with no widget on the board yet. `keep` holds the kinds added during
 * this visit: they stay listed, so a card does not vanish (and its "Added"
 * confirmation with it) the moment it is added.
 */
export function notOnBoard(
  kinds: readonly WidgetKindDef[],
  counts: ReadonlyMap<string, number>,
  keep: ReadonlySet<string> = new Set()
): WidgetKindDef[] {
  return kinds.filter((kind) => !counts.get(kind.id) || keep.has(kind.id));
}

/** Kinds per category on `board`, plus `all`. */
export function categoryCounts(
  kinds: readonly WidgetKindDef[],
  board: BoardShape
): Record<CategoryFilter, number> {
  const counts = { all: kinds.length } as Record<CategoryFilter, number>;
  for (const id of board.categories) counts[id] = 0;
  for (const kind of kinds) {
    const id = categoryOn(board, kind);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** The kinds in the board's category order; a category with none is left out. */
export function groupByCategory(
  kinds: readonly WidgetKindDef[],
  board: BoardShape
): { category: KindCategory; kinds: WidgetKindDef[] }[] {
  return board.categories
    .map((category) => ({
      category,
      kinds: kinds.filter((kind) => categoryOn(board, kind) === category),
    }))
    .filter((group) => group.kinds.length > 0);
}

/**
 * The Featured kinds: what the board starts a new pilot with (its default
 * layout), limited to `kinds` and to ones that can be added, de-duplicated.
 */
export function featuredKinds(
  board: Pick<WidgetBoard, 'defaultLayout'>,
  kinds: readonly WidgetKindDef[]
): WidgetKindDef[] {
  const offered = new Set(kinds.map((kind) => kind.id));
  const seen = new Set<string>();
  const out: WidgetKindDef[] = [];
  let n = 0;
  for (const widget of board.defaultLayout(() => `f${n++}`).widgets) {
    const kind = getKind(widget.kind);
    if (!kind || kind.availability === 'comingSoon') continue;
    if (!offered.has(kind.id) || seen.has(kind.id)) continue;
    seen.add(kind.id);
    out.push(kind);
  }
  return out;
}
