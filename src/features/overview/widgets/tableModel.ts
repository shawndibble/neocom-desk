/**
 * The Table view's shape rules, as pure functions: how many rows a size shows,
 * which columns fit, and how a kind that only has list rows becomes a table.
 *
 * Extension point for a kind that wants real columns: set `KindView.table` in
 * its builder (`models.ts` / `kindModels.ts`). Order the columns as the name
 * first, then the one "key" figure, then the rest; give each a `priority` (1 is
 * kept longest). Small keeps the name and the best-priority column, Medium
 * four, Large and Full all; `fitColumns` then trims a `fitWidth` table to its box.
 * A kind that sets nothing gets `rowsToTable`.
 */
import type { WidgetSize } from './kinds';
import type { KindView, ListRow, TableCell, TableColumn, TableModel } from './data/types';

/** Table rows shown per size (single-line rows). */
export const TABLE_ROWS: Record<WidgetSize, number> = { S: 4, M: 5, L: 8, F: 12 };

const COLUMN_BUDGET: Record<WidgetSize, number> = { S: 2, M: 4, L: Infinity, F: Infinity };

/** The columns that fit a size: the first always, then the best by priority, in their own order. */
export function visibleColumns(columns: readonly TableColumn[], size: WidgetSize): TableColumn[] {
  const budget = COLUMN_BUDGET[size];
  if (columns.length <= budget) return [...columns];
  const keep = columns
    .map((column, index) => ({ index, rank: column.priority ?? index }))
    .filter(({ index }) => index > 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, budget - 1)
    .map(({ index }) => index);
  const kept = new Set([0, ...keep]);
  return columns.filter((_, index) => kept.has(index));
}

const DEFAULT_MIN_WIDTH = 64;

/**
 * The columns that fit a box `boxWidth` px across: the first always, then the best by priority
 * while their `minWidth`s (default 64) sum to no more than the box; in their own order.
 * `TableBody` measures the box (ResizeObserver on its wrapper, never the cells), so a
 * `fitWidth` table never scrolls sideways.
 */
export function fitColumns(columns: readonly TableColumn[], boxWidth: number): TableColumn[] {
  if (columns.length === 0) return [];
  const need = (column: TableColumn) => column.minWidth ?? DEFAULT_MIN_WIDTH;
  let used = need(columns[0]);
  const kept = new Set([0]);
  const ranked = columns
    .map((column, index) => ({ index, rank: column.priority ?? index }))
    .filter(({ index }) => index > 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  for (const { index } of ranked) {
    used += need(columns[index]);
    if (used > boxWidth) break;
    kept.add(index);
  }
  return columns.filter((_, index) => kept.has(index));
}

/** Existing list rows as a table: name, optional detail, value. No header labels, so no header row. */
export function rowsToTable(rows: readonly ListRow[]): TableModel {
  const hasDetail = rows.some((row) => row.detail !== undefined);
  const columns: TableColumn[] = [{ key: 'title', label: '', priority: 0 }];
  if (hasDetail) columns.push({ key: 'detail', label: '', priority: 2 });
  columns.push({ key: 'value', label: '', align: 'end', priority: 1 });
  return {
    columns,
    rows: rows.map((row) => {
      const value: TableCell =
        row.iskAmount === undefined ? row.value : { text: row.value, iskAmount: row.iskAmount };
      const cells: TableCell[] = [row.title];
      if (hasDetail) cells.push(row.detail ?? '');
      cells.push(value);
      return { key: row.key, cells, tone: row.tone, to: row.to };
    }),
  };
}

/** The table a view draws: its own, else its list rows. */
export function tableOf(view: KindView): TableModel {
  return view.table ?? rowsToTable(view.rows);
}
