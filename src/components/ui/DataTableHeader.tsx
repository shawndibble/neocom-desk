import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, interactiveClassName } from './controlStyles';
import * as Icon from './icons';
import { InfoTooltip } from './Tooltip';
import { stickyStartClass } from './dataTableSticky';
import type { DataTableColumn, DataTableSort } from './DataTable';

interface Props<T> {
  columns: readonly DataTableColumn<T>[];
  headerTextClass: string[];
  sort: DataTableSort | null;
  density: 'default' | 'compact';
  isStacked: boolean;
  expandable: boolean;
  rowMoreActions: boolean;
  onToggleSort: (column: DataTableColumn<T>) => void;
}

/** The `<thead>` of `DataTable`: sort buttons, header tooltips, trailing cells. */
export function DataTableHeader<T>({
  columns,
  headerTextClass,
  sort,
  density,
  isStacked,
  expandable,
  rowMoreActions,
  onToggleSort,
}: Props<T>): ReactNode {
  const { t } = useTranslation();
  return (
    <thead role="rowgroup">
      <tr role="row" className="border-b border-line text-left text-text-dim">
        {columns.map((column, i) => {
          const sortable = column.sortValue !== undefined;
          const active = sortable && sort?.columnId === column.id;
          const direction = active ? sort.direction : undefined;
          // Unsorted columns get the neutral up/down glyph, so a sortable
          // column advertises itself before anyone clicks it.
          const SortGlyph = !active
            ? Icon.Sort
            : direction === 'asc'
              ? Icon.Ascending
              : Icon.Descending;
          // Its own `<button>`, beside the sort button rather than inside
          // it (nested buttons are invalid HTML).
          const info = column.headerTooltip && (
            <InfoTooltip
              label={t('common.aboutLabel', { label: column.header })}
              content={column.headerTooltip}
              className={cx('normal-case', sortable && (density === 'compact' ? 'mr-2' : 'mr-3'))}
            />
          );
          return (
            <th
              key={column.id}
              role="columnheader"
              scope="col"
              className={cx(
                sortable ? 'p-0' : headerTextClass[i],
                column.stickyStart && stickyStartClass(column),
                column.phoneHidden && !isStacked && 'max-sm:hidden',
                column.headerCellClassName
              )}
              aria-sort={
                sortable
                  ? active
                    ? direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined
              }
            >
              {sortable ? (
                <span
                  className={cx('flex items-center', column.align === 'center' && 'justify-center')}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSort(column)}
                    className={cx(
                      headerTextClass[i],
                      'inline-flex items-center gap-1 hover:text-text active:text-text-dim',
                      interactiveClassName,
                      focusRingInsetClassName,
                      // Only a right-aligned label fills the cell (it is
                      // already pushed against the "?"); left/center ones
                      // stay content-width so the "?" sits beside them.
                      column.align === 'right' && 'flex-1 justify-end'
                    )}
                  >
                    {column.header}
                    <SortGlyph
                      aria-hidden="true"
                      size={Icon.ICON_SIZE.sm}
                      className={cx('shrink-0', active ? 'text-accent' : 'text-text-faint')}
                    />
                  </button>
                  {info}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  {column.header}
                  {info}
                </span>
              )}
            </th>
          );
        })}
        {expandable && (
          <th role="columnheader" scope="col" aria-hidden="true" className="w-0 p-0" />
        )}
        {rowMoreActions && (
          // `relative`: the `sr-only` label below has no explicit
          // top/left, so its used position falls back to its own static
          // position — past this trailing column, at the table's right
          // edge. With no positioned ancestor, that resolves the label's
          // containing block above any `overflow-x-auto` wrapper a caller
          // puts around this table, so a wide table (#2093) keeps
          // stretching that ancestor's scrollable region even though the
          // wrapper visually clips everything else. This `<th>` being
          // positioned gives the label a containing block that's already
          // inside the clip.
          <th role="columnheader" scope="col" className="relative w-0 p-0">
            <span className="sr-only">{t('common.dataTable.actionsHeader')}</span>
          </th>
        )}
      </tr>
    </thead>
  );
}
