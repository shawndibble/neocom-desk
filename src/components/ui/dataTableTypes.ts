import type { ReactElement, ReactNode, Ref } from 'react';
import type { DataTableExportHandle, TableExportConfig } from './useTableExport';

export interface DataTableSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface DataTableColumn<T> {
  id: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  cellClassName?: (row: T) => string | undefined;
  headerClassName?: string;
  headerCellClassName?: string;
  width?: string;
  minWidth?: string;
  stickyStart?: boolean;
  stickyStartOnPanel?: boolean;
  headerTooltip?: string;
  phoneHidden?: boolean;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | undefined;
  sortFirst?: 'asc' | 'desc';
  primary?: boolean;
  cardCorner?: boolean | 'start';
  cardActions?: boolean;
  stackAffix?: { before?: string; after?: string };
  stackEdge?: 'start' | 'end' | 'below';
}

export interface DataTableExpandableRow<T> {
  renderDetail: (row: T) => ReactNode;
  hideIcon?: boolean;
  leadingIcon?: boolean;
  trigger?: 'row' | 'button';
  toggleLabel?: (row: T) => string;
  initialKey?: string | number | null;
  onExpandedChange?: (key: string | number | null) => void;
}

export interface DataTableGroupBy<T> {
  key: (row: T) => string | null;
  renderHeader: (rows: readonly T[]) => ReactNode;
  defaultExpanded?: (rows: readonly T[]) => boolean;
  allWidths?: boolean;
  minSize?: number;
  groupCompare?: (a: readonly T[], b: readonly T[]) => number;
}

export interface DataTableProps<T> {
  /** @summary Column definitions: header text, cell renderer and optional sort value. */
  columns: readonly DataTableColumn<T>[];
  /** @summary The data to show; one entry per table row. */
  rows: readonly T[];
  /**
   * @summary Stable unique key per row.
   */
  rowKey: (row: T, index: number) => string | number;
  rowClassName?: (row: T) => string | undefined;
  highlightRowKey?: string | number | null;
  selectedRowKey?: string | number | null;
  /** @summary Accessible name for the table. */
  label: string;
  className?: string;
  defaultSort?: DataTableSort;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
  density?: 'default' | 'compact';
  rowContextMenu?: (row: T, tr: ReactElement) => ReactElement;
  rowMoreActions?: boolean;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string | undefined;
  rowClickable?: (row: T) => boolean;
  expandableRow?: DataTableExpandableRow<T>;
  responsive?: 'stack' | 'table';
  stackColumns?: 1 | 2;
  stackLayout?: 'labelled' | 'dense';
  stacked?: boolean;
  mobileSort?: boolean;
  stackSummary?: ReactNode;
  stackActions?: ReactNode;
  groupBy?: DataTableGroupBy<T>;
  fullWidthRow?: (row: T) => ReactNode | null;
  rowBoundary?: { beforeKey: string | number; children: ReactNode };
  virtualize?: boolean | 'auto';
  hugColumns?: boolean;
  stickyHeader?: boolean;
  exportRef?: Ref<DataTableExportHandle<T>>;
  exportable?: TableExportConfig<T>;
}
