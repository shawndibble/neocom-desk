import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { CsvColumn } from '@/lib/csv';
import type { ExportSurface } from '@/lib/downloadCsv';
export interface DataTableExportHandle<T> {
  getRows: () => readonly T[];
  sortRows: (rows: readonly T[]) => readonly T[];
}

export interface TableExportConfig<T> {
  surface: ExportSurface;
  columns: readonly CsvColumn<T>[];
  truncated?: boolean;
  qualifier?: string;
  getRows?: () => readonly T[];
  onExportIntent?: () => void;
}

export interface TableExport<T> extends Omit<TableExportConfig<T>, 'getRows'> {
  getRows: () => readonly T[];
}

export interface UseTableExport<T> extends TableExport<T> {
  tableProps: {
    exportable: TableExportConfig<T>;
    exportRef: RefObject<DataTableExportHandle<T> | null>;
  };
}

export function useTableExport<T>({
  surface,
  columns,
  rows,
  truncated,
  qualifier,
  onExportIntent,
  source = 'table',
}: Omit<TableExportConfig<T>, 'getRows'> & {
  rows: readonly T[] | (() => readonly T[]);
  source?: 'table' | 'rows' | 'sorted-rows';
}): UseTableExport<T> {
  const exportRef = useRef<DataTableExportHandle<T> | null>(null);
  const rowsRef = useRef(rows);
  const intentRef = useRef(onExportIntent);
  useLayoutEffect(() => {
    rowsRef.current = rows;
    intentRef.current = onExportIntent;
  }, [rows, onExportIntent]);
  return useMemo(() => {
    function readRows(): readonly T[] {
      const table = exportRef.current;
      const rowSource = rowsRef.current;
      const given = typeof rowSource === 'function' ? rowSource() : rowSource;
      if (source === 'rows') return given;
      if (source === 'sorted-rows') return table ? table.sortRows(given) : given;
      return table ? table.getRows() : given;
    }
    const config: TableExportConfig<T> = {
      surface,
      columns,
      truncated,
      qualifier,
      onExportIntent: () => intentRef.current?.(),
      getRows: source === 'table' ? undefined : readRows,
    };
    return {
      ...config,
      getRows: readRows,
      tableProps: { exportable: config, exportRef },
    };
  }, [surface, columns, truncated, qualifier, source]);
}
