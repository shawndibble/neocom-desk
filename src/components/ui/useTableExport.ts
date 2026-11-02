/**
 * The data half of table export (see `TableExport.tsx` for the menus): what
 * a table exports, the context DataTable publishes it through, and the hook
 * that wires a table and its title-bar menu to the same rows.
 */
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
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
  /**
   * Called when any menu showing this table's export items opens (the header
   * menu, a row's right-click or ⋮ menu): for rows that need data fetched
   * lazily, so the load starts before a format is picked.
   */
  onExportIntent?: () => void;
}

/** A config plus where its rows come from, read at export time. */
export interface TableExport<T> extends Omit<TableExportConfig<T>, 'getRows'> {
  getRows: () => readonly T[];
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
  onExportIntent,
  source = 'table',
}: Omit<TableExportConfig<T>, 'getRows'> & {
  /** A function builds the rows only when an export runs, for rows costly to derive. */
  rows: readonly T[] | (() => readonly T[]);
  source?: 'table' | 'rows' | 'sorted-rows';
}): UseTableExport<T> {
  const exportRef = useRef<DataTableExportHandle<T> | null>(null);
  // Read at export time only, so the latest committed rows are enough.
  const rowsRef = useRef(rows);
  const intentRef = useRef(onExportIntent);
  useLayoutEffect(() => {
    rowsRef.current = rows;
    intentRef.current = onExportIntent;
  }, [rows, onExportIntent]);
  return useMemo(() => {
    // Every ref read happens at export time, inside these functions.
    function readRows(): readonly T[] {
      const table = exportRef.current;
      const rowSource = rowsRef.current;
      const given = typeof rowSource === 'function' ? rowSource() : rowSource;
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
      onExportIntent: () => intentRef.current?.(),
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
