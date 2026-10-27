import { describe, expect, it } from 'vitest';
import type { KindView, ListRow, TableColumn } from './data/types';
import { fitColumns, rowsToTable, tableOf, visibleColumns } from './tableModel';

const col = (key: string, priority?: number, align?: 'start' | 'end'): TableColumn => ({
  key,
  label: key,
  priority,
  align,
});
const FIVE = [col('a'), col('b'), col('c'), col('d'), col('e')];

describe('visibleColumns', () => {
  it('keeps the first two columns at Small', () => {
    expect(visibleColumns(FIVE, 'S').map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('keeps the first column and the best other by priority at Small', () => {
    const cols = [col('name'), col('detail', 3), col('value', 1)];
    expect(visibleColumns(cols, 'S').map((c) => c.key)).toEqual(['name', 'value']);
  });

  it('keeps the first four by priority at Medium, in their own order', () => {
    const cols = [col('a'), col('b', 4), col('c', 1), col('d', 3), col('e', 2)];
    expect(visibleColumns(cols, 'M').map((c) => c.key)).toEqual(['a', 'c', 'd', 'e']);
  });

  it('keeps everything at Large and Full', () => {
    expect(visibleColumns(FIVE, 'L')).toHaveLength(5);
    expect(visibleColumns(FIVE, 'F')).toHaveLength(5);
  });

  it('never drops below what it has', () => {
    expect(visibleColumns([col('a'), col('b')], 'M')).toHaveLength(2);
    expect(visibleColumns([col('a')], 'S')).toHaveLength(1);
  });
});

const rows: ListRow[] = [
  { key: 'x', title: 'Item', detail: 'Now', value: '3d', tone: 'warning', to: '/x' },
  { key: 'y', title: 'Other', value: '1.2M', iskAmount: 1_200_000, tone: 'clear' },
];

describe('rowsToTable', () => {
  it('turns list rows into name, detail and value columns', () => {
    const table = rowsToTable(rows);
    expect(table.columns.map((c) => c.key)).toEqual(['title', 'detail', 'value']);
    expect(table.columns[2].align).toBe('end');
    expect(table.rows[0]).toEqual({
      key: 'x',
      cells: ['Item', 'Now', '3d'],
      tone: 'warning',
      to: '/x',
    });
  });

  it('keeps the exact ISK behind a figure', () => {
    expect(rowsToTable(rows).rows[1].cells[2]).toEqual({ text: '1.2M', iskAmount: 1_200_000 });
  });

  it('drops the detail column when no row has one', () => {
    const table = rowsToTable([rows[1]]);
    expect(table.columns.map((c) => c.key)).toEqual(['title', 'value']);
    expect(table.rows[0].cells).toHaveLength(2);
  });

  it('has no header labels, so the table draws no header row', () => {
    expect(rowsToTable(rows).columns.every((c) => c.label === '')).toBe(true);
  });

  it('shows the name and the value at Small, whatever the detail', () => {
    expect(visibleColumns(rowsToTable(rows).columns, 'S').map((c) => c.key)).toEqual([
      'title',
      'value',
    ]);
  });
});

describe('tableOf', () => {
  const base = { rows } as KindView;
  it('prefers the kind own table', () => {
    const table = { columns: [col('only')], rows: [] };
    expect(tableOf({ ...base, table })).toBe(table);
  });
  it('falls back to the list rows', () => {
    expect(tableOf(base).rows).toHaveLength(2);
  });
});

describe('fitColumns', () => {
  const wide = (key: string, minWidth?: number, priority?: number): TableColumn => ({
    key,
    label: key,
    minWidth,
    priority,
  });
  const keys = (cols: TableColumn[]) => cols.map((c) => c.key);

  it('keeps every column when they all fit', () => {
    const cols = [wide('a', 100), wide('b', 100), wide('c', 100)];
    expect(keys(fitColumns(cols, 300))).toEqual(['a', 'b', 'c']);
  });

  it('drops the worst priority first and keeps display order', () => {
    const cols = [wide('a', 100), wide('b', 100, 3), wide('c', 100, 1), wide('d', 100, 2)];
    expect(keys(fitColumns(cols, 300))).toEqual(['a', 'c', 'd']);
  });

  it('keeps the first column even when it is wider than the box', () => {
    const cols = [wide('a', 500), wide('b', 50)];
    expect(keys(fitColumns(cols, 200))).toEqual(['a']);
  });

  it('counts a missing minWidth as 64', () => {
    const cols = [wide('a'), wide('b'), wide('c')];
    expect(keys(fitColumns(cols, 128))).toEqual(['a', 'b']);
  });

  it('stops at the first column that does not fit, never skipping to a smaller one', () => {
    const cols = [wide('a', 100), wide('b', 300, 1), wide('c', 50, 2)];
    expect(keys(fitColumns(cols, 200))).toEqual(['a']);
  });
});
