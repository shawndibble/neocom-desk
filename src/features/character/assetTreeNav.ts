/**
 * One flattened row's shape as far as keyboard navigation cares — decoupled
 * from `AssetRow` so this module stays a plain array-of-records algorithm,
 * independent of the asset tree's own types.
 */
export interface NavRow {
  key: string;
  /** 1-based, matching `aria-level`. */
  level: number;
  /** Whether this row has descendant rows at all — true for every station row (pruning guarantees at least one child) and every branch node. */
  hasChildren: boolean;
  /** Whether descendant rows are currently present in the flattened list — reflects `expandedKeys` for both a station row and a branch node. */
  isOpen: boolean;
  /** Whether ArrowLeft/click can actually flip `isOpen` right now — false for every row while a search forces every match's ancestors open. */
  canToggle: boolean;
  /** Display label, for type-ahead matching. */
  label: string;
}

export type ArrowAction =
  { kind: 'toggle'; key: string } | { kind: 'moveTo'; index: number } | { kind: 'none' };

/** ArrowRight: expand a collapsed branch in place, or move focus into an already-open one's first child. */
export function arrowRight(rows: readonly NavRow[], index: number): ArrowAction {
  const row = rows[index];
  if (!row.hasChildren) return { kind: 'none' };
  if (!row.isOpen) {
    if (row.canToggle) return { kind: 'toggle', key: row.key };
    return { kind: 'none' };
  }
  const next = rows[index + 1];
  if (next && next.level > row.level) return { kind: 'moveTo', index: index + 1 };
  return { kind: 'none' };
}

/** ArrowLeft: collapse an open, toggleable branch in place, otherwise move focus to the nearest shallower ancestor. */
export function arrowLeft(rows: readonly NavRow[], index: number): ArrowAction {
  const row = rows[index];
  if (row.hasChildren && row.isOpen && row.canToggle) return { kind: 'toggle', key: row.key };
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i].level < row.level) return { kind: 'moveTo', index: i };
  }
  return { kind: 'none' };
}

/**
 * Standard tree type-ahead: search forward from just after `fromIndex`,
 * wrapping around, for the next row (other than the current one) whose
 * label starts with `char`. Returns null rather than re-selecting the
 * current row when nothing else matches.
 */
export function typeAheadIndex(
  rows: readonly NavRow[],
  fromIndex: number,
  char: string
): number | null {
  const needle = char.toLowerCase();
  const count = rows.length;
  for (let step = 1; step < count; step += 1) {
    const index = (fromIndex + step) % count;
    if (rows[index].label.toLowerCase().startsWith(needle)) return index;
  }
  return null;
}
