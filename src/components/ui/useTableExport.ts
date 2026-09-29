/**
 * The data half of table export (see `TableExport.tsx` for the menus): what
 * a table exports, the context DataTable publishes it through, and the hook
 * that wires a table and its title-bar menu to the same rows.
 */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { CsvColumn } from '@/lib/csv';
import type { ExportSurface } from '@/lib/downloadCsv';
import type { DataTableExportHandle } from './DataTable';

/** What a table exports and under what file name. */
export interface TableExportConfig<T> {
  surface: ExportSurface;
  columns: readonly CsvColumn<T>[];
  /** A fetch that stopped short — files get a `-partial` suffix. */
  truncated?: boolean;
  /** Folded into the filename (a corp wallet division's name). */
  qualifier?: string;
  /**
   * Overrides where DataTable's menus read rows from. Set by
   * `useTableExport` with `source: 'rows'`, for a table shown capped (a
   * "Show all" button) whose export must still hold every row.
   */
  getRows?: () => readonly unknown[];
}

/** A config plus where its rows come from, read at export time. */
export interface TableExport<T> extends Omit<TableExportConfig<T>, 'getRows'> {
  getRows: () => readonly T[];
}

/**
 * Published by DataTable to its rows, so `RowActionsMenu` can append the
 * submenu to every row's menu without each row wrapper knowing about it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are opaque here; the pair is typed where it's built
export const TableExportContext = createContext<TableExport<any> | null>(null);

export function useTableExportContext(): TableExport<unknown> | null {
  return useContext(TableExportContext);
}

export interface UseTableExport<T> extends TableExport<T> {
  /** Spread onto the `DataTable` that shows these rows. */
  tableProps: {
    exportable: TableExportConfig<T>;
    exportRef: RefObject<DataTableExportHandle<T> | null>;
  };
}

/**
 * `rows` is what the caller hands the table (already filtered); the export
 * reads the table's sorted copy when it's mounted and falls back to `rows`.
 * With `source: 'rows'` it always exports `rows` as given — for a table that
 * mounts only the first N of a list the caller has already sorted.
 */
export function useTableExport<T>({
  surface,
  columns,
  rows,
  truncated,
  qualifier,
  source = 'table',
}: Omit<TableExportConfig<T>, 'getRows'> & {
  rows: readonly T[];
  source?: 'table' | 'rows';
}): UseTableExport<T> {
  const exportRef = useRef<DataTableExportHandle<T> | null>(null);
  // Read at export time only, so the latest committed rows are enough.
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  return useMemo(() => {
    const fromRows = () => rowsRef.current;
    const config: TableExportConfig<T> = {
      surface,
      columns,
      truncated,
      qualifier,
      getRows: source === 'rows' ? fromRows : undefined,
    };
    return {
      ...config,
      getRows: source === 'rows' ? fromRows : () => exportRef.current?.getRows() ?? fromRows(),
      tableProps: { exportable: config, exportRef },
    };
  }, [surface, columns, truncated, qualifier, source]);
}
