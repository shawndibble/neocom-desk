/**
 * The data half of table export (see `TableExport.tsx` for the menus): what
 * a table exports, the context DataTable publishes it through, and the hook
 * that wires a table and its title-bar menu to the same rows.
 */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { CsvColumn } from '@/lib/csv';
import type { ExportSurface } from '@/lib/downloadCsv';
/** What `DataTable`'s `exportRef` exposes: its rows, filtered by the caller and sorted as displayed. */
export interface DataTableExportHandle<T> {
  getRows: () => readonly T[];
  /**
   * Orders any row list by the table's current sort — for an export of more
   * rows than the table mounts (a capped "Show all" list), so the file still
   * follows the column the reader sorted by.
   */
  sortRows: (rows: readonly T[]) => readonly T[];
}

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
   * `useTableExport` with `source: 'rows' | 'sorted-rows'`, for an export
   * holding more (or other) rows than the table mounts.
   */
  getRows?: () => readonly T[];
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
 * `source: 'rows'` always exports `rows` exactly as given — for a raw
 * table, or one export spanning several DataTables (grouped tables), where
 * one table's sort must not reorder the whole set. `source: 'sorted-rows'`
 * exports every one of `rows` in the mounted table's current sort — for a
 * table that mounts only the first N behind "Show all".
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
  source?: 'table' | 'rows' | 'sorted-rows';
}): UseTableExport<T> {
  const exportRef = useRef<DataTableExportHandle<T> | null>(null);
  // Read at export time only, so the latest committed rows are enough.
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  return useMemo(() => {
    // Every ref read happens at export time, inside these functions.
    function readRows(): readonly T[] {
      const table = exportRef.current;
      const given = rowsRef.current;
      if (source === 'rows') return given;
      // Every row the caller holds, in the mounted table's current sort.
      if (source === 'sorted-rows') return table ? table.sortRows(given) : given;
      return table ? table.getRows() : given;
    }
    const config: TableExportConfig<T> = {
      surface,
      columns,
      truncated,
      qualifier,
      // DataTable reads its own sorted rows unless the export holds other rows.
      getRows: source === 'table' ? undefined : readRows,
    };
    return {
      ...config,
      getRows: readRows,
      tableProps: { exportable: config, exportRef },
    };
  }, [surface, columns, truncated, qualifier, source]);
}
