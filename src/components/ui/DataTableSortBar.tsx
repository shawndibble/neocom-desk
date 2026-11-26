import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { DataTableSortPicker } from './DataTableSortPicker';
import type { DataTableColumn, DataTableSort } from './DataTable';

interface DataTableSortBarProps<T> {
  sortableColumns: readonly DataTableColumn<T>[];
  sort: DataTableSort | undefined;
  onSortChange: (sort: DataTableSort) => void;
  rows: readonly T[];
  summary?: ReactNode;
  actions?: ReactNode;
  stacked: boolean | undefined;
}

export function DataTableSortBar<T>({
  sortableColumns,
  sort,
  onSortChange,
  rows,
  summary,
  actions,
  stacked,
}: DataTableSortBarProps<T>) {
  return (
    <div
      className={cx(
        'flex min-h-[3.25rem] items-center justify-between gap-3 px-3',
        stacked === undefined && 'sm:hidden'
      )}
    >
      {summary !== undefined && (
        <span className="min-w-0 text-[0.6875rem] text-text-dim">{summary}</span>
      )}
      <DataTableSortPicker
        columns={sortableColumns}
        sort={sort}
        onSortChange={onSortChange}
        rows={rows}
        className="ml-auto"
      />
      {actions}
    </div>
  );
}
